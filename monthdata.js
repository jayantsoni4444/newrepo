const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

/* ================== MIDDLEWARE ================== */
app.use(cors());
app.use(express.json());

/* ================== ENV ================== */
const PORT = process.env.PORT || 5001;

/* ================== MongoDB Connection ================== */
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB Atlas Connected"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  });

/* ================== Schema ================== */
const roundSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["Assigned", "Pending", "Resolved"],
    default: "Assigned",
  },
  additionalStatus: { type: String, default: "Action Required" },
  additionalOptions: {
    type: [String],
    default: [
      "Action Required",
      "Forward",
      "Specialist Assignment",
      "Investigation",
    ],
  },
  from: { type: String, default: "" },
  to: { type: String, default: "" },
  timeIn: { type: String, default: "" },
  timeOut: { type: String, default: "" },
  mode: { type: String, default: "" },
  km: { type: String, default: "" },
  amount: { type: String, default: "" },
  problem: { type: String, default: "" },
  actionTaken: { type: String, default: "" },
  serial: { type: String, default: "" },
  otp: { type: String, default: "" },
  dop: { type: String, default: "" },
  invoice: { type: String, default: "" },
  time: { type: String, default: () => new Date().toLocaleString() },
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  media: {
    image1: { type: String, default: "" },
    image2: { type: String, default: "" },
    image3: { type: String, default: "" },
    video1: { type: String, default: "" },
  },
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  complaintNumber: String,
  assignEngineer: String,
  taskStatus: String,
  additionalStatus: String,
  date: String,
  name: String,
  phone: String,
  state: String,
  product: String,
  purchaseDate: String,
  serialNumber: String,
  actionTaken: String,
  enginnerNotes: String,
  complaintNotes: String,
  customerFeedback: String,
  actionTaken: { type: String, default: "" },
  selectedModel: { model: String },
  rounds: [roundSchema],
}, { timestamps: true });

const Task = mongoose.model("Task", taskSchema);

/* ================== ROUTES ================== */

// ✅ Health check
app.get("/", (req, res) => {
  res.send("🚀 API is running...");
});

