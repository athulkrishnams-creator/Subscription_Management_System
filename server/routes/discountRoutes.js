import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const discountRouter = express.Router();

/**
 * List all discount rules
 */
discountRouter.get('/', authenticateToken, (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT dr.*, p.name as target_product_name
      FROM discount_rules dr
      LEFT JOIN products p ON dr.target_product_id = p.id
      ORDER BY dr.created_at DESC
    `).all();

    return res.json({ discount_rules: rules });
  } catch (err) {
    console.error('List discount rules error:', err);
    return res.status(500).json({ error: 'Failed to fetch discount rules' });
  }
});

/**
 * Create discount rule - ONLY ADMIN CAN CREATE DISCOUNT RULES
 */
discountRouter.post('/', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    const {
      code,
      name,
      type,
      value,
      min_purchase_amount,
      min_quantity,
      start_date,
      end_date,
      max_uses,
      scope,
      target_product_id
    } = req.body;

    if (!code || !name || value === undefined) {
      return res.status(400).json({ error: 'Discount code, name, and value are required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM discount_rules WHERE code = ?').get(cleanCode);
    if (existing) {
      return res.status(409).json({ error: `Discount rule with code "${cleanCode}" already exists` });
    }

    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO discount_rules (
        id, code, name, type, value,
        min_purchase_amount, min_quantity, start_date, end_date,
        max_uses, times_used, scope, target_product_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      cleanCode,
      name.trim(),
      type === 'fixed' ? 'fixed' : 'percentage',
      parseFloat(value) || 0.0,
      parseFloat(min_purchase_amount) || 0.0,
      parseInt(min_quantity, 10) || 0,
      start_date || null,
      end_date || null,
      parseInt(max_uses, 10) || 0,
      scope === 'product' ? 'product' : 'subscription',
      target_product_id || null
    );

    const created = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(id);
    return res.status(201).json({
      message: 'Discount rule created successfully',
      discount_rule: created
    });
  } catch (err) {
    console.error('Create discount rule error:', err);
    return res.status(500).json({ error: 'Failed to create discount rule' });
  }
});

/**
 * Update discount rule (Admin only)
 */
discountRouter.put('/:id', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    const ruleId = req.params.id;
    const existing = db.prepare('SELECT id FROM discount_rules WHERE id = ?').get(ruleId);
    if (!existing) {
      return res.status(404).json({ error: 'Discount rule not found' });
    }

    const {
      name,
      type,
      value,
      min_purchase_amount,
      min_quantity,
      start_date,
      end_date,
      max_uses,
      scope,
      target_product_id,
      active
    } = req.body;

    db.prepare(`
      UPDATE discount_rules
      SET name = COALESCE(?, name),
          type = COALESCE(?, type),
          value = COALESCE(?, value),
          min_purchase_amount = COALESCE(?, min_purchase_amount),
          min_quantity = COALESCE(?, min_quantity),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          max_uses = COALESCE(?, max_uses),
          scope = COALESCE(?, scope),
          target_product_id = COALESCE(?, target_product_id),
          active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      type || null,
      value !== undefined ? parseFloat(value) : null,
      min_purchase_amount !== undefined ? parseFloat(min_purchase_amount) : null,
      min_quantity !== undefined ? parseInt(min_quantity, 10) : null,
      start_date !== undefined ? start_date : null,
      end_date !== undefined ? end_date : null,
      max_uses !== undefined ? parseInt(max_uses, 10) : null,
      scope || null,
      target_product_id !== undefined ? target_product_id : null,
      active !== undefined ? (active ? 1 : 0) : null,
      ruleId
    );

    const updated = db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(ruleId);
    return res.json({ message: 'Discount rule updated successfully', discount_rule: updated });
  } catch (err) {
    console.error('Update discount rule error:', err);
    return res.status(500).json({ error: 'Failed to update discount rule' });
  }
});

/**
 * Apply discount rule to a subscription
 */
discountRouter.post('/apply-to-subscription', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { subscription_id, discount_code } = req.body;
    if (!subscription_id || !discount_code) {
      return res.status(400).json({ error: 'Subscription ID and discount code are required' });
    }

    const rule = db.prepare('SELECT * FROM discount_rules WHERE code = ? AND active = 1').get(discount_code.trim().toUpperCase());
    if (!rule) {
      return res.status(404).json({ error: 'Invalid or inactive discount code' });
    }

    // Check validity dates
    const today = new Date().toISOString().slice(0, 10);
    if (rule.start_date && today < rule.start_date) {
      return res.status(400).json({ error: 'Discount code is not active yet' });
    }
    if (rule.end_date && today > rule.end_date) {
      return res.status(400).json({ error: 'Discount code has expired' });
    }

    // Check max uses
    if (rule.max_uses > 0 && rule.times_used >= rule.max_uses) {
      return res.status(400).json({ error: 'Discount code usage limit has been reached' });
    }

    db.prepare('UPDATE subscriptions SET discount_rule_id = ? WHERE id = ?').run(rule.id, subscription_id);

    return res.json({
      message: `Discount "${rule.name}" successfully attached to subscription. It will automatically apply on the next invoice.`,
      discount_rule: rule
    });
  } catch (err) {
    console.error('Apply discount error:', err);
    return res.status(500).json({ error: 'Failed to apply discount code' });
  }
});
