import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const taxRouter = express.Router();

/**
 * List tax rules
 */
taxRouter.get('/', authenticateToken, (req, res) => {
  try {
    const rules = db.prepare('SELECT * FROM tax_rules WHERE active = 1 ORDER BY is_default DESC, name ASC').all();
    return res.json({ tax_rules: rules });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch tax rules' });
  }
});

/**
 * Create tax rule (Admin only)
 */
taxRouter.post('/', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    const { name, rate_percentage, is_default } = req.body;

    if (!name || rate_percentage === undefined) {
      return res.status(400).json({ error: 'Tax name and rate percentage are required' });
    }

    const id = crypto.randomUUID();

    if (is_default) {
      db.prepare('UPDATE tax_rules SET is_default = 0').run();
    }

    db.prepare(`
      INSERT INTO tax_rules (id, name, rate_percentage, is_default)
      VALUES (?, ?, ?, ?)
    `).run(id, name.trim(), parseFloat(rate_percentage) || 0.0, is_default ? 1 : 0);

    const created = db.prepare('SELECT * FROM tax_rules WHERE id = ?').get(id);
    return res.status(201).json({ message: 'Tax rule created successfully', tax_rule: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create tax rule' });
  }
});

/**
 * Update tax rule (Admin only)
 */
taxRouter.put('/:id', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    const { name, rate_percentage, is_default, active } = req.body;
    const ruleId = req.params.id;

    if (is_default) {
      db.prepare('UPDATE tax_rules SET is_default = 0 WHERE id != ?').run(ruleId);
    }

    db.prepare(`
      UPDATE tax_rules
      SET name = COALESCE(?, name),
          rate_percentage = COALESCE(?, rate_percentage),
          is_default = COALESCE(?, is_default),
          active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      rate_percentage !== undefined ? parseFloat(rate_percentage) : null,
      is_default !== undefined ? (is_default ? 1 : 0) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      ruleId
    );

    const updated = db.prepare('SELECT * FROM tax_rules WHERE id = ?').get(ruleId);
    return res.json({ message: 'Tax rule updated successfully', tax_rule: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update tax rule' });
  }
});
