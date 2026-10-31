# Brightloop Subscription Management System
> **Built for the Odoo Hackathon Challenge**  
> A unified platform to run plans, subscriptions, and recurring billing in one place.

---

## 1. Executive Summary

Brightloop Software sells business software on subscription: monthly and yearly contracts, add-ons customers switch on and off, and products with brand variants (such as Odoo integration adding $60). 

Previously, customer subscriptions were tracked in spreadsheets, renewals were remembered by whoever noticed first, invoices were typed by hand, payments were reconciled manually by scrolling through bank statements, and quarterly revenue reports took days to assemble.

This platform replaces those manual, error-prone workflows with a unified, automated digital backbone.

---

## 2. Problem Statement Mapping & Solved Scenarios

| Scene | Problem Solved | Brightloop Solution |
| :--- | :--- | :--- |
| **1. A new customer signs up** | Insecure signup, shared logins, lack of role boundaries | Self-service signup with unique email validation and strict password policy (`> 8 chars`, uppercase, lowercase, special character). Self-service forgot-password token & reset link flow. Role-Based Access Control (**Admin**, **Staff**, **Customer**). Staff creation strictly restricted to Admins. |
| **2. Launching a new plan** | Product variants, brand price additions, flexible recurring intervals | Products catalog with type (`software`, `service`, `consumable`, `addon`), sales and cost prices. Product variants with customizable price adjustments (e.g., choosing "Odoo" brand variant adds $60 to the price). Plans support `daily`, `weekly`, `monthly`, and `yearly` intervals with minimum quantity and plan-by-plan lifecycle toggles (`auto_close`, `can_close_early`, `can_pause`, `can_renew`). |
| **3. Turning a quote into a subscription** | Quoting from scratch, lost offers, spreadsheet confusion | Quotation templates with pre-configured plans, lines, and validity periods. Sales reps turn templates into quotes in one click. Subscriptions follow a strict lifecycle state machine: `Draft` &rarr; `Quotation` &rarr; `Confirmed` &rarr; `Active` &rarr; `Closed`. Unique numbering (`SUB-XXXXX`) with full team visibility. |
| **4. Billing day** | Typing invoices by hand, duplicate billing, missed renewals | Automated recurring billing engine. Invoices are generated from active due subscriptions with customer details, lines, taxes, and totals pre-filled. **Zero double-billing guarantee**: Idempotent check prevents any subscription from being billed twice or skipped. Invoices progress from `Draft` &rarr; `Confirmed` &rarr; `Paid` (or `Cancelled`), with Print/PDF and simulated email delivery. |
| **5. A customer asks for a better price** | Manual discount tracking, missed expirations, unauthorized discounts | Only Admins can create discount rules: fixed or percentage, minimum purchase or quantity thresholds, date windows, usage count limits, and scope (`subscription` or `product`). Once applied, discounts appear automatically on the next invoice without manual reminder, and stop when expired or exhausted. |
| **6. The money comes in** | Unmatched payments, scrolling bank statements, lost revenue | Payments recorded with method (Credit Card, Bank Wire, PayPal, Cash, Check), amount, date, and transaction notes against specific invoices. Invoices automatically update to `Paid` when fully settled. Real-time overdue invoice ledger with one-click payment chase reminders. |
| **7. The finance lead at end of month** | Days to calculate MRR/ARR, slow and sluggish reporting | Single-pane-of-glass executive dashboard: Active Subscriptions, MRR, ARR, Total Cash Collected, Accounts Receivable, and Overdue Aging. Lightning-fast SQLite indexed queries responding in **< 10ms** (far exceeding the sub-2s SLA) even with thousands of records. |

---

## 3. Tech Stack