/* ============================================================
   🔹 GET ALL TASKS — PAGINATED + MONTH/YEAR + SEARCH + STATUS
   Rounds ARE included (no .select("-rounds"))
============================================================ */
app.get("/tasks", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const {
      search,
      status,
      engineer,
      month,
      year,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    const filter = {};

    if (status && status !== "All") {
      filter.taskStatus = status;
    }

    if (engineer && engineer !== "All") {
      filter.assignEngineer = engineer;
    }

    /* ============ MONTH + YEAR FILTER ============ */
    if (month && year) {
      const mm = String(month).padStart(2, "0");
      const yyyy = String(year);

      filter.$or = [
        { date: { $regex: `/${mm}/${yyyy}$` } },   // DD/MM/YYYY
        { date: { $regex: `-${mm}-${yyyy}$` } },   // DD-MM-YYYY
        { date: { $regex: `^${yyyy}-${mm}` } },    // YYYY-MM-DD
        { date: { $regex: `^${yyyy}/${mm}` } },    // YYYY/MM/DD
      ];
    }

    /* ============ SEARCH ============ */
    if (search) {
      const regex = new RegExp(search, "i");
      const searchOr = [
        { complaintNumber: regex },
        { name: regex },
        { phone: regex },
        { title: regex },
        { assignEngineer: regex },
      ];

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    const sortObj = { [sort]: order === "asc" ? 1 : -1 };

    // ✅ Parallel query. NO .select("-rounds") → rounds ARE returned
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter),
    ]);

    res.json({
      data: tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Get single task
app.get("/tasks/:taskId", async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Create new task
app.post("/tasks", async (req, res) => {
  try {
    const task = new Task(req.body);
    const saved = await task.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Add round to task
app.post("/tasks/:taskId/round", async (req, res) => {
  try {
    const { taskId } = req.params;
    const round = req.body || {};

    if (!["Assigned", "Pending", "Resolved"].includes(round.status)) {
      return res.status(400).json({
        error: `Invalid status: "${round.status}". Must be Assigned, Pending, or Resolved.`,
      });
    }

    // ✅ Ensure `rounds` is an array
    await Task.updateOne(
      { _id: taskId, $or: [{ rounds: null }, { rounds: { $exists: false } }] },
      { $set: { rounds: [] } }
    );

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        media: req.body.media || {},
        $push: { rounds: round },
        $set: {
          taskStatus: round.status,                       // ✅ status only: "Resolved"
          additionalStatus: round.additionalStatus || "",
          additionalStatus: round.additionalStatus || "",
          purchaseDate: round.dop || round.purchaseDate || "",   // ✅ here
          serialNumber: round.serial || " " || "",   // ✅ here
          enginnerNotes: round.actionTaken || "",
          actionTaken: round.time || "",
          complaintNotes: round.problem || "",
          customerFeedback: round.invoice || "",
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error("❌ Round save error:", err.name, "-", err.message);
    res.status(500).json({
      error: err.message,
      details: err.errors ? Object.keys(err.errors) : undefined,
    });
  }
});
// 🔹 Delete task
app.delete("/tasks/:taskId", async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.taskId);
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== SERVER ================== */
app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});



// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// require("dotenv").config();

// const app = express();

// /* ================== MIDDLEWARE ================== */
// app.use(cors());
// app.use(express.json());

// /* ================== ENV ================== */
// const PORT = process.env.PORT || 5001;

// /* ================== MongoDB Connection ================== */
// mongoose.connect(process.env.MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
// .then(() => console.log("✅ MongoDB Atlas Connected"))
// .catch(err => {
//   console.error("❌ MongoDB Connection Error:", err.message);
//   process.exit(1);
// });

// /* ================== Schema ================== */
// const roundSchema = new mongoose.Schema({
//   status: {
//     type: String,
//     enum: ["Assigned", "Pending", "Resolved"],
//     default: "Assigned",
//   },
//   additionalStatus: { type: String, default: "Action Required" },
//   additionalOptions: {
//     type: [String],
//     default: [
//       "Action Required",
//       "Forward",
//       "Specialist Assignment",
//       "Investigation",
//     ],
//   },
//   from: { type: String, default: "" },
//   to: { type: String, default: "" },
//   timeIn: { type: String, default: "" },
//   timeOut: { type: String, default: "" },
//   mode: { type: String, default: "" },
//   km: { type: String, default: "" },
//   amount: { type: String, default: "" },
//   problem: { type: String, default: "" },
//   actionTaken: { type: String, default: "" },
//   serial: { type: String, default: "" },
//   otp: { type: String, default: "" },
//   dop: { type: String, default: "" },
//   invoice: { type: String, default: "" },
//   time: { type: String, default: () => new Date().toLocaleString() },
//   location: {
//     lat: { type: Number, default: null },
//     lng: { type: Number, default: null },
//   },
// }, { timestamps: true });

// const taskSchema = new mongoose.Schema({
//   title: { type: String, default: "" },
//   description: { type: String, default: "" },
//   complaintNumber: String,
//   assignEngineer: String,
//   taskStatus: String,
//   additionalStatus: String,
//   date: String,
//   name: String,
//   phone: String,
//   state: String,
//   product: String,
//   selectedModel: { model: String },
//   rounds: [roundSchema],
// }, { timestamps: true });

// const Task = mongoose.model("Task", taskSchema);

// /* ================== ROUTES ================== */

// // ✅ Health check
// app.get("/", (req, res) => {
//   res.send("🚀 API is running...");
// });

// /* ============================================================
//    🔹 GET ALL TASKS — PAGINATED + MONTH/YEAR + SEARCH + STATUS
//    Rounds ARE included (no .select("-rounds") anywhere)
// ============================================================ */
// app.get("/tasks", async (req, res) => {
//   try {
//     const page = Math.max(parseInt(req.query.page) || 1, 1);
//     const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//     const skip = (page - 1) * limit;

//     const {
//       search,
//       status,
//       engineer,
//       month,
//       year,
//       sort = "createdAt",
//       order = "desc",
//     } = req.query;

//     const filter = {};

//     if (status && status !== "All") {
//       filter.taskStatus = status;
//     }

//     if (engineer && engineer !== "All") {
//       filter.assignEngineer = engineer;
//     }

//     /* ============ MONTH + YEAR FILTER ============ */
//     // task.date is stored as a STRING (e.g. "19/09/2025" or "2025-09-19")
//     if (month && year) {
//       const mm = String(month).padStart(2, "0");
//       const yyyy = String(year);

//       filter.$or = [
//         { date: { $regex: `/${mm}/${yyyy}$` } },   // DD/MM/YYYY
//         { date: { $regex: `-${mm}-${yyyy}$` } },   // DD-MM-YYYY
//         { date: { $regex: `^${yyyy}-${mm}` } },    // YYYY-MM-DD
//         { date: { $regex: `^${yyyy}/${mm}` } },    // YYYY/MM/DD
//       ];
//     }

//     /* ============ SEARCH ============ */
//     if (search) {
//       const regex = new RegExp(search, "i");
//       const searchOr = [
//         { complaintNumber: regex },
//         { name: regex },
//         { phone: regex },
//         { title: regex },
//         { assignEngineer: regex },
//       ];

//       if (filter.$or) {
//         filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
//         delete filter.$or;
//       } else {
//         filter.$or = searchOr;
//       }
//     }

//     const sortObj = { [sort]: order === "asc" ? 1 : -1 };

//     // ✅ Parallel query for speed. NO .select("-rounds") → rounds ARE returned
//     const [tasks, total] = await Promise.all([
//       Task.find(filter)
//         .sort(sortObj)
//         .skip(skip)
//         .limit(limit)
//         .lean(),
//       Task.countDocuments(filter),
//     ]);

//     res.json({
//       data: tasks,
//       pagination: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//         hasNext: page * limit < total,
//         hasPrev: page > 1,
//       },
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 🔹 Get single task
// app.get("/tasks/:taskId", async (req, res) => {
//   try {
//     const task = await Task.findById(req.params.taskId);
//     if (!task) return res.status(404).json({ error: "Task not found" });
//     res.json(task);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 🔹 Create new task
// app.post("/tasks", async (req, res) => {
//   try {
//     const task = new Task(req.body);
//     const saved = await task.save();
//     res.status(201).json(saved);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 🔹 Add round to task
// app.post("/tasks/:taskId/round", async (req, res) => {
//   try {
//     const { taskId } = req.params;

//     const updatedTask = await Task.findByIdAndUpdate(
//       taskId,
//       { $push: { rounds: req.body } },
//       { new: true }
//     );

//     if (!updatedTask) {
//       return res.status(404).json({ error: "Task not found" });
//     }

//     res.json(updatedTask);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 🔹 Delete task
// app.delete("/tasks/:taskId", async (req, res) => {
//   try {
//     await Task.findByIdAndDelete(req.params.taskId);
//     res.json({ message: "Task deleted" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// /* ================== SERVER ================== */
// app.listen(PORT, () => {
//   console.log(`🔥 Server running on port ${PORT}`);
// });


// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const compression = require("compression");
// const NodeCache = require("node-cache");

// const app = express();

// app.use(cors());
// app.use(express.json({ limit: "10mb" }));
// app.use(compression());

// // ========================================
// // 🧠 Cache
// // ========================================
// const cache = new NodeCache({
//   stdTTL: 300, // 5 minutes
// });

// // ========================================
// // 🔗 MongoDB Connection
// // ========================================
// const MONGODB_URI =
//   "mongodb+srv://oshan:oshan%40work1234@cluster0.2txxi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// mongoose
//   .connect(MONGODB_URI, {
//     maxPoolSize: 10,
//   })
//   .then(() => console.log("✅ MongoDB Connected Successfully"))
//   .catch((err) => {
//     console.error("❌ MongoDB connection error:", err);
//   });

// // ========================================
// // 📦 Task Schema
// // ========================================
// const taskSchema = new mongoose.Schema(
//   {
//     complaintNumber: { type: String, index: true },
//     name: String,
//     email: String,
//     phone: String,
//     altPhone: String,
//     state: String,
//     city: String,
//     pincode: String,
//     location: String,
//     landmark: String,
//     product: String,
//     selectedModel: {
//       model: String,
//       capacity: String,
//       warranty: Number,
//     },
//     serialNumber: String,
//     warrantyStatus: {
//       status: String,
//       expiryDate: String,
//     },
//     purchaseDate: String,
//     installationDate: String,
//     callType: String,
//     condition: String,
//     callSource: String,
//     taskStatus: String,
//     assignEngineer: String,
//     contactNo: String,
//     dealer: String,
//     date: String,
//     asp: String,
//     aspName: String,
//     actionTaken: String,
//     customerFeedback: String,
//     enginnerNotes: String,
//     images: [String],
//     status: String,
//     complaintNotes: String,
//     additionalStatus: String,
//     generatedOtps: String,
//   },
//   {
//     timestamps: true,
//   }
// );

// // ========================================
// // ⚡ Indexes
// // ========================================
// taskSchema.index({ complaintNumber: 1 });
// taskSchema.index({ serialNumber: 1 });
// taskSchema.index({ phone: 1 });
// taskSchema.index({ assignEngineer: 1 });
// taskSchema.index({ status: 1 });
// taskSchema.index({ taskStatus: 1 });
// taskSchema.index({ city: 1 });
// taskSchema.index({ date: 1 });
// taskSchema.index({ createdAt: -1 });

// const Task = mongoose.model("Task", taskSchema);

// // ========================================
// // 🛠️ HELPER: Parse month string
// // Supports: "2025-01", "01", "January", "Jan", 1
// // ========================================
// const MONTH_NAMES = {
//   january: 0, jan: 0,
//   february: 1, feb: 1,
//   march: 2, mar: 2,
//   april: 3, apr: 3,
//   may: 4,
//   june: 5, jun: 5,
//   july: 6, jul: 6,
//   august: 7, aug: 7,
//   september: 8, sep: 8, sept: 8,
//   october: 9, oct: 9,
//   november: 10, nov: 10,
//   december: 11, dec: 11,
// };

// function parseMonth(monthStr) {
//   if (monthStr === undefined || monthStr === null || monthStr === "") {
//     return null;
//   }

//   const str = String(monthStr).trim().toLowerCase();

//   // Format: "2025-01" or "2025-1"
//   const yyyymm = str.match(/^(\d{4})-(\d{1,2})$/);
//   if (yyyymm) {
//     const year = parseInt(yyyymm[1], 10);
//     const month = parseInt(yyyymm[2], 10) - 1;
//     if (month >= 0 && month <= 11) return { year, month };
//   }

//   // Format: "2025/01"
//   const yyyy_slash = str.match(/^(\d{4})\/(\d{1,2})$/);
//   if (yyyy_slash) {
//     const year = parseInt(yyyy_slash[1], 10);
//     const month = parseInt(yyyy_slash[2], 10) - 1;
//     if (month >= 0 && month <= 11) return { year, month };
//   }

//   // Format: month name (january, jan)
//   if (MONTH_NAMES[str] !== undefined) {
//     return { month: MONTH_NAMES[str] };
//   }

//   // Format: numeric 1-12
//   const num = parseInt(str, 10);
//   if (!isNaN(num) && num >= 1 && num <= 12) {
//     return { month: num - 1 };
//   }

//   return null;
// }

// // ========================================
// // 🛠️ HELPER: Build date range from query
// // ========================================
// function buildDateRange({ month, year, fromDate, toDate }) {
//   // Custom range takes priority
//   if (fromDate || toDate) {
//     const range = {};
//     if (fromDate) {
//       const start = new Date(fromDate);
//       if (!isNaN(start.getTime())) {
//         range.$gte = start;
//       }
//     }
//     if (toDate) {
//       const end = new Date(toDate);
//       if (!isNaN(end.getTime())) {
//         // Include full end day
//         end.setUTCHours(23, 59, 59, 999);
//         range.$lte = end;
//       }
//     }
//     return Object.keys(range).length ? range : null;
//   }

//   // Month-based range
//   if (!month && !year) return null;

//   const parsed = parseMonth(month);
//   const now = new Date();

//   let targetYear;
//   let targetMonth;

//   if (parsed) {
//     targetYear = parsed.year !== undefined ? parsed.year : (year ? parseInt(year, 10) : now.getUTCFullYear());
//     targetMonth = parsed.month;
//   } else if (year) {
//     // Year only — full year range
//     targetYear = parseInt(year, 10);
//     targetMonth = null;
//   } else {
//     return null;
//   }

//   let start, end;

//   if (targetMonth !== null && targetMonth !== undefined) {
//     start = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0));
//     end = new Date(Date.UTC(targetYear, targetMonth + 1, 1, 0, 0, 0));
//   } else {
//     // Full year
//     start = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0));
//     end = new Date(Date.UTC(targetYear + 1, 0, 1, 0, 0, 0));
//   }

//   return { $gte: start, $lt: end };
// }

// // ========================================
// // ➕ ADD TASK
// // ========================================
// app.post("/tasks", async (req, res) => {
//   try {
//     const data = req.body;

//     let result;

//     if (Array.isArray(data)) {
//       result = await Task.insertMany(data, {
//         ordered: false,
//       });
//     } else {
//       const task = new Task(data);
//       result = await task.save();
//     }

//     cache.flushAll();

//     res.status(201).json(result);
//   } catch (err) {
//     console.error("❌ Error saving task:", err);

//     res.status(500).json({
//       error: "Failed to save task.",
//     });
//   }
// });

// // ========================================
// // 📋 GET TASKS (with month-wise filter)
// // ========================================
// app.get("/tasks", async (req, res) => {
//   try {
//     const {
//       complaintNumber,
//       username,
//       engineer,
//       status,
//       month,
//       year,
//       fromDate,
//       toDate,
//       dateField, // "createdAt" (default) or "date"
//     } = req.query;

//     // ========================================
//     // 🧠 Cache Key
//     // ========================================
//     const cacheKey = `tasks_${complaintNumber || "all"}_${
//       username || "all"
//     }_${engineer || "all"}_${status || "all"}_${month || "all"}_${
//       year || "all"
//     }_${fromDate || "all"}_${toDate || "all"}_${dateField || "createdAt"}`;

//     if (cache.has(cacheKey)) {
//       console.log("⚡ Cache Hit");
//       return res.json(cache.get(cacheKey));
//     }

//     console.log("🐢 Cache Miss - Fetching from DB");

//     // ========================================
//     // 🔎 Build Query
//     // ========================================
//     const query = {};

//     if (complaintNumber) {
//       query.complaintNumber = complaintNumber;
//     }

//     if (username) {
//       query.name = {
//         $regex: username,
//         $options: "i",
//       };
//     }

//     if (engineer) {
//       query.assignEngineer = engineer;
//     }

//     if (status) {
//       query.status = status;
//     }

//     // ========================================
//     // 📅 Month / Date Range Filter
//     // ========================================
//     const dateRange = buildDateRange({ month, year, fromDate, toDate });

//     if (dateRange) {
//       const field = dateField === "date" ? "date" : "createdAt";

//       if (field === "date") {
//         // `date` is a String field — convert range to ISO strings
//         const stringRange = {};
//         if (dateRange.$gte) {
//           stringRange.$gte = dateRange.$gte.toISOString().split("T")[0];
//         }
//         if (dateRange.$lt) {
//           stringRange.$lt = dateRange.$lt.toISOString().split("T")[0];
//         }
//         if (dateRange.$lte) {
//           stringRange.$lte = dateRange.$lte.toISOString().split("T")[0];
//         }
//         query.date = stringRange;
//       } else {
//         query.createdAt = dateRange;
//       }
//     }

//     // ========================================
//     // ⚡ FETCH
//     // ========================================
//     const data = await Task.find(query)
//       .select(
//         `
//         complaintNumber
//         name
//         phone
//         state
//         city
//         pincode
//         location
//         landmark
//         product
//         selectedModel
//         serialNumber
//         warrantyStatus
//         purchaseDate
//         installationDate
//         callType
//         condition
//         callSource
//         taskStatus
//         assignEngineer
//         contactNo
//         dealer
//         date
//         asp
//         aspName
//         status
//         additionalStatus
//         createdAt
//         updatedAt
//         `
//       )
//       .sort({ createdAt: -1 })
//       .lean();

//     cache.set(cacheKey, data);

//     console.log(`✅ Returned ${data.length} tasks`);

//     res.json(data);
//   } catch (err) {
//     console.error("❌ Fetch error:", err);

//     res.status(500).json({
//       error: "Failed to fetch tasks.",
//     });
//   }
// });

// // ========================================
// // 📊 GET MONTH-WISE SUMMARY
// // Returns count per month for a given year
// // ========================================
// app.get("/tasks/month-wise/summary", async (req, res) => {
//   try {
//     const { year, engineer, status } = req.query;

//     const targetYear = year
//       ? parseInt(year, 10)
//       : new Date().getUTCFullYear();

//     const cacheKey = `tasks_monthwise_${targetYear}_${engineer || "all"}_${
//       status || "all"
//     }`;

//     if (cache.has(cacheKey)) {
//       console.log("⚡ Cache Hit (month-wise)");
//       return res.json(cache.get(cacheKey));
//     }

//     const match = {
//       createdAt: {
//         $gte: new Date(Date.UTC(targetYear, 0, 1)),
//         $lt: new Date(Date.UTC(targetYear + 1, 0, 1)),
//       },
//     };

//     if (engineer) match.assignEngineer = engineer;
//     if (status) match.status = status;

//     const data = await Task.aggregate([
//       { $match: match },
//       {
//         $group: {
//           _id: {
//             year: { $year: "$createdAt" },
//             month: { $month: "$createdAt" },
//           },
//           count: { $sum: 1 },
//         },
//       },
//       { $sort: { "_id.month": 1 } },
//     ]);

//     // Fill all 12 months (0 if no data)
//     const monthNames = [
//       "January", "February", "March", "April", "May", "June",
//       "July", "August", "September", "October", "November", "December",
//     ];

//     const result = monthNames.map((name, idx) => {
//       const found = data.find((d) => d._id.month === idx + 1);
//       return {
//         month: idx + 1,
//         monthName: name,
//         year: targetYear,
//         count: found ? found.count : 0,
//       };
//     });

//     cache.set(cacheKey, result);

//     res.json({
//       year: targetYear,
//       total: result.reduce((sum, m) => sum + m.count, 0),
//       months: result,
//     });
//   } catch (err) {
//     console.error("❌ Month-wise summary error:", err);
//     res.status(500).json({
//       error: "Failed to fetch month-wise summary.",
//     });
//   }
// });

// // ========================================
// // 🔍 GET SINGLE TASK
// // ========================================
// app.get("/tasks/:id", async (req, res) => {
//   try {
//     const task = await Task.findById(req.params.id).lean();

//     if (!task) {
//       return res.status(404).json({ error: "Task not found" });
//     }

//     res.json(task);
//   } catch (err) {
//     console.error("❌ Fetch task error:", err);
//     res.status(500).json({ error: "Failed to fetch task" });
//   }
// });

// // ========================================
// // ✏️ UPDATE TASK
// // ========================================
// app.put("/tasks/:id", async (req, res) => {
//   try {
//     const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
//       new: true,
//       runValidators: true,
//     }).lean();

//     if (!task) {
//       return res.status(404).json({ error: "Task not found" });
//     }

//     cache.flushAll();

//     res.json(task);
//   } catch (err) {
//     console.error("❌ Update error:", err);
//     res.status(500).json({ error: "Failed to update task." });
//   }
// });

// // ========================================
// // 🗑️ DELETE TASK
// // ========================================
// app.delete("/tasks/:id", async (req, res) => {
//   try {
//     const task = await Task.findByIdAndDelete(req.params.id);

//     if (!task) {
//       return res.status(404).json({ error: "Task not found" });
//     }

//     cache.flushAll();

//     res.json({ message: "Deleted successfully" });
//   } catch (err) {
//     console.error("❌ Delete error:", err);
//     res.status(500).json({ error: "Failed to delete task." });
//   }
// });

// // ========================================
// // 🌍 START SERVER
// // ========================================
// const PORT = process.env.PORT || 5002;

// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });
