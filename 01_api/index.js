const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/uploads', express.static('uploads'));

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'products_db',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// ============ ROUTES ============

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ 
      status: 'ok', 
      db: rows[0].ok === 1,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('Health check error:', e);
    res.status(500).json({ 
      status: 'error', 
      message: e.message 
    });
  }
});

// Get all products with pagination and filters
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
    const params = [];
    const countParams = [];
    
    // Add category filter
    if (category) {
      query += ' AND category = ?';
      countQuery += ' AND category = ?';
      params.push(category);
      countParams.push(category);
    }
    
    // Add search filter
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      countQuery += ' AND (name LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm);
    }
    
    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [products] = await pool.query(query, params);
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    
    res.json({
      data: products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (e) {
    console.error('Get products error:', e);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const [products] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(products[0]);
  } catch (e) {
    console.error('Get product error:', e);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create new product
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, slug, description, price, category, stock } = req.body;
    
    // Validate required fields
    if (!name || !slug || !price || !category) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, slug, price, category' 
      });
    }
    
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    const [result] = await pool.query(
      'INSERT INTO products (name, slug, description, price, category, stock, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, slug, description || null, parseFloat(price), category, parseInt(stock) || 0, imageUrl]
    );
    
    const [newProduct] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json(newProduct[0]);
  } catch (e) {
    console.error('Create product error:', e);
    
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Product slug already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, slug, description, price, category, stock } = req.body;
    
    // Check if product exists
    const [existing] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : existing[0].imageUrl;
    
    await pool.query(
      'UPDATE products SET name = ?, slug = ?, description = ?, price = ?, category = ?, stock = ?, imageUrl = ? WHERE id = ?',
      [name, slug, description || null, parseFloat(price), category, parseInt(stock) || 0, imageUrl, req.params.id]
    );
    
    const [updated] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    
    res.json(updated[0]);
  } catch (e) {
    console.error('Update product error:', e);
    
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Product slug already exists' });
    }
    
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ 
      message: 'Product deleted successfully',
      id: req.params.id 
    });
  } catch (e) {
    console.error('Delete product error:', e);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Start server
const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 API server listening on http://localhost:${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🛍️  Products API: http://localhost:${port}/api/products`);
});