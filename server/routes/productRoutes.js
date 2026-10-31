import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const productRouter = express.Router();

/**
 * List all active products with their variants
 */
productRouter.get('/', authenticateToken, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT * FROM products WHERE active = 1 ORDER BY name ASC
    `).all();

    const variants = db.prepare(`
      SELECT * FROM product_variants
    `).all();

    // Group variants by product_id
    const variantsByProduct = {};
    for (const v of variants) {
      if (!variantsByProduct[v.product_id]) {
        variantsByProduct[v.product_id] = [];
      }
      variantsByProduct[v.product_id].push(v);
    }

    const result = products.map(p => ({
      ...p,
      variants: variantsByProduct[p.id] || []
    }));

    return res.json({ products: result });
  } catch (err) {
    console.error('List products error:', err);
    return res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * Get single product by ID
 */
productRouter.get('/:id', authenticateToken, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(req.params.id);
    return res.json({ product: { ...product, variants } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * Create new Product with Variants (Admin & Staff)
 */
productRouter.post('/', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { name, type, sales_price, cost_price, notes, variants } = req.body;

    if (!name || sales_price === undefined || sales_price === null) {
      return res.status(400).json({ error: 'Product name and sales price are required' });
    }

    const productId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO products (id, name, type, sales_price, cost_price, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      productId,
      name.trim(),
      type || 'software',
      parseFloat(sales_price) || 0.0,
      parseFloat(cost_price) || 0.0,
      notes || null
    );

    // Insert variants if provided
    if (Array.isArray(variants)) {
      const insertVariant = db.prepare(`
        INSERT INTO product_variants (id, product_id, variant_name, attribute_type, price_adjustment)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const v of variants) {
        if (v.variant_name && v.variant_name.trim()) {
          insertVariant.run(
            crypto.randomUUID(),
            productId,
            v.variant_name.trim(),
            v.attribute_type || 'brand',
            parseFloat(v.price_adjustment) || 0.0
          );
        }
      }
    }

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    const createdVariants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(productId);

    return res.status(201).json({
      message: 'Product created successfully',
      product: { ...created, variants: createdVariants }
    });
  } catch (err) {
    console.error('Create product error:', err);
    return res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * Update Product and its Variants
 */
productRouter.put('/:id', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { name, type, sales_price, cost_price, notes, active, variants } = req.body;
    const productId = req.params.id;

    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.prepare(`
      UPDATE products
      SET name = COALESCE(?, name),
          type = COALESCE(?, type),
          sales_price = COALESCE(?, sales_price),
          cost_price = COALESCE(?, cost_price),
          notes = COALESCE(?, notes),
          active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      type || null,
      sales_price !== undefined ? parseFloat(sales_price) : null,
      cost_price !== undefined ? parseFloat(cost_price) : null,
      notes !== undefined ? notes : null,
      active !== undefined ? (active ? 1 : 0) : null,
      productId
    );

    if (Array.isArray(variants)) {
      // Refresh variants
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
      const insertVariant = db.prepare(`
        INSERT INTO product_variants (id, product_id, variant_name, attribute_type, price_adjustment)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const v of variants) {
        if (v.variant_name && v.variant_name.trim()) {
          insertVariant.run(
            crypto.randomUUID(),
            productId,
            v.variant_name.trim(),
            v.attribute_type || 'brand',
            parseFloat(v.price_adjustment) || 0.0
          );
        }
      }
    }

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    const updatedVariants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(productId);

    return res.json({
      message: 'Product updated successfully',
      product: { ...updated, variants: updatedVariants }
    });
  } catch (err) {
    console.error('Update product error:', err);
    return res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * Delete / Archive Product
 */
productRouter.delete('/:id', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ message: 'Product archived successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to archive product' });
  }
});