- **Backend**: Node.js v26 LTS, Express, ES Modules.
- **Database**: SQLite (via Node's built-in `node:sqlite`), PRAGMA WAL mode, foreign keys enabled, and custom performance indexes on customers, statuses, and due dates.
- **Security**: JWT (`jsonwebtoken`), `bcryptjs` password hashing, regex password policy validator, role-based route middleware.
- **Frontend**: Responsive Single-Page Application (SPA) with Tailwind CSS, FontAwesome icons, and Chart.js for financial trend visualization.
- **Benchmark / Scale Tool**: Built-in scale engine generating 1,000 to 5,000 subscriptions and invoices in a single transaction with a live query latency counter.

---

## 4. Quick Start & Setup

### Prerequisites
- Node.js (v20+ or v26 LTS)

### Installation & Launch
```bash
# Clone the repository
git clone https://github.com/athulkrishnams-creator/Subscription_Management_System.git
cd Subscription_Management_System

# Install dependencies
npm install

# Start the server
npm start
```
The server will start at: **`http://localhost:3000`**

---

## 5. Pre-Seeded Demo Accounts (Quick Persona Switcher)

For evaluation, the application provides a 1-click persona switcher pinned to the top header bar:

| Role | Email | Password | Persona & Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@brightloop.com` | `Brightloop@2026!` | **Sarah Connor**: Full control over products, plans, tax rules, discount rules, staff management, and executive financial dashboard. |
| **Staff** | `staff@brightloop.com` | `Brightloop@2026!` | **Alex Mercer**: Sales & Operations. Generates quotes from templates, manages subscription lifecycles, executes billing day, records payments, chases overdue invoices. |
| **Customer** | `customer@brightloop.com` | `Brightloop@2026!` | **John Doe (Acme Retail)**: Customer self-service portal. Views active subscriptions, self-service pause/resume/renew, views invoices, and downloads receipts without emailing staff. |

---

## 6. Performance Benchmark (Sub-2s Requirement)

The problem statement specifies:
> *"With thousands of subscriptions on the books, every page should still respond in under two seconds."*

### Benchmark Results
- **1,000 Subscriptions Insertion**: **~39 ms** (single transaction)
- **Executive Finance Query (MRR, ARR, Receivables over 1,000+ subs)**: **~9.9 ms**
- **Query Latency Pill**: The UI displays a live execution timer measuring end-to-end request latency on every view load.

To test this live in the UI:
1. Click the **"Scale Test (1k-5k Subs)"** button in the top navigation bar.
2. Select 1,000, 2,500, or 5,000 subscriptions and click **"Generate & Run Benchmark"**.
3. Watch the performance pill confirm sub-20ms response times.

---

## 7. Key API Endpoints

### Authentication & Users
- `POST /api/auth/register` — Customer registration (enforces password complexity)
- `POST /api/auth/login` — Sign in and receive JWT token
- `POST /api/auth/forgot-password` — Generate reset link and dispatch token
- `POST /api/auth/reset-password` — Validate token and update password
- `POST /api/auth/staff` — Add new staff member (Admin only)

### Products & Plans
- `GET /api/products` — List products and variants (e.g. Odoo brand +$60)
- `POST /api/products` — Create product with variant price adjustments
- `GET /api/plans` — List plans with lifecycle rules
- `POST /api/plans` — Create plan (daily, weekly, monthly, yearly)

### Quotations & Subscriptions
- `GET /api/quotes/templates` — List quotation templates
- `POST /api/quotes/templates/:id/instantiate` — Turn template into customer quote
- `GET /api/subscriptions` — List subscriptions (filtered by role)
- `PATCH /api/subscriptions/:id/status` — Lifecycle transition (`Draft` &rarr; `Quotation` &rarr; `Confirmed` &rarr; `Active` &rarr; `Paused` &rarr; `Closed`)
- `POST /api/subscriptions/:id/renew` — Renew subscription

### Billing & Taxes
- `POST /api/billing/run-billing-day` — Execute automated recurring billing cycle (idempotent)
- `GET /api/billing/invoices` — List invoices (with overdue detection)
- `PATCH /api/billing/invoices/:id/confirm` — Confirm invoice
- `POST /api/billing/invoices/:id/send` — Mark invoice as sent
- `GET /api/taxes` — List tax rules (Admin only to create)

### Discounts & Payments
- `GET /api/discounts` — List discount rules (Admin only to create)
- `POST /api/discounts/apply-to-subscription` — Attach discount code to subscription
- `POST /api/payments` — Record payment against invoice (auto-settles to `Paid`)
- `POST /api/payments/chase-overdue` — Dispatch overdue payment chase reminder

### Executive Analytics
- `GET /api/analytics/summary` — High-speed financial KPIs (MRR, ARR, cash, receivables, aging)
- `POST /api/analytics/scale-test-seed` — Scale benchmark generator
