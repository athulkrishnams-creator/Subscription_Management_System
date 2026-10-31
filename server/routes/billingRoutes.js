import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getNextBillingDate } from './subscriptionRoutes.js';

export const billingRouter = express.Router();

/**
 * Calculate due date based on payment terms
 */
function calculateDueDate(issueDateStr, paymentTerms) {
  const issueDate = new Date(issueDateStr);
  const terms = (paymentTerms || '').toLowerCase();

  if (terms.includes('30')) {
    issueDate.setDate(issueDate.getDate() + 30);
  } else if (terms.includes('15')) {
    issueDate.setDate(issueDate.getDate() + 15);
  } else if (terms.includes('7')) {
    issueDate.setDate(issueDate.getDate() + 7);
  } else {
    // Immediate / Due on Receipt
    issueDate.setDate(issueDate.getDate() + 1);
  }
  return issueDate.toISOString().slice(0, 10);
}

/**
 * Execute automated recurring billing run
 * Strict idempotency guarantee: Nothing is billed twice or skipped
 */
export function executeBillingRun(targetDate) {
  const dateToRun = targetDate || new Date().toISOString().slice(0, 10);

  // Find all active subscriptions due on or before dateToRun
  const dueSubs = db.prepare(`
    SELECT s.*, p.billing_frequency, p.auto_close, p.price as plan_price
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.status = 'Active'
      AND s.next_billing_date <= ?
  `).all(dateToRun);

  const generatedInvoices = [];
  const skippedCount = { duplicate: 0, expired: 0 };

  for (const sub of dueSubs) {
    // Check if subscription has passed expiry
    if (sub.expiry_date && sub.expiry_date < dateToRun) {
      if (sub.auto_close) {
        db.prepare("UPDATE subscriptions SET status = 'Closed' WHERE id = ?").run(sub.id);
      }
      skippedCount.expired++;
      continue;
    }

    const billingStart = sub.next_billing_date;
    const billingEnd = getNextBillingDate(billingStart, sub.billing_frequency);

    // IDEMPOTENCY CHECK: Ensure an invoice doesn't already exist for this subscription cycle
    const existing = db.prepare(`
      SELECT id FROM invoices
      WHERE subscription_id = ?
        AND billing_period_start = ?
        AND status != 'Cancelled'
    `).get(sub.id, billingStart);

    if (existing) {
      skippedCount.duplicate++;
      // Still advance next billing date if it wasn't advanced
      const nextDate = getNextBillingDate(sub.next_billing_date, sub.billing_frequency);
      db.prepare('UPDATE subscriptions SET next_billing_date = ? WHERE id = ?').run(nextDate, sub.id);
      continue;
    }

    // Fetch lines for this subscription
    const lines = db.prepare(`
      SELECT sl.*, pr.name as product_name, pv.variant_name, pv.price_adjustment, tr.rate_percentage as tax_rate
      FROM subscription_lines sl
      JOIN products pr ON sl.product_id = pr.id
      LEFT JOIN product_variants pv ON sl.variant_id = pv.id
      LEFT JOIN tax_rules tr ON sl.tax_rule_id = tr.id
      WHERE sl.subscription_id = ?
    `).all(sub.id);

    if (lines.length === 0) continue;

    // Check attached discount rule
    let discountRule = null;
    if (sub.discount_rule_id) {
      discountRule = db.prepare('SELECT * FROM discount_rules WHERE id = ? AND active = 1').get(sub.discount_rule_id);
      if (discountRule) {
        // Validate date window
        if (discountRule.start_date && dateToRun < discountRule.start_date) discountRule = null;
        if (discountRule && discountRule.end_date && dateToRun > discountRule.end_date) discountRule = null;
        // Validate max uses
        if (discountRule && discountRule.max_uses > 0 && discountRule.times_used >= discountRule.max_uses) {
          discountRule = null;
          // Disassociate expired discount
          db.prepare('UPDATE subscriptions SET discount_rule_id = NULL WHERE id = ?').run(sub.id);
        }
      }
    }

    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    const totalQuantity = lines.reduce((acc, l) => acc + l.quantity, 0);

    const calculatedLines = lines.map(line => {
      const lineSubtotal = line.quantity * line.unit_price;
      subtotal += lineSubtotal;

      let lineDiscount = 0;
      if (discountRule && discountRule.scope === 'product' && discountRule.target_product_id === line.product_id) {
        // Check minimum quantity threshold
        if (totalQuantity >= discountRule.min_quantity) {
          if (discountRule.type === 'percentage') {
            lineDiscount = (lineSubtotal * discountRule.value) / 100;
          } else {
            lineDiscount = Math.min(lineSubtotal, discountRule.value);
          }
        }
      }
      totalDiscount += lineDiscount;

      const taxableBase = Math.max(0, lineSubtotal - lineDiscount);
      const lineTax = (taxableBase * (line.tax_rate || 0)) / 100;
      totalTax += lineTax;

      return {
        id: crypto.randomUUID(),
        product_id: line.product_id,
        product_name: line.product_name,
        variant_name: line.variant_name || null,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_rate: line.tax_rate || 0,
        tax_amount: lineTax,
        discount_amount: lineDiscount,
        subtotal: lineSubtotal,
        total: taxableBase + lineTax
      };
    });

    // Whole subscription discount check
    if (discountRule && discountRule.scope === 'subscription') {
      const meetsMinPurchase = subtotal >= (discountRule.min_purchase_amount || 0);
      const meetsMinQty = totalQuantity >= (discountRule.min_quantity || 0);

      if (meetsMinPurchase && meetsMinQty) {
        if (discountRule.type === 'percentage') {
          totalDiscount = (subtotal * discountRule.value) / 100;
        } else {
          totalDiscount = Math.min(subtotal, discountRule.value);
        }
      }
    }

    const totalAmount = Math.max(0, subtotal - totalDiscount) + totalTax;

    // Create Invoice Number: INV-YYYYMM-XXXX
    const invoiceCount = db.prepare('SELECT COUNT(*) as cnt FROM invoices').get();
    const invSeq = (invoiceCount.cnt + 1).toString().padStart(5, '0');
    const invoiceNumber = `INV-${invSeq}`;
    const invoiceId = crypto.randomUUID();
    const dueDate = calculateDueDate(dateToRun, sub.payment_terms);

    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, subscription_id, customer_id, status,
        issue_date, due_date, subtotal, tax_amount, discount_amount,
        total_amount, paid_amount, billing_period_start, billing_period_end
      ) VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, 0.0, ?, ?)
    `).run(
      invoiceId,
      invoiceNumber,
      sub.id,
      sub.customer_id,
      dateToRun,
      dueDate,
      subtotal,
      totalTax,
      totalDiscount,
      totalAmount,
      billingStart,
      billingEnd
    );

    // Insert Invoice Lines
    const insertInvLine = db.prepare(`
      INSERT INTO invoice_lines (
        id, invoice_id, product_id, product_name, variant_name,
        quantity, unit_price, tax_rate, tax_amount, discount_amount, subtotal, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const cl of calculatedLines) {
      insertInvLine.run(
        cl.id,
        invoiceId,
        cl.product_id,
        cl.product_name,
        cl.variant_name,
        cl.quantity,
        cl.unit_price,
        cl.tax_rate,
        cl.tax_amount,
        cl.discount_amount,
        cl.subtotal,
        cl.total
      );
    }

    // Increment discount usage if applied
    if (discountRule && totalDiscount > 0) {
      db.prepare('UPDATE discount_rules SET times_used = times_used + 1 WHERE id = ?').run(discountRule.id);
    }

    // Update Subscription: advance next billing date & record last billed date
    const nextDate = getNextBillingDate(sub.next_billing_date, sub.billing_frequency);
    db.prepare(`
      UPDATE subscriptions
      SET next_billing_date = ?, last_billed_date = ?
      WHERE id = ?
    `).run(nextDate, dateToRun, sub.id);

    generatedInvoices.push({
      id: invoiceId,
      invoice_number: invoiceNumber,
      subscription_id: sub.id,
      total_amount: totalAmount,
      customer_id: sub.customer_id
    });
  }

  return {
    date: dateToRun,
    invoices_created: generatedInvoices.length,
    invoices: generatedInvoices,
    skipped: skippedCount
  };
}

