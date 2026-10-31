import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { validatePassword, generateToken, authenticateToken, requireRole } from '../middleware/auth.js';

export const authRouter = express.Router();

/**
 * Customer Registration
 * Enforces email uniqueness and password rules (> 8 chars, upper, lower, special)
 */
authRouter.post('/register', (req, res) => {
  try {
    const { email, password, name, company_name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check unique email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Validate password
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, company_name, phone)
      VALUES (?, ?, ?, ?, 'CUSTOMER', ?, ?)
    `).run(id, trimmedEmail, password_hash, name.trim(), company_name || null, phone || null);

    const user = { id, email: trimmedEmail, name: name.trim(), role: 'CUSTOMER', company_name };
    const token = generateToken(user);

    return res.status(201).json({
      message: 'Account created successfully',
      user,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

/**
 * User Login (Admin, Staff, Customer)
 */
authRouter.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    return res.json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_name: user.company_name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * Forgot Password - Generates reset link
 */
authRouter.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);

    if (!user) {
      // Security best practice: don't reveal email non-existence, but inform simulation
      return res.json({
        message: 'If the email is registered, a password reset link has been dispatched.',
        reset_link: null
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour validity

    db.prepare(`
      UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?
    `).run(resetToken, expires, user.id);

    // Provide reset link for the UI demo simulation
    const resetLink = `/reset-password?token=${resetToken}&email=${encodeURIComponent(trimmedEmail)}`;

    return res.json({
      message: 'Password reset link sent to your registered email.',
      reset_token: resetToken,
      reset_link: resetLink
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Internal server error during forgot password' });
  }
});

/**
 * Reset Password
 */
authRouter.post('/reset-password', (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (new Date(user.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(newPassword, salt);

    db.prepare(`
      UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?
    `).run(password_hash, user.id);

    return res.json({ message: 'Password has been successfully reset. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Internal server error during password reset' });
  }
});

/**
 * Create Staff Member - ONLY ADMIN CAN ADD A NEW MEMBER OF STAFF
 */
authRouter.post('/staff', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, phone)
      VALUES (?, ?, ?, ?, 'STAFF', ?)
    `).run(id, trimmedEmail, password_hash, name.trim(), phone || null);

    return res.status(201).json({
      message: 'New staff member added successfully',
      staff: { id, email: trimmedEmail, name: name.trim(), role: 'STAFF' }
    });
  } catch (err) {
    console.error('Create staff error:', err);
    return res.status(500).json({ error: 'Internal server error while adding staff member' });
  }
});

/**
 * Get Current User
 */
authRouter.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, company_name, phone, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user });
});

/**
 * List Users (For Admin/Staff management & Dropdowns)
 */
authRouter.get('/users', authenticateToken, (req, res) => {
  try {
    const { role } = req.query;
    let query = 'SELECT id, email, name, role, company_name, phone, created_at FROM users';
    const params = [];

    if (role) {
      query += ' WHERE role = ?';
      params.push(role);
    }
    query += ' ORDER BY created_at DESC';

    const users = db.prepare(query).all(...params);
    return res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Error fetching users' });
  }
});

/**
 * Quick Switcher Endpoint (for demonstration and evaluation)
 */
authRouter.get('/demo-accounts', (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT id, email, name, role, company_name FROM users
      WHERE email IN ('admin@brightloop.com', 'staff@brightloop.com', 'customer@brightloop.com')
      ORDER BY role ASC
    `).all();

    return res.json({ accounts });
  } catch (err) {
    return res.status(500).json({ error: 'Error fetching demo accounts' });
  }
});
