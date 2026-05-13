/**
 * models/User.js — Mongoose schema and model for a Trade Notion user
 *
 * Defines every field stored for a user account, plus:
 *   - A pre-save hook that automatically bcrypt-hashes the password
 *     whenever it changes (new account or password update).
 *   - A comparePassword() method used at login to check a plain-text
 *     password against the stored hash without ever decrypting the hash.
 *   - A toJSON() override that strips the password hash from any API
 *     response so it can never accidentally leak to the client.
 *
 * The model is exported as "User" and maps to the "users" collection in MongoDB.
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({

  // ── Identity ────────────────────────────────────────────────────────────────

  // The user's display name, e.g. "John Doe".
  // trim removes surrounding whitespace before saving.
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },

  // Email is the unique login identifier.
  // lowercase + trim normalise it so "John@GMAIL.com" and "john@gmail.com" are the same.
  // The regex validates basic email format at the schema level.
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },

  // The bcrypt hash of the user's password.
  // minlength: 8 is checked on the PLAIN-TEXT value before the pre-save hook hashes it.
  // select: false means this field is NEVER included in query results unless you
  // explicitly call .select('+password') — prevents accidental password exposure.
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 8,
    select: false
  },

  // ── Trading profile ─────────────────────────────────────────────────────────

  // Self-reported experience level, used to tailor onboarding and UI copy.
  tradingExperience: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    default: 'beginner'
  },

  // Optional short bio shown on the profile page.
  bio: {
    type: String,
    maxlength: 500
  },

  // URL or path to the user's profile image (not yet implemented in the UI).
  avatar: {
    type: String,
    default: null
  },

  // ── App preferences ─────────────────────────────────────────────────────────
  // Nested object — each field can be updated independently via PUT /api/auth/preferences.

  preferences: {
    // Which currency symbol to display next to P&L values across the app.
    currency: {
      type: String,
      enum: ['usd', 'eur', 'gbp', 'jpy'],
      default: 'usd'
    },
    // How dates are formatted throughout the UI (Month/Day/Year, Day/Month/Year, or ISO).
    dateFormat: {
      type: String,
      enum: ['mdy', 'dmy', 'ymd'],
      default: 'mdy'
    },
    // User's local timezone — used for displaying trade timestamps correctly.
    timezone: {
      type: String,
      default: 'est'
    },
    // Whether the app should use a dark colour scheme (not yet wired up in the UI).
    darkMode: {
      type: Boolean,
      default: false
    }
  },

  // ── Notification settings ───────────────────────────────────────────────────
  // Each toggle controls a category of email notifications.
  // Updated via PUT /api/auth/notifications.

  notifications: {
    // Master switch — receive any emails at all.
    email: {
      type: Boolean,
      default: true
    },
    // Reminders to log trades or review open positions.
    tradeReminders: {
      type: Boolean,
      default: true
    },
    // A weekly digest of the user's performance statistics.
    weeklySummary: {
      type: Boolean,
      default: false
    },
    // Congratulatory emails when a goal is completed.
    goalAchievements: {
      type: Boolean,
      default: true
    }
  },

  // ── Subscription ────────────────────────────────────────────────────────────
  // Placeholder for a future billing system.  Currently all users are on the
  // "free" plan with full feature access.

  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'elite'],
      default: 'free'
    },
    // Whether the subscription is currently active, cancelled, or has lapsed.
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active'
    },
    // Date when the next charge would occur (null for free plan).
    nextBillingDate: Date
  },

  // ── Timestamps ──────────────────────────────────────────────────────────────

  // Set once when the document is first created.
  createdAt: {
    type: Date,
    default: Date.now
  },

  // Updated each time the user successfully logs in via POST /api/auth/login.
  lastLogin: {
    type: Date
  }

}, {
  // Automatically manage createdAt and updatedAt fields on the document.
  // updatedAt is refreshed every time the document is saved.
  timestamps: true
});

// ── Pre-save hook — password hashing ──────────────────────────────────────────
// Runs automatically before every .save() call.
// If the password field has not been modified (e.g. only the name changed),
// this hook does nothing — preventing unnecessary re-hashing.
// Otherwise it generates a bcrypt salt (cost factor 10) and replaces the
// plain-text password with the hash so raw passwords are never stored.
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;

  // genSalt(10): cost factor 10 means 2^10 = 1024 iterations — strong enough
  // for production while still completing in ~100ms.
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Instance method: comparePassword ──────────────────────────────────────────
// Used in POST /api/auth/login to verify a submitted password.
// bcrypt.compare internally hashes the candidate using the stored salt and
// checks it against this.password — the plain text is never "decrypted".
//
// @param  {string}  candidatePassword — The raw password submitted in the login form.
// @returns {Promise<boolean>}         — true if the password matches, false otherwise.
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ── Instance method: toJSON ────────────────────────────────────────────────────
// Called automatically whenever the document is serialised to JSON (e.g. res.json(user)).
// Deletes the password hash from the output object so it can never appear in API responses,
// even if someone accidentally passes the full user document to res.json().
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Export the compiled model.  Mongoose uses the name "User" to derive the
// collection name "users" in MongoDB.
module.exports = mongoose.model('User', userSchema);
