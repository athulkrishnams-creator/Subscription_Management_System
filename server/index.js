import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initDatabase } from './db.js';
import { seedInitialData } from './seedService.js';

import { authRouter } from './routes/authRoutes.js';
import { productRouter } from './routes/productRoutes.js';
import { planRouter } from './routes/planRoutes.js';
import { quoteRouter } from './routes/quoteRoutes.js';
import { subscriptionRouter } from './routes/subscriptionRoutes.js';
import { billingRouter } from './routes/billingRoutes.js';
import { discountRouter } from './routes/discountRoutes.js';
import { taxRouter } from './routes/taxRoutes.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { analyticsRouter } from './routes/analyticsRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database & Seed data
initDatabase();
seedInitialData();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/plans', planRouter);
app.use('/api/quotes', quoteRouter);
app.use('/api/subscriptions', subscriptionRouter);
app.use('/api/billing', billingRouter);
app.use('/api/discounts', discountRouter);
app.use('/api/taxes', taxRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/analytics', analyticsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'Brightloop Subscription Management System',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback (Express 5 compatible)
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Brightloop Subscription Management System is LIVE!    `);
  console.log(` URL: http://localhost:${PORT}                         `);
  console.log(` Powered by Node.js, Express & High-Performance SQLite `);
  console.log(`=======================================================`);
});
