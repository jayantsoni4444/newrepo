const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// === Config ===
const PORT = 5000;
const MONGODB_URI = 'mongodb+srv://ages27771:ages12345@cluster0.t2zpj0w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// === App Setup ===
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === MongoDB Connection ===
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// === Schemas ===
const productSchema = new mongoose.Schema({
  hsnCode: { type: String, default: '' },
  product: { type: String, default: '' },
  model: { type: String, default: '' },
  quantity: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  initialProductState: { type: String, default: '' }
}, { _id: false }); // No _id for subdocuments to keep payload clean

const courierSchema = new mongoose.Schema({
  dispatchLocation: { type: String, default: '' },
  deleiveryNote: { type: String, default: '' },
  deleveryNote: { type: String, default: '' },
  dated: { type: String, default: '' },
  docket: { type: String, default: '' },
  buyer: { type: String, default: '' },
  otherRef: { type: String, default: '' },
  refernceNO: { type: String, default: '' },
  mode: { type: String, default: '' },
  invoiceno: { type: String, default: '' },
  currentdate: { type: String, default: '' },
  courierName: { type: String, default: '' },
  termsofdeleivery: { type: String, default: '' }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  partyType: { type: String, default: '' },
  companyName: { type: String, default: '' },
  personName: { type: String, default: '' },
  gstuin: { type: String, default: '' },
  address: { type: String, default: '' },
  statename: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  companyFormation: { type: String, default: 'Milenium Company' },
  courier: { type: courierSchema, default: () => ({}) },
  productDetails: { type: [productSchema], default: [] },
  spgsDetails: { type: [productSchema], default: [] },
  focDetails: { type: [productSchema], default: [] }
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

// === Helper: sanitize number fields ===
// Prevents Mongoose CastError when frontend sends "" for quantity/price/etc.
const toNum = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sanitizeProducts = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => ({
    hsnCode: p.hsnCode ?? '',
    product: p.product ?? '',
    model: p.model ?? '',
    quantity: toNum(p.quantity),
    price: toNum(p.price),
    igst: toNum(p.igst),
    discount: toNum(p.discount),
    totalAmount: toNum(p.totalAmount),
    initialProductState: p.initialProductState ?? ''
  }));
};

const sanitizeInvoice = (body = {}) => {
  const courier = body.courier || {};
  return {
    partyType: body.partyType ?? '',
    companyName: body.companyName ?? '',
    personName: body.personName ?? '',
    gstuin: body.gstuin ?? '',
    address: body.address ?? '',
    statename: body.statename ?? '',
    contactNumber: String(body.contactNumber ?? ''),
    companyFormation: body.companyFormation ?? 'Milenium Company',
    courier: {
      dispatchLocation: courier.dispatchLocation ?? '',
      deleiveryNote: courier.deleiveryNote ?? '',
      deleveryNote: courier.deleveryNote ?? '',
      dated: courier.dated ?? '',
      docket: courier.docket ?? '',
      buyer: courier.buyer ?? '',
      otherRef: courier.otherRef ?? '',
      refernceNO: courier.refernceNO ?? '',
      mode: courier.mode ?? '',
      invoiceno: courier.invoiceno ?? '',
      currentdate: courier.currentdate ?? '',
      courierName: courier.courierName ?? '',
      termsofdeleivery: courier.termsofdeleivery ?? ''
    },
    productDetails: sanitizeProducts(body.productDetails),
    spgsDetails: sanitizeProducts(body.spgsDetails),
    focDetails: sanitizeProducts(body.focDetails)
  };
};

// === API Routes (all under /api/newinvoice to match frontend) ===

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Invoice API running' });
});

// GET all invoices
app.get('/api/newinvoice', async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    console.error('GET /api/newinvoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET one invoice
app.get('/api/newinvoice/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new invoice
app.post('/api/newinvoice', async (req, res) => {
  try {
    const clean = sanitizeInvoice(req.body);
    const invoice = new Invoice(clean);
    const saved = await invoice.save();
    console.log('✅ Invoice created:', saved._id);
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/newinvoice error:', err.message);
    console.error('Body was:', JSON.stringify(req.body, null, 2));
    res.status(400).json({ error: err.message });
  }
});

// PUT update invoice
app.put('/api/newinvoice/:id', async (req, res) => {
  try {
    const clean = sanitizeInvoice(req.body);
    const updated = await Invoice.findByIdAndUpdate(req.params.id, clean, {
      new: true,
      runValidators: true
    });
    if (!updated) return res.status(404).json({ error: 'Invoice not found' });
    console.log('✏️  Invoice updated:', updated._id);
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/newinvoice error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// DELETE invoice
app.delete('/api/newinvoice/:id', async (req, res) => {
  try {
    const deleted = await Invoice.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Invoice not found' });
    console.log('🗑️  Invoice deleted:', req.params.id);
    res.json({ message: 'Invoice deleted', id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// === Backward-compat aliases (in case old frontend still calls /api/Chalan) ===
app.get('/api/Chalan', (req, res) => res.redirect(307, '/api/newinvoice'));
app.post('/api/Chalan', (req, res, next) => { req.url = '/api/newinvoice'; next(); });
// (add others if needed; or just remove after frontend migration)

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});