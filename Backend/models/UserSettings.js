/**
 * models/UserSettings.js — Mongoose schema for per-user customisation data
 *
 * Each user gets exactly one UserSettings document (enforced by the unique
 * index on `user`).  It is created automatically the first time the
 * GET /api/settings endpoint is called for a user who doesn't have one yet.
 *
 * Currently stores three types of user-defined lists:
 *
 *   customModels      — Trading strategy names the user has added beyond the
 *                       built-in list (e.g. "ORB Fade", "News Catalyst").
 *                       Shown in the strategy dropdown on the New Trade form.
 *
 *   customMistakeTags — Labels the user has created for categorising trading
 *                       mistakes (e.g. "chased entry", "ignored stop-loss").
 *                       Shown in the Mistake Tags input on the New Trade form.
 *
 *   customFields      — Flexible key-value pairs for any extra data the user
 *                       wants to track that isn't covered by the Trade schema.
 *                       Uses Mixed type so it can store any structure.
 *
 * The model exports as "UserSettings" → MongoDB collection "usersettings".
 */

const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({

  // ── Ownership ────────────────────────────────────────────────────────────────

  // References the User who owns this settings document.
  // unique: true ensures there is at most one settings record per user.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // ── Custom trading strategies ─────────────────────────────────────────────────

  // Array of strategy name strings added by the user in Settings.
  // These are merged with the default strategy list (Breakout, Reversal, etc.)
  // when building the dropdown on the New Trade form.
  // trim removes surrounding whitespace before each value is saved.
  customModels: [{
    type: String,
    trim: true
  }],

  // ── Custom mistake tags ───────────────────────────────────────────────────────

  // Array of mistake label strings the user has defined.
  // Used to tag trades with specific error patterns for later analysis.
  customMistakeTags: [{
    type: String,
    trim: true
  }],

  // ── Custom fields ─────────────────────────────────────────────────────────────

  // Flexible storage for any additional structured data the user wants to record.
  // Mixed type means MongoDB will accept any valid JSON value (object, string, number, etc.).
  customFields: [{
    type: mongoose.Schema.Types.Mixed
  }]

}, {
  // Automatically maintain createdAt and updatedAt fields on the document.
  timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);