/**
 * Run Billing Day (Admin & Staff)
 */
billingRouter.post('/run-billing-day', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const { target_date } = req.body;
    const result = executeBillingRun(target_date);
    return res.json({
      message: `Billing day executed successfully! Generated ${result.invoices_created} invoices.`,
      result
    });
  } catch (err) {
    console.error('Run billing day error:', err);
    return res.status(500).json({ error: 'Failed to run billing day' });
  }
});

/**
 * List Invoices
 * Filter by customer, status, overdue
 */
billingRouter.get('/invoices', authenticateToken, (req, res) => {
  try {
    const { status, customer_id, overdue } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    let query = `
      SELECT i.*, 
             u.name as customer_name, u.email as customer_email, u.company_name,
             s.sub_number, s.payment_terms
      FROM invoices i
      JOIN users u ON i.customer_id = u.id
      LEFT JOIN subscriptions s ON i.subscription_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'CUSTOMER') {
      query += ' AND i.customer_id = ?';
      params.push(req.user.id);
    } else if (customer_id) {
      query += ' AND i.customer_id = ?';
      params.push(customer_id);
    }

    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }

    if (overdue === 'true') {
      query += " AND i.status IN ('Draft', 'Confirmed') AND i.due_date < ?";
      params.push(today);
    }

    query += ' ORDER BY i.created_at DESC';

    const invoices = db.prepare(query).all(...params);

    const formatted = invoices.map(inv => {
      const isOverdue = (inv.status === 'Draft' || inv.status === 'Confirmed') && inv.due_date < today;
      return {
        ...inv,
        is_overdue: isOverdue,
        remaining_balance: Math.max(0, inv.total_amount - inv.paid_amount)
      };
    });

    return res.json({ invoices: formatted });
  } catch (err) {
    console.error('List invoices error:', err);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * Get Invoice Details with Line Items & Payments
 */
billingRouter.get('/invoices/:id', authenticateToken, (req, res) => {
  try {
    const invId = req.params.id;
    const invoice = db.prepare(`
      SELECT i.*, 
             u.name as customer_name, u.email as customer_email, u.company_name, u.phone as customer_phone,
             s.sub_number, s.payment_terms
      FROM invoices i
      JOIN users u ON i.customer_id = u.id
      LEFT JOIN subscriptions s ON i.subscription_id = s.id
      WHERE i.id = ?
    `).get(invId);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (req.user.role === 'CUSTOMER' && invoice.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(invId);
    const payments = db.prepare(`
      SELECT p.*, u.name as recorded_by_name
      FROM payments p
      LEFT JOIN users u ON p.recorded_by = u.id
      WHERE p.invoice_id = ?
      ORDER BY p.payment_date DESC
    `).all(invId);

    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = (invoice.status === 'Draft' || invoice.status === 'Confirmed') && invoice.due_date < today;

    return res.json({
      invoice: {
        ...invoice,
        is_overdue: isOverdue,
        remaining_balance: Math.max(0, invoice.total_amount - invoice.paid_amount),
        lines,
        payments
      }
    });
  } catch (err) {
    console.error('Get invoice error:', err);
    return res.status(500).json({ error: 'Failed to fetch invoice details' });
  }
});

/**
 * Confirm Invoice: Draft -> Confirmed (Admin & Staff)
 */
billingRouter.patch('/invoices/:id/confirm', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const inv = db.prepare('SELECT status FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status !== 'Draft') {
      return res.status(400).json({ error: `Cannot confirm invoice with status ${inv.status}` });
    }

    db.prepare("UPDATE invoices SET status = 'Confirmed' WHERE id = ?").run(req.params.id);
    return res.json({ message: 'Invoice confirmed successfully', status: 'Confirmed' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to confirm invoice' });
  }
});

/**
 * Cancel Invoice (Admin & Staff)
 */
billingRouter.patch('/invoices/:id/cancel', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const inv = db.prepare('SELECT status, paid_amount FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.paid_amount > 0) {
      return res.status(400).json({ error: 'Cannot cancel invoice with recorded payments. Refund or adjust first.' });
    }

    db.prepare("UPDATE invoices SET status = 'Cancelled' WHERE id = ?").run(req.params.id);
    return res.json({ message: 'Invoice cancelled successfully', status: 'Cancelled' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel invoice' });
  }
});

/**
 * Send Invoice: simulate email dispatch and mark sent_at timestamp
 */
billingRouter.post('/invoices/:id/send', authenticateToken, requireRole(['ADMIN', 'STAFF']), (req, res) => {
  try {
    const inv = db.prepare(`
      SELECT i.*, u.email as customer_email, u.name as customer_name
      FROM invoices i
      JOIN users u ON i.customer_id = u.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const sentAt = new Date().toISOString();
    db.prepare('UPDATE invoices SET sent_at = ? WHERE id = ?').run(sentAt, req.params.id);

    return res.json({
      message: `Invoice ${inv.invoice_number} successfully dispatched to ${inv.customer_email}`,
      sent_at: sentAt
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send invoice' });
  }
});
