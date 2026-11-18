// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const PORT = process.env.PORT || 5000;
const MONGO_URI = "mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ==================== SCHEMAS ====================
const QuantitySchema = new mongoose.Schema(
  {
    inmodel: { type: String, default: "" },
    outmodel: { type: String, default: "" },
    desc: { type: String, default: "" },
    receiveqty: { type: String, default: "" },
    dispatchqty: { type: String, default: "" },
    pending: { type: String, default: "" },
    Extra: { type: String, default: "" },
    repaired: { type: String, default: "0" },
  },
  { _id: false }
);

const inventorySchema = new mongoose.Schema(
  {
    product: { type: String, default: "", index: true },
    inlocation: { type: String, default: "" },
    outlocation: { type: String, default: "" },
    indocket: { type: String, default: "" },
    outdocket: { type: String, default: "" },
    inchalan: { type: String, default: "" },
    outchalan: { type: String, default: "" },
    receivedate: { type: String, default: "" },
    dispatchdate: { type: String, default: "" },
    quantities: { type: [QuantitySchema], default: [] },
    // legacy fields
    date: String,
    partCode: String,
    inmodel: String,
    outmodel: String,
    desc: String,
    receiveqty: String,
    dispatchqty: String,
    pending: String,
    extra: String,
    model: String,
    capacity: String,
    currentStock: Number,
    stockIn: Number,
    stockOut: Number,
    total: Number,
  },
  { timestamps: true, strict: false }
);

const Inventory = mongoose.model("Inventory", inventorySchema);

// ==================== DB ====================
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ==================== HELPERS ====================
// ✅ SINGLE definition — includes repaired
function normalizeQuantities(quantities) {
  if (!Array.isArray(quantities)) return [];
  return quantities.map((q) => {
    const r = Number(q.receiveqty) || 0;
    const d = Number(q.dispatchqty) || 0;
    return {
      inmodel: q.inmodel ?? "",
      outmodel: q.outmodel ?? "",
      desc: q.desc ?? "",
      receiveqty: q.receiveqty != null ? String(q.receiveqty) : "",
      dispatchqty: q.dispatchqty != null ? String(q.dispatchqty) : "",
      pending: String(r - d),
      Extra: q.Extra ?? q.extra ?? "",
      repaired: q.repaired != null ? String(q.repaired) : "0", // ✅ preserved
    };
  });
}

function sanitizeBody(body) {
  return {
    product: body.product ?? body.vendor ?? "",
    inlocation: body.inlocation ?? "",
    outlocation: body.outlocation ?? "",
    indocket: body.indocket ?? "",
    outdocket: body.outdocket ?? "",
    inchalan: body.inchalan ?? "",
    outchalan: body.outchalan ?? "",
    receivedate: body.receivedate ?? "",
    dispatchdate: body.dispatchdate ?? "",
    quantities: normalizeQuantities(body.quantities),
  };
}

// ==================== ROUTES ====================
app.get("/", (req, res) => res.json({ status: "ok" }));

