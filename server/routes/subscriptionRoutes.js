import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const subscriptionRouter = express.Router();

/**
 * Helper to calculate next billing date based on frequency
 */
export function getNextBillingDate(currentDateStr, frequency) {
  const date = new Date(currentDateStr);
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * List Subscriptions
 * - Admin/Staff: Sees all subscriptions, filterable by status, customer, plan
 * - Customer: Only sees their own subscriptions
 */
subscriptionRouter.get('/', authenticateToken, (req, res) => {
  try {
    const { status, customer_id, plan_id } = req.query;
    let query = `
      SELECT s.*, 
             u.name as customer_name, u.email as customer_email, u.company_name,
             p.name as plan_name, p.billing_frequency, p.price as plan_price,
             p.auto_close, p.can_close_early, p.can_pause, p.can_renew,
             dr.code as discount_code, dr.name as discount_name, dr.type as discount_type, dr.value as discount_value
      FROM subscriptions s
      JOIN users u ON s.customer_id = u.id
      JOIN plans p ON s.plan_id = p.id
      LEFT JOIN discount_rules dr ON s.discount_rule_id = dr.id
      WHERE 1=1
    `;
    const params = [];

    // Customer role restriction
    if (req.user.role === 'CUSTOMER') {
      query += ' AND s.customer_id = ?';
      params.push(req.user.id);
    } else if (customer_id) {
      query += ' AND s.customer_id = ?';
      params.push(customer_id);
    }

    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }

    if (plan_id) {
      query += ' AND s.plan_id = ?';
      params.push(plan_id);
    }

    query += ' ORDER BY s.created_at DESC';

    const subscriptions = db.prepare(query).all(...params);

    // Fetch lines for each subscription
    const subIds = subscriptions.map(s => s.id);
    let allLines = [];
    if (subIds.length > 0) {
      const placeholders = subIds.map(() => '?').join(',');
      allLines = db.prepare(`
        SELECT sl.*, pr.name as product_name, pv.variant_name, tr.name as tax_name, tr.rate_percentage as tax_rate
        FROM subscription_lines sl
        JOIN products pr ON sl.product_id = pr.id
        LEFT JOIN product_variants pv ON sl.variant_id = pv.id
        LEFT JOIN tax_rules tr ON sl.tax_rule_id = tr.id
        WHERE sl.subscription_id IN (${placeholders})
      `).all(...subIds);
    }

    const linesBySub = {};
    for (const l of allLines) {
      if (!linesBySub[l.subscription_id]) {
        linesBySub[l.subscription_id] = [];
      }
      linesBySub[l.subscription_id].push(l);
    }

    const result = subscriptions.map(s => {
      const lines = linesBySub[s.id] || [];
      const subtotal = lines.reduce((acc, l) => acc + (l.subtotal || 0), 0);
      const taxAmount = lines.reduce((acc, l) => acc + (l.tax_amount || 0), 0);
      const total = lines.reduce((acc, l) => acc + (l.total || 0), 0);

      return {
        ...s,
        lines,
        computed_subtotal: subtotal,
        computed_tax: taxAmount,
        computed_total: total
      };
    });

    return res.json({ subscriptions: result });
  } catch (err) {
    console.error('List subscriptions error:', err);
    return res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * Get single subscription details
 */
subscriptionRouter.get('/:id', authenticateToken, (req, res) => {
  try {
    const subId = req.params.id;
    const sub = db.prepare(`
      SELECT s.*, 
             u.name as customer_name, u.email as customer_email, u.company_name, u.phone as customer_phone,
             p.name as plan_name, p.billing_frequency, p.price as plan_price,
             p.auto_close, p.can_close_early, p.can_pause, p.can_renew,
             dr.code as discount_code, dr.name as discount_name, dr.type as discount_type, dr.value as discount_value
      FROM subscriptions s
      JOIN users u ON s.customer_id = u.id
      JOIN plans p ON s.plan_id = p.id
      LEFT JOIN discount_rules dr ON s.discount_rule_id = dr.id
      WHERE s.id = ?
    `).get(subId);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (req.user.role === 'CUSTOMER' && sub.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const lines = db.prepare(`
      SELECT sl.*, pr.name as product_name, pv.variant_name, pv.price_adjustment, tr.name as tax_name, tr.rate_percentage as tax_rate
      FROM subscription_lines sl
      JOIN products pr ON sl.product_id = pr.id
      LEFT JOIN product_variants pv ON sl.variant_id = pv.id
      LEFT JOIN tax_rules tr ON sl.tax_rule_id = tr.id
      WHERE sl.subscription_id = ?
    `).all(subId);

    return res.json({ subscription: { ...sub, lines } });
  } catch (err) {
    console.error('Get subscription error:', err);
    return res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * Create new Subscription (Admin, Staff, or Customer through self-service)
 */
subscriptionRouter.post('/', authenticateToken, (req, res) => {
  try {
    let {
      customer_id,
      plan_id,
      start_date,
      expiry_date,
      payment_terms,
      discount_rule_id,
      notes,
      lines,
      status
    } = req.body;

    // If customer, customer_id is strictly their own
    if (req.user.role === 'CUSTOMER') {
      customer_id = req.user.id;
      status = 'Quotation'; // Customer starts as quote or draft
    }

    if (!customer_id || !plan_id) {
      return res.status(400).json({ error: 'Customer and Plan are required' });
    }

    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
    if (!plan) {
      return res.status(400).json({ error: 'Selected plan not found' });
    }

    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM subscriptions').get();
    const nextSeq = (countRow.cnt + 1).toString().padStart(5, '0');
    const subNumber = `SUB-${nextSeq}`;
    const subId = crypto.randomUUID();

    const startDateVal = start_date || new Date().toISOString().slice(0, 10);
    const nextBilling = startDateVal;

    db.prepare(`
      INSERT INTO subscriptions (
        id, sub_number, customer_id, plan_id, status,
        start_date, expiry_date, payment_terms, next_billing_date,
        discount_rule_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      subId,
      subNumber,
      customer_id,
      plan_id,
      status || 'Draft',
      startDateVal,
      expiry_date || null,
      payment_terms || 'Net 15',
      nextBilling,
      discount_rule_id || null,
      notes || null
    );

    // Default tax rule
    const defaultTax = db.prepare('SELECT id, rate_percentage FROM tax_rules WHERE is_default = 1 AND active = 1 LIMIT 1').get() ||
                       db.prepare('SELECT id, rate_percentage FROM tax_rules WHERE active = 1 LIMIT 1').get();
    const defaultTaxRate = defaultTax ? defaultTax.rate_percentage : 10.0;
    const defaultTaxId = defaultTax ? defaultTax.id : null;

    if (Array.isArray(lines) && lines.length > 0) {
      const insertLine = db.prepare(`
        INSERT INTO subscription_lines (
          id, subscription_id, product_id, variant_id, quantity, unit_price, tax_rule_id, tax_amount, subtotal, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of lines) {
        const qty = parseInt(line.quantity, 10) || 1;
        const unitPrice = parseFloat(line.unit_price) || 0.0;
        const subtotal = qty * unitPrice;
        const taxRate = line.tax_rate !== undefined ? parseFloat(line.tax_rate) : defaultTaxRate;
        const taxAmount = (subtotal * taxRate) / 100;
        const total = subtotal + taxAmount;

        insertLine.run(
          crypto.randomUUID(),
          subId,
          line.product_id,
          line.variant_id || null,
          qty,
          unitPrice,
          line.tax_rule_id || defaultTaxId,
          taxAmount,
          subtotal,
          total
        );
      }
    }

    return res.status(201).json({
      message: 'Subscription created successfully',
      id: subId,
      sub_number: subNumber
    });
  } catch (err) {
    console.error('Create subscription error:', err);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * Update Subscription Lifecycle Status
 * Transitions: Draft -> Quotation -> Confirmed -> Active -> Closed / Paused / Renewed
 */
subscriptionRouter.patch('/:id/status', authenticateToken, (req, res) => {
  try {
    const { status, note } = req.body;
    const subId = req.params.id;

    const sub = db.prepare(`
      SELECT s.*, p.auto_close, p.can_close_early, p.can_pause, p.can_renew
      FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.id = ?
    `).get(subId);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Role check: If customer, enforce permissions
    if (req.user.role === 'CUSTOMER') {
      if (sub.customer_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Customer self-service checks
      if (status === 'Paused' && !sub.can_pause) {
        return res.status(400).json({ error: 'This subscription plan does not allow pausing.' });
      }
      if (status === 'Closed' && !sub.can_close_early) {
        return res.status(400).json({ error: 'This subscription plan does not allow early cancellation.' });
      }
      if (status === 'Active' && sub.status === 'Paused' && !sub.can_pause) {
        return res.status(400).json({ error: 'Resuming is not permitted for this plan.' });
      }
    }

    const allowedStatuses = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run(status, subId);

    return res.json({
      message: `Subscription status updated to ${status}`,
      status
    });
  } catch (err) {
    console.error('Update status error:', err);
    return res.status(500).json({ error: 'Failed to update subscription status' });
  }
});

/**
 * Renew Subscription (if plan permits can_renew)
 */
subscriptionRouter.post('/:id/renew', authenticateToken, (req, res) => {
  try {
    const subId = req.params.id;
    const sub = db.prepare(`
      SELECT s.*, p.billing_frequency, p.can_renew
      FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.id = ?
    `).get(subId);

    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (req.user.role === 'CUSTOMER' && sub.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!sub.can_renew) {
      return res.status(400).json({ error: 'This plan is not eligible for renewal.' });
    }

    const currentExpiry = sub.expiry_date || new Date().toISOString().slice(0, 10);
    const newExpiry = getNextBillingDate(currentExpiry, sub.billing_frequency);
    const newNextBilling = getNextBillingDate(sub.next_billing_date, sub.billing_frequency);

    db.prepare(`
      UPDATE subscriptions
      SET status = 'Active', expiry_date = ?, next_billing_date = ?
      WHERE id = ?
    `).run(newExpiry, newNextBilling, subId);

    return res.json({
      message: 'Subscription successfully renewed!',
      new_expiry: newExpiry,
      next_billing_date: newNextBilling,
      status: 'Active'
    });
  } catch (err) {
    console.error('Renew subscription error:', err);
    return res.status(500).json({ error: 'Failed to renew subscription' });
  }
});
