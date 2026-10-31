import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const quoteRouter = express.Router();

/**
 * List all quotation templates with line items and plan info
 */
quoteRouter.get('/templates', authenticateToken, (req, res) => {
  try {
    const templates = db.prepare(`
      SELECT qt.*, p.name as plan_name, p.billing_frequency, p.price as plan_price
      FROM quotation_templates qt
      LEFT JOIN plans p ON qt.plan_id = p.id
      ORDER BY qt.created_at DESC
    `).all();

    const lines = db.prepare(`
      SELECT qtl.*, pr.name as product_name, pv.variant_name, pv.price_adjustment
      FROM quotation_template_lines qtl
      JOIN products pr ON qtl.product_id = pr.id
      LEFT JOIN product_variants pv ON qtl.variant_id = pv.id
    `).all();

    const linesByTemplate = {};
    for (const line of lines) {
      if (!linesByTemplate[line.template_id]) {
        linesByTemplate[line.template_id] = [];
      }
      linesByTemplate[line.template_id].push(line);
    }

    const result = templates.map(t => ({
      ...t,
      lines: linesByTemplate[t.id] || []
    }));

    return res.json({ templates: result });
  } catch (err) {
    console.error('List quotation templates error:', err);
    return res.status(500).json({ error: 'Failed to fetch quotation templates' });
  }
});

/**
 * Get single quotation template
 */
quoteRouter.get('/templates/:id', authenticateToken, (req, res) => {
  try {
    const template = db.prepare(`
      SELECT qt.*, p.name as plan_name, p.billing_frequency, p.price as plan_price
      FROM quotation_templates qt
      LEFT JOIN plans p ON qt.plan_id = p.id
      WHERE qt.id = ?
    `).get(req.params.id);

    if (!template) {
      return res.status(404).json({ error: 'Quotation template not found' });
    }

    const lines = db.prepare(`
      SELECT qtl.*, pr.name as product_name, pv.variant_name, pv.price_adjustment
      FROM quotation_template_lines qtl
      JOIN products pr ON qtl.product_id = pr.id
      LEFT JOIN product_variants pv ON qtl.variant_id = pv.id
      WHERE qtl.template_id = ?
    `).all(req.params.id);

    return res.json({ template: { ...template, lines } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * Create quotation template
 */
quoteRouter.post('/templates', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { name, plan_id, validity_days, notes, lines } = req.body;

    if (!name || !plan_id) {
      return res.status(400).json({ error: 'Template name and plan are required' });
    }

    const templateId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO quotation_templates (id, name, plan_id, validity_days, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      templateId,
      name.trim(),
      plan_id,
      parseInt(validity_days, 10) || 30,
      notes || null
    );

    if (Array.isArray(lines) && lines.length > 0) {
      const insertLine = db.prepare(`
        INSERT INTO quotation_template_lines (id, template_id, product_id, variant_id, quantity, unit_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const line of lines) {
        insertLine.run(
          crypto.randomUUID(),
          templateId,
          line.product_id,
          line.variant_id || null,
          parseInt(line.quantity, 10) || 1,
          parseFloat(line.unit_price) || 0.0
        );
      }
    }

    return res.status(201).json({
      message: 'Quotation template created successfully',
      id: templateId
    });
  } catch (err) {
    console.error('Create template error:', err);
    return res.status(500).json({ error: 'Failed to create quotation template' });
  }
});

/**
 * Generate a new quotation/subscription draft from template for a customer
 */
quoteRouter.post('/templates/:id/instantiate', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { customer_id, start_date, payment_terms } = req.body;
    const templateId = req.params.id;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const template = db.prepare('SELECT * FROM quotation_templates WHERE id = ?').get(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(template.plan_id);
    if (!plan) {
      return res.status(400).json({ error: 'Template has invalid or missing plan' });
    }

    const defaultTax = db.prepare('SELECT id, rate_percentage FROM tax_rules WHERE is_default = 1 AND active = 1 LIMIT 1').get() ||
                       db.prepare('SELECT id, rate_percentage FROM tax_rules WHERE active = 1 LIMIT 1').get();

    const taxRate = defaultTax ? defaultTax.rate_percentage : 10.0;
    const taxRuleId = defaultTax ? defaultTax.id : null;

    // Generate Subscription Number: SUB-XXXXX
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM subscriptions').get();
    const nextSeq = (countRow.cnt + 1).toString().padStart(5, '0');
    const subNumber = `SUB-${nextSeq}`;

    const subId = crypto.randomUUID();
    const startDateVal = start_date || new Date().toISOString().slice(0, 10);
    
    // Calculate expiry based on template validity_days
    const validUntil = new Date(Date.now() + template.validity_days * 86400000).toISOString().slice(0, 10);
    
    // Next billing date is start_date
    const nextBilling = startDateVal;

    db.prepare(`
      INSERT INTO subscriptions (
        id, sub_number, customer_id, plan_id, status,
        start_date, expiry_date, payment_terms, next_billing_date, notes
      ) VALUES (?, ?, ?, ?, 'Quotation', ?, ?, ?, ?, ?)
    `).run(
      subId,
      subNumber,
      customer_id,
      template.plan_id,
      startDateVal,
      validUntil,
      payment_terms || 'Net 15',
      nextBilling,
      `Created from template: ${template.name}`
    );

    // Copy lines from template
    const templateLines = db.prepare('SELECT * FROM quotation_template_lines WHERE template_id = ?').all(templateId);
    const insertSubLine = db.prepare(`
      INSERT INTO subscription_lines (
        id, subscription_id, product_id, variant_id, quantity, unit_price, tax_rule_id, tax_amount, subtotal, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const tl of templateLines) {
      const qty = tl.quantity || 1;
      const unitPrice = tl.unit_price || 0.0;
      const subtotal = qty * unitPrice;
      const taxAmount = (subtotal * taxRate) / 100;
      const total = subtotal + taxAmount;

      insertSubLine.run(
        crypto.randomUUID(),
        subId,
        tl.product_id,
        tl.variant_id || null,
        qty,
        unitPrice,
        taxRuleId,
        taxAmount,
        subtotal,
        total
      );
    }

    return res.status(201).json({
      message: 'Quotation generated successfully from template',
      subscription_id: subId,
      sub_number: subNumber
    });
  } catch (err) {
    console.error('Instantiate quote error:', err);
    return res.status(500).json({ error: 'Failed to instantiate quotation' });
  }
});
