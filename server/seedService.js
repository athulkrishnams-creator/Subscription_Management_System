import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, initDatabase } from './db.js';

export function seedInitialData() {
  initDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount > 0) {
    console.log('Database already has data. Skipping initial seeding.');
    return;
  }

  console.log('Seeding initial data for Brightloop Subscription Management System...');

  const defaultPassword = 'Brightloop@2026!';
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(defaultPassword, salt);

  // 1. Create Users (Admin, Staff, Customers)
  const adminId = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  const customer1Id = crypto.randomUUID();
  const customer2Id = crypto.randomUUID();
  const customer3Id = crypto.randomUUID();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, company_name, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(adminId, 'admin@brightloop.com', passwordHash, 'Sarah Connor (Admin)', 'ADMIN', 'Brightloop HQ', '+1-555-0100');
  insertUser.run(staffId, 'staff@brightloop.com', passwordHash, 'Alex Mercer (Sales & Ops)', 'STAFF', 'Brightloop Ops', '+1-555-0101');
  insertUser.run(customer1Id, 'customer@brightloop.com', passwordHash, 'John Doe', 'CUSTOMER', 'Acme Retail Solutions', '+1-555-0102');
  insertUser.run(customer2Id, 'shop@cornerstore.com', passwordHash, 'Elena Rostova', 'CUSTOMER', 'Corner Store Express', '+1-555-0103');
  insertUser.run(customer3Id, 'enterprise@megacorp.com', passwordHash, 'Marcus Vance', 'CUSTOMER', 'MegaCorp Technologies', '+1-555-0104');

  // 2. Create Products & Variants
  const prodCrmId = crypto.randomUUID();
  const prodAddonId = crypto.randomUUID();
  const prodSupportId = crypto.randomUUID();
  const prodSeatId = crypto.randomUUID();

  const insertProd = db.prepare(`
    INSERT INTO products (id, name, type, sales_price, cost_price, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertProd.run(prodCrmId, 'Brightloop CRM Core', 'software', 120.0, 35.0, 'Core business CRM platform');
  insertProd.run(prodAddonId, 'Smart Invoicing Add-on', 'addon', 45.0, 10.0, 'Automated invoicing & billing connector');
  insertProd.run(prodSupportId, '24/7 Priority Support', 'service', 80.0, 25.0, 'Dedicated Slack channel & 1-hour SLA');
  insertProd.run(prodSeatId, 'Additional User Seat', 'software', 25.0, 5.0, 'Per-user monthly software access license');

  // Insert Variants (matching Odoo brand adds +$60 requirement)
  const varOdooId = crypto.randomUUID();
  const varStandardId = crypto.randomUUID();
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (id, product_id, variant_name, attribute_type, price_adjustment)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertVariant.run(varOdooId, prodCrmId, 'Odoo Brand Edition', 'brand', 60.0);
  insertVariant.run(varStandardId, prodCrmId, 'Standard Cloud Edition', 'brand', 0.0);

  // 3. Create Subscription Plans
  const planMonthlyId = crypto.randomUUID();
  const planYearlyId = crypto.randomUUID();
  const planWeeklyId = crypto.randomUUID();
  const planDailyId = crypto.randomUUID();

  const insertPlan = db.prepare(`
    INSERT INTO plans (
      id, name, price, billing_frequency, min_quantity,
      available_from, available_to, auto_close, can_close_early, can_pause, can_renew
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPlan.run(planMonthlyId, 'Professional Monthly', 99.0, 'monthly', 1, '2026-01-01', '2027-12-31', 0, 1, 1, 1);
  insertPlan.run(planYearlyId, 'Enterprise Annual Contract', 999.0, 'yearly', 5, '2026-01-01', '2027-12-31', 1, 0, 0, 1);
  insertPlan.run(planWeeklyId, 'Startup Weekly Sprint', 30.0, 'weekly', 1, '2026-01-01', '2027-12-31', 0, 1, 1, 1);
  insertPlan.run(planDailyId, 'High-Compute Daily Tier', 10.0, 'daily', 1, '2026-01-01', '2027-12-31', 0, 1, 1, 1);

  // 4. Create Tax Rules
  const taxStandardId = crypto.randomUUID();
  const taxVatId = crypto.randomUUID();
  const taxExemptId = crypto.randomUUID();

  const insertTax = db.prepare(`
    INSERT INTO tax_rules (id, name, rate_percentage, is_default)
    VALUES (?, ?, ?, ?)
  `);

  insertTax.run(taxStandardId, 'Standard Sales Tax (10%)', 10.0, 1);
  insertTax.run(taxVatId, 'EU VAT (20%)', 20.0, 0);
  insertTax.run(taxExemptId, 'Zero Tax / Exempt (0%)', 0.0, 0);

  // 5. Create Discount Rules (Admin created)
  const discSeatsId = crypto.randomUUID();
  const discWelcomeId = crypto.randomUUID();
  const discOdooId = crypto.randomUUID();

  const insertDiscount = db.prepare(`
    INSERT INTO discount_rules (
      id, code, name, type, value,
      min_purchase_amount, min_quantity, start_date, end_date,
      max_uses, times_used, scope, target_product_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertDiscount.run(discSeatsId, 'SEATBOOST15', 'Bulk Seats 15% Off', 'percentage', 15.0, 0.0, 3, '2026-01-01', '2027-12-31', 100, 1, 'subscription', null);
  insertDiscount.run(discWelcomeId, 'WELCOME50', 'New Customer $50 Credit', 'fixed', 50.0, 150.0, 0, '2026-01-01', '2027-12-31', 50, 0, 'subscription', null);
  insertDiscount.run(discOdooId, 'ODOOSAVE', 'Odoo Edition 10% Discount', 'percentage', 10.0, 0.0, 0, '2026-01-01', '2027-12-31', 25, 0, 'product', prodCrmId);

  // 6. Create Quotation Templates
  const templateSmbId = crypto.randomUUID();
  const templateEntId = crypto.randomUUID();

  const insertTemplate = db.prepare(`
    INSERT INTO quotation_templates (id, name, plan_id, validity_days, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertTemplate.run(templateSmbId, 'SMB Business Starter Bundle', planMonthlyId, 30, 'Recommended for teams up to 10 users');
  insertTemplate.run(templateEntId, 'Enterprise Cloud Suite (Odoo Brand)', planYearlyId, 45, 'Complete yearly enterprise package with priority SLA');

  const insertTemplateLine = db.prepare(`
    INSERT INTO quotation_template_lines (id, template_id, product_id, variant_id, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertTemplateLine.run(crypto.randomUUID(), templateSmbId, prodCrmId, varStandardId, 1, 120.0);
  insertTemplateLine.run(crypto.randomUUID(), templateSmbId, prodSeatId, null, 3, 25.0);
  insertTemplateLine.run(crypto.randomUUID(), templateSmbId, prodAddonId, null, 1, 45.0);

  insertTemplateLine.run(crypto.randomUUID(), templateEntId, prodCrmId, varOdooId, 1, 180.0); // 120 + 60
  insertTemplateLine.run(crypto.randomUUID(), templateEntId, prodSeatId, null, 10, 25.0);
  insertTemplateLine.run(crypto.randomUUID(), templateEntId, prodSupportId, null, 1, 80.0);

  // 7. Seed Initial Subscriptions
  const sub1Id = crypto.randomUUID();
  const sub2Id = crypto.randomUUID();
  const sub3Id = crypto.randomUUID();

  const insertSub = db.prepare(`
    INSERT INTO subscriptions (
      id, sub_number, customer_id, plan_id, status,
      start_date, expiry_date, payment_terms, next_billing_date,
      discount_rule_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSub.run(sub1Id, 'SUB-00001', customer1Id, planMonthlyId, 'Active', '2026-09-01', '2027-09-01', 'Net 15', '2026-11-01', null, 'Active customer - Acme Retail');
  insertSub.run(sub2Id, 'SUB-00002', customer2Id, planMonthlyId, 'Active', '2026-08-15', '2027-08-15', 'Net 30', '2026-11-15', discSeatsId, 'Corner store with SEATBOOST15 discount');
  insertSub.run(sub3Id, 'SUB-00003', customer3Id, planYearlyId, 'Quotation', '2026-11-01', '2027-11-01', 'Net 30', '2026-11-01', null, 'Draft quote pending signature');

  // Insert lines for Sub 1
  const insertSubLine = db.prepare(`
    INSERT INTO subscription_lines (
      id, subscription_id, product_id, variant_id, quantity, unit_price, tax_rule_id, tax_amount, subtotal, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSubLine.run(crypto.randomUUID(), sub1Id, prodCrmId, varStandardId, 1, 120.0, taxStandardId, 12.0, 120.0, 132.0);
  insertSubLine.run(crypto.randomUUID(), sub1Id, prodSeatId, null, 2, 25.0, taxStandardId, 5.0, 50.0, 55.0);

  // Insert lines for Sub 2 (with Odoo variant)
  insertSubLine.run(crypto.randomUUID(), sub2Id, prodCrmId, varOdooId, 1, 180.0, taxStandardId, 18.0, 180.0, 198.0);
  insertSubLine.run(crypto.randomUUID(), sub2Id, prodSeatId, null, 4, 25.0, taxStandardId, 10.0, 100.0, 110.0);

  // Insert lines for Sub 3
  insertSubLine.run(crypto.randomUUID(), sub3Id, prodCrmId, varOdooId, 1, 180.0, taxStandardId, 18.0, 180.0, 198.0);
  insertSubLine.run(crypto.randomUUID(), sub3Id, prodSeatId, null, 10, 25.0, taxStandardId, 25.0, 250.0, 275.0);
  insertSubLine.run(crypto.randomUUID(), sub3Id, prodSupportId, null, 1, 80.0, taxStandardId, 8.0, 80.0, 88.0);

  // 8. Seed Invoices (Paid, Confirmed, and Overdue)
  const inv1Id = crypto.randomUUID();
  const inv2Id = crypto.randomUUID();
  const inv3Id = crypto.randomUUID(); // Overdue invoice

  const insertInv = db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, subscription_id, customer_id, status,
      issue_date, due_date, subtotal, tax_amount, discount_amount,
      total_amount, paid_amount, billing_period_start, billing_period_end, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Invoice 1: Paid
  insertInv.run(
    inv1Id, 'INV-00001', sub1Id, customer1Id, 'Paid',
    '2026-09-01', '2026-09-16', 170.0, 17.0, 0.0,
    187.0, 187.0, '2026-09-01', '2026-10-01', '2026-09-01T10:00:00Z'
  );

  // Invoice 2: Confirmed (Active outstanding)
  insertInv.run(
    inv2Id, 'INV-00002', sub1Id, customer1Id, 'Confirmed',
    '2026-10-01', '2026-11-15', 170.0, 17.0, 0.0,
    187.0, 0.0, '2026-10-01', '2026-11-01', '2026-10-01T09:30:00Z'
  );

  // Invoice 3: Overdue (Due 2026-09-20, unpaid!)
  insertInv.run(
    inv3Id, 'INV-00003', sub2Id, customer2Id, 'Confirmed',
    '2026-08-15', '2026-09-15', 280.0, 28.0, 42.0, // With 15% discount
    266.0, 0.0, '2026-08-15', '2026-09-15', '2026-08-15T08:00:00Z'
  );

  // Insert Invoice Lines
  const insertInvLine = db.prepare(`
    INSERT INTO invoice_lines (
      id, invoice_id, product_id, product_name, variant_name,
      quantity, unit_price, tax_rate, tax_amount, discount_amount, subtotal, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertInvLine.run(crypto.randomUUID(), inv1Id, prodCrmId, 'Brightloop CRM Core', 'Standard Cloud Edition', 1, 120.0, 10.0, 12.0, 0.0, 120.0, 132.0);
  insertInvLine.run(crypto.randomUUID(), inv1Id, prodSeatId, 'Additional User Seat', null, 2, 25.0, 10.0, 5.0, 0.0, 50.0, 55.0);

  insertInvLine.run(crypto.randomUUID(), inv2Id, prodCrmId, 'Brightloop CRM Core', 'Standard Cloud Edition', 1, 120.0, 10.0, 12.0, 0.0, 120.0, 132.0);
  insertInvLine.run(crypto.randomUUID(), inv2Id, prodSeatId, 'Additional User Seat', null, 2, 25.0, 10.0, 5.0, 0.0, 50.0, 55.0);

  insertInvLine.run(crypto.randomUUID(), inv3Id, prodCrmId, 'Brightloop CRM Core', 'Odoo Brand Edition', 1, 180.0, 10.0, 18.0, 27.0, 180.0, 171.0);
  insertInvLine.run(crypto.randomUUID(), inv3Id, prodSeatId, 'Additional User Seat', null, 4, 25.0, 10.0, 10.0, 15.0, 100.0, 95.0);

  // 9. Seed Payments (Payment against Invoice 1)
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, payment_number, invoice_id, payment_method, amount, payment_date, note, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPayment.run(crypto.randomUUID(), 'PAY-00001', inv1Id, 'credit_card', 187.0, '2026-09-02', 'Credit card auto-charge settled via Stripe', staffId);

  console.log('Database successfully seeded with realistic Brightloop Software demonstration records!');
  console.log('Demo Credentials:');
  console.log('  Admin:    admin@brightloop.com / Brightloop@2026!');
  console.log('  Staff:    staff@brightloop.com / Brightloop@2026!');
  console.log('  Customer: customer@brightloop.com / Brightloop@2026!');
}

if (process.argv[1] && process.argv[1].endsWith('seedService.js')) {
  seedInitialData();
}
