import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const planRouter = express.Router();

/**
 * List all active subscription plans
 */
planRouter.get('/', authenticateToken, (req, res) => {
  try {
    const plans = db.prepare(`
      SELECT * FROM plans WHERE active = 1 ORDER BY price ASC
    `).all();

    return res.json({ plans });
  } catch (err) {
    console.error('List plans error:', err);
    return res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * Get single plan
 */
planRouter.get('/:id', authenticateToken, (req, res) => {
  try {
    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    return res.json({ plan });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch plan' });
  }
});

/**
 * Create new Plan (Admin & Staff)
 */
planRouter.post('/', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const {
      name,
      price,
      billing_frequency,
      min_quantity,
      available_from,
      available_to,
      auto_close,
      can_close_early,
      can_pause,
      can_renew
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Plan name and price are required' });
    }

    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    const frequency = validFrequencies.includes(billing_frequency) ? billing_frequency : 'monthly';

    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO plans (
        id, name, price, billing_frequency, min_quantity,
        available_from, available_to, auto_close, can_close_early, can_pause, can_renew
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      parseFloat(price) || 0.0,
      frequency,
      parseInt(min_quantity, 10) || 1,
      available_from || null,
      available_to || null,
      auto_close ? 1 : 0,
      can_close_early !== undefined ? (can_close_early ? 1 : 0) : 1,
      can_pause !== undefined ? (can_pause ? 1 : 0) : 1,
      can_renew !== undefined ? (can_renew ? 1 : 0) : 1
    );

    const created = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    return res.status(201).json({
      message: 'Plan created successfully',
      plan: created
    });
  } catch (err) {
    console.error('Create plan error:', err);
    return res.status(500).json({ error: 'Failed to create plan' });
  }
});

/**
 * Update Plan
 */
planRouter.put('/:id', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const planId = req.params.id;
    const existing = db.prepare('SELECT id FROM plans WHERE id = ?').get(planId);
    if (!existing) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const {
      name,
      price,
      billing_frequency,
      min_quantity,
      available_from,
      available_to,
      auto_close,
      can_close_early,
      can_pause,
      can_renew,
      active
    } = req.body;

    db.prepare(`
      UPDATE plans
      SET name = COALESCE(?, name),
          price = COALESCE(?, price),
          billing_frequency = COALESCE(?, billing_frequency),
          min_quantity = COALESCE(?, min_quantity),
          available_from = COALESCE(?, available_from),
          available_to = COALESCE(?, available_to),
          auto_close = COALESCE(?, auto_close),
          can_close_early = COALESCE(?, can_close_early),
          can_pause = COALESCE(?, can_pause),
          can_renew = COALESCE(?, can_renew),
          active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      price !== undefined ? parseFloat(price) : null,
      billing_frequency || null,
      min_quantity !== undefined ? parseInt(min_quantity, 10) : null,
      available_from !== undefined ? available_from : null,
      available_to !== undefined ? available_to : null,
      auto_close !== undefined ? (auto_close ? 1 : 0) : null,
      can_close_early !== undefined ? (can_close_early ? 1 : 0) : null,
      can_pause !== undefined ? (can_pause ? 1 : 0) : null,
      can_renew !== undefined ? (can_renew ? 1 : 0) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      planId
    );

    const updated = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
    return res.json({ message: 'Plan updated successfully', plan: updated });
  } catch (err) {
    console.error('Update plan error:', err);
    return res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * Archive Plan
 */
planRouter.delete('/:id', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    db.prepare('UPDATE plans SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ message: 'Plan archived successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to archive plan' });
  }
});