// GET all
app.get("/api/inventory", async (req, res) => {
  try {
    const items = await Inventory.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET unique product names
app.get("/api/inventory/products", async (req, res) => {
  try {
    const products = await Inventory.distinct("product");
    res.json(products.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ CREATE — restored
app.post("/api/inventory", async (req, res) => {
  try {
    console.log("📥 POST body:", JSON.stringify(req.body, null, 2));
    const clean = sanitizeBody(req.body);
    const newItem = new Inventory(clean);
    await newItem.save();
    console.log("💾 Saved ID:", newItem._id);
    res.status(201).json(newItem);
  } catch (err) {
    console.error("❌ POST error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Save repaired quantities for a task
app.put("/api/inventory/:id/repaired", async (req, res) => {
  try {
    const { repairedMap } = req.body;
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    item.quantities = item.quantities.map((q, i) => {
      const val = repairedMap[i] ?? q.repaired ?? "0";
      return { ...q.toObject(), repaired: String(val) };
    });

    await item.save();
    console.log("🛠️ Repaired saved for", item._id, "→", item.quantities.map(q => q.repaired));
    res.json(item);
  } catch (err) {
    console.error("repaired save error:", err);
    res.status(400).json({ error: err.message });
  }
});

// UPDATE
app.put("/api/inventory/:id", async (req, res) => {
  try {
    console.log("📝 PUT body:", JSON.stringify(req.body, null, 2));
    const clean = sanitizeBody(req.body);
    const updated = await Inventory.findByIdAndUpdate(req.params.id, clean, {
      new: true,
      runValidators: false,
    });
    if (!updated) return res.status(404).json({ error: "Item not found" });
    res.json(updated);
  } catch (err) {
    console.error("❌ PUT error:", err);
    res.status(400).json({ error: err.message });
  }
});

// DELETE
app.delete("/api/inventory/:id", async (req, res) => {
  try {
    const deleted = await Inventory.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Item not found" });
    res.json({ message: "Item deleted", id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// MIGRATE
app.post("/api/inventory/migrate", async (req, res) => {
  try {
    const all = await Inventory.find();
    let updated = 0;

    for (const item of all) {
      const hasQ = Array.isArray(item.quantities) && item.quantities.length > 0;
      if (!hasQ) {
        item.quantities = [
          {
            inmodel: item.inmodel ?? "",
            outmodel: item.outmodel ?? "",
            desc: item.desc ?? "",
            receiveqty: item.receiveqty ?? "",
            dispatchqty: item.dispatchqty ?? "",
            pending: item.pending ?? "",
            Extra: item.extra ?? "",
            repaired: "0",
          },
        ];
        await item.save();
        updated++;
      }
    }
    res.json({ message: `Migrated ${updated} of ${all.length} records` });
  } catch (err) {
    console.error("❌ MIGRATE error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});

// // server.js
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");

// // Environment variables (for MongoDB URI)
// const PORT = process.env.PORT || 5000;
//   const MONGO_URI = "mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
// // const MONGO_URI = "mongodb+srv://ages27771:ages12345@cluster0.t2zpj0w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// const app = express();
// app.use(cors());
// app.use(express.json());

// const QuantitySchema = new mongoose.Schema({
//   receiveqty: String,
//   dispatchqty: String,
//   pending: String,
//   Extra: String,
//   inmodel:String , outmodel:String , desc:String
// });

// // Mongoose Schema & Model
// const inventorySchema = new mongoose.Schema({
//   date: String,
//   partCode: String,
//   inlocation: String,
//   outlocation: String,
//   indocket: String,
//   outdocket: String,
//   inchalan: String,
//   outchalan: String,
//   receivedate: String,
//   dispatchdate: String,
//   inmodel: String,
//   outmodel: String,
//   desc: String,
//   receiveqty: String,
//   dispatchqty: String,
//   pending: String,
//   extra: String,
//   product: String,
//   model: String,
//   capacity: String,
//   currentStock: Number,
//   stockIn: Number,
//   stockOut: Number,
//   total: Number,
//   quantities: [QuantitySchema], // <-- Embedded subdocument array
// });

// const Inventory = mongoose.model("Inventory", inventorySchema);

// // Connect to MongoDB
// mongoose.connect(MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// }).then(() => console.log("✅ MongoDB Connected"))
//   .catch(err => console.error("❌ MongoDB Error:", err));

// // === API Routes ===

// // Get all inventory items
// app.get("/api/inventory", async (req, res) => {
//   try {
//     const items = await Inventory.find();
//     res.json(items);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // Create a new inventory item
// app.post("/api/inventory", async (req, res) => {
//   try {
//     const newItem = new Inventory(req.body);
//     await newItem.save();
//     res.status(201).json(newItem);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // Update an item by ID
// app.put("/api/inventory/:id", async (req, res) => {
//   try {
//     const updatedItem = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
//     res.json(updatedItem);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // Delete an item by ID
// app.delete("/api/inventory/:id", async (req, res) => {
//   try {
//     await Inventory.findByIdAndDelete(req.params.id);
//     res.json({ message: "Item deleted" });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // // Start the server
// // app.listen(PORT, () => {
// //   console.log(`🚀 Server running at http://localhost:${PORT}`);
// // });

// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
// });
