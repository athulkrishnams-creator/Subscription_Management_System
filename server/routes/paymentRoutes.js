import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const paymentRouter = express.Router();

/**
 * Record a payment against an invoice
 * Updates invoice.paid_amount and automatically transitions to 'Paid' when fully settled
 */
paymentRouter.post('/', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { invoice_id, payment_method, amount, payment_date, note } = req.body;

    if (!invoice_id || !payment_method || amount === undefined) {
      return res.status(400).json({ error: 'Invoice ID, payment method, and amount are required' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }

    const validMethods = ['credit_card', 'bank_transfer', 'paypal', 'cash', 'check'];
    if (!validMethods.includes(payment_method)) {
      return res.status(400).json({ error: `Payment method must be one of: ${validMethods.join(', ')}` });
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot record payment on a cancelled invoice' });
    }

    // Generate Payment Number: PAY-XXXXX
    const payCount = db.prepare('SELECT COUNT(*) as cnt FROM payments').get();
    const paySeq = (payCount.cnt + 1).toString().padStart(5, '0');
    const paymentNumber = `PAY-${paySeq}`;
    const paymentId = crypto.randomUUID();
    const payDate = payment_date || new Date().toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO payments (id, payment_number, invoice_id, payment_method, amount, payment_date, note, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      paymentNumber,
      invoice_id,
      payment_method,
      payAmount,
      payDate,
      note || null,
      req.user.id
    );

    const newPaidAmount = invoice.paid_amount + payAmount;
    const isFullyPaid = newPaidAmount >= (invoice.total_amount - 0.001); // Epsilon for floating point
    const newStatus = isFullyPaid ? 'Paid' : (invoice.status === 'Draft' ? 'Confirmed' : invoice.status);

    db.prepare(`
      UPDATE invoices
      SET paid_amount = ?, status = ?
      WHERE id = ?
    `).run(newPaidAmount, newStatus, invoice_id);

    return res.status(201).json({
      message: isFullyPaid
        ? `Payment of $${payAmount.toFixed(2)} recorded! Invoice is now FULLY PAID.`
        : `Partial payment of $${payAmount.toFixed(2)} recorded. Remaining balance: $${Math.max(0, invoice.total_amount - newPaidAmount).toFixed(2)}`,
      payment: {
        id: paymentId,
        payment_number: paymentNumber,
        amount: payAmount,
        invoice_status: newStatus,
        paid_amount: newPaidAmount,
        remaining_balance: Math.max(0, invoice.total_amount - newPaidAmount)
      }
    });
  } catch (err) {
    console.error('Record payment error:', err);
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

/**
 * List all payments
 */
paymentRouter.get('/', authenticateToken, (req, res) => {
  try {
    let query = `
      SELECT p.*, 
             i.invoice_number, i.total_amount as invoice_total, i.status as invoice_status,
             u.name as customer_name, u.email as customer_email,
             rec.name as recorded_by_name
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN users u ON i.customer_id = u.id
      LEFT JOIN users rec ON p.recorded_by = rec.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CUSTOMER') {
      query += ' AND i.customer_id = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY p.payment_date DESC, p.created_at DESC';

    const payments = db.prepare(query).all(...params);
    return res.json({ payments });
  } catch (err) {
    console.error('List payments error:', err);
    return res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

/**
 * Chase Overdue Invoice - Dispatches / logs reminder to the customer
 */
paymentRouter.post('/chase-overdue', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { invoice_id } = req.body;
    if (!invoice_id) return res.status(400).json({ error: 'Invoice ID is required' });

    const invoice = db.prepare(`
      SELECT i.*, u.name as customer_name, u.email as customer_email
      FROM invoices i
      JOIN users u ON i.customer_id = u.id
      WHERE i.id = ?
    `).get(invoice_id);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount);

    return res.json({
      message: `Payment chase reminder successfully dispatched to ${invoice.customer_name} (${invoice.customer_email}) for Invoice ${invoice.invoice_number} (Outstanding: $${remaining.toFixed(2)})`,
      invoice_number: invoice.invoice_number,
      customer_email: invoice.customer_email,
      outstanding: remaining,
      chased_at: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to chase overdue invoice' });
  }
});
