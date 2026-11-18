const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === Product sub-schema — matches ALL fields frontend sends ===
const productSchema = new mongoose.Schema({
  hsnCode: { type: String, default: '' },
  product:  { type: String, default: '' },
  model:    { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  price:    { type: Number, default: 0 },
  igst:     { type: Number, default: 0 },
  discount: { type: Number, default: 0 },   // <-- was missing in old backend
  totalAmount: { type: Number, default: 0 },
  initialProductState: { type: String, default: '' },
}, { _id: false });

const courierSchema = new mongoose.Schema({
  dispatchLocation: String, deleiveryNote: String, deleveryNote: String,
  dated: String, docket: String, buyer: String, otherRef: String,
  refernceNO: String, mode: String, invoiceno: String, currentdate: String,
  courierName: String, termsofdeleivery: String,
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  partyType: String,
  companyName: String,
  personName: String,
  gstuin: String,
  address: String,
  statename: String,
  contactNumber: String,
  companyFormation: String,
  courier: { type: courierSchema, default: () => ({}) },
  productDetails: { type: [productSchema], default: [] },
  spgsDetails:    { type: [productSchema], default: [] },  // <-- MUST be here
  focDetails:     { type: [productSchema], default: [] },  // <-- MUST be here
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

// === Numeric sanitizer — prevents CastError when frontend sends "" ===
const toNum = (v) => {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sanitizeProducts = (arr = []) =>
  (Array.isArray(arr) ? arr : []).map(p => ({
    hsnCode: p.hsnCode ?? '',
    product:  p.product  ?? '',
    model:    p.model    ?? '',
    quantity: toNum(p.quantity),
    price:    toNum(p.price),
    igst:     toNum(p.igst),
    discount: toNum(p.discount),
    totalAmount: toNum(p.totalAmount),
    initialProductState: p.initialProductState ?? '',
  }));

const sanitizeInvoice = (b = {}) => {
  const c = b.courier || {};
  return {
    partyType:        b.partyType ?? '',
    companyName:      b.companyName ?? '',
    personName:       b.personName ?? '',
    gstuin:           b.gstuin ?? '',
    address:          b.address ?? '',
    statename:        b.statename ?? '',
    contactNumber:    String(b.contactNumber ?? ''),
    companyFormation: b.companyFormation ?? 'Milenium Company',
    courier: c,
    productDetails: sanitizeProducts(b.productDetails),
    spgsDetails:    sanitizeProducts(b.spgsDetails),   // <-- copied
    focDetails:     sanitizeProducts(b.focDetails),    // <-- copied
  };
};

mongoose.connect('mongodb+srv://ages27771:ages12345@cluster0.t2zpj0w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// === Routes matching frontend (/api/newinvoice) ===
app.get('/api/newinvoice', async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/newinvoice', async (req, res) => {
  try {
    console.log('POST body keys:', Object.keys(req.body));
    console.log('spgsDetails received:', req.body.spgsDetails?.length, 'items');
    const invoice = new Invoice(sanitizeInvoice(req.body));
    const saved = await invoice.save();
    console.log('✅ Saved spgsDetails count:', saved.spgsDetails.length);
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/newinvoice/:id', async (req, res) => {
  try {
    const updated = await Invoice.findByIdAndUpdate(
      req.params.id,
      sanitizeInvoice(req.body),
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    console.log('✏️ Updated, spgsDetails count:', updated.spgsDetails.length);
    res.json(updated);
  } catch (err) {
    console.error('PUT error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/newinvoice/:id', async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));


// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const bodyParser = require('body-parser');

// // Initialize Express app
// const app = express();
// const PORT = 5000;

// // Middleware
// app.use(cors());  // Allow cross-origin requests
// app.use(bodyParser.json());  // Parse incoming JSON bodies

// // Mongoose model for Invoice
// const invoiceSchema = new mongoose.Schema({
//   companyName: { type: String, required: true },
//   personName: { type: String },
//   gstuin: { type: String },
//   address: { type: String, required: true },
//   statename: { type: String },
//   contactNumber: { type: String, required: true },
//   companyFormation: { type: String, default: 'Milenium Company' },
//   courier: {
//     dispatchLocation: { type: String },
//     deleiveryNote: { type: String },
//     dated: { type: String },
//     docket: { type: String },
//     buyer: { type: String },
//     otherRef: { type: String },
//     refernceNO: { type: String },
//     mode: { type: String },
//     deleveryNote: { type: String },
//     invoiceno: { type: String },
//     currentdate: { type: String },
//     courierName: { type: String },
//     termsofdeleivery: { type: String }
//   },
//   productDetails: [
//     {
//       hsnCode: { type: String },
//       product: { type: String },
//       model: { type: String },
//       quantity: { type: Number },
//       price: { type: Number },
//       igst: { type: Number },
//       discount: { type: Number },
//       totalAmount: { type: Number },
//     },
//   ],
//   spgsDetails: [
//     {
//       hsnCode: { type: String },
//       product: { type: String },
//       model: { type: String },
//       quantity: { type: Number },
//       price: { type: Number },
//       igst: { type: Number },
//       discount: { type: Number },
//       totalAmount: { type: Number },
//     },
//   ],
//   focDetails: [
//     {
//       hsnCode: { type: String },
//       product: { type: String },
//       model: { type: String },
//       quantity: { type: Number },
//       price: { type: Number },
//       igst: { type: Number },
//       discount: { type: Number },
//       totalAmount: { type: Number },
//     },
//   ]
// });


// // Mongoose Model for Invoice
// const Invoice = mongoose.model('Invoice', invoiceSchema);

// // Connect to MongoDB
// mongoose.connect('mongodb+srv://khushsoni839:ks1234@cluster0.u3hib.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
// // mongoose.connect('mongodb+srv://service:services1234@cluster0.wxa147v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
// // mongoose.connect('mongodb+srv://ages27771:ages12345@cluster0.t2zpj0w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
//   .then(() => {
//     console.log('Connected to MongoDB');
//   })
//   .catch((err) => {
//     console.error('Error connecting to MongoDB:', err);
//   });

// // GET route to fetch all invoices
// app.get('/api/newinvoice', async (req, res) => {
//   try {
//     const invoices = await Invoice.find();
//     res.status(200).json(invoices);
//   } catch (error) {
//     console.error('Error fetching invoices:', error);
//     res.status(500).json({ error: 'Error fetching invoices' });
//   }
// });

// // mongodb+srv://service:<db_password>@cluster0.wxa147v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

// // POST route to create a new invoice
// app.post('/api/newinvoice', async (req, res) => {
//   const {
//     companyName,
//     personName,
//     gstuin,
//     address,
//     statename,
//     contactNumber,
//     companyFormation,
//     courier,
//     productDetails,
//     spgsDetails,
//     focDetails
//   } = req.body;

//   const newInvoice = new Invoice({
//     companyName,
//     personName,
//     gstuin,
//     address,
//     statename,
//     contactNumber,
//     companyFormation,
//     courier,
//     productDetails,
//     spgsDetails,
//     focDetails
//   });

//   try {
//     const savedInvoice = await newInvoice.save();
//     res.status(201).json(savedInvoice);
//   } catch (error) {
//     console.error('Error saving invoice:', error);
//     res.status(400).json({ error: 'Error saving invoice' });
//   }
// });

// // PUT route to update an existing invoice
// app.put('/api/newinvoice/:id', async (req, res) => {
//   const { id } = req.params;
//   const {
//     companyName,
//     personName,
//     gstuin,
//     address,
//     statename,
//     contactNumber,
//     companyFormation,
//     courier,
//     productDetails,
//     spgsDetails,
//     focDetails
//   } = req.body;

//   try {
//     const updatedInvoice = await Invoice.findByIdAndUpdate(
//       id,
//       {
//         companyName,
//         personName,
//         gstuin,
//         address,
//         statename,
//         contactNumber,
//         companyFormation,
//         courier,
//         productDetails,
//         spgsDetails,
//         focDetails
//       },
//       { new: true }
//     );
//     res.status(200).json(updatedInvoice);
//   } catch (error) {
//     console.error('Error updating invoice:', error);
//     res.status(400).json({ error: 'Error updating invoice' });
//   }
// });


// // DELETE route to delete an invoice
// app.delete('/api/newinvoice/:id', async (req, res) => {
//   const { id } = req.params;

//   try {
//     await Invoice.findByIdAndDelete(id);
//     res.status(200).json({ message: 'Invoice deleted successfully' });
//   } catch (error) {
//     console.error('Error deleting invoice:', error);
//     res.status(400).json({ error: 'Error deleting invoice' });
//   }
// });

// // Start the server
// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });
