/**
 * models/Goal.js — Mongoose schema and model for a trading goal
 *
 * A Goal document represents one specific objective a trader wants to achieve,
 * such as "reach $10,000 profit" or "maintain a 60% win rate for 30 days".
 *
 * Key features:
 *   - Supports five goal types (profit, winRate, consistency, drawdown, custom)
 *     each with a corresponding unit (dollar, percent, days, trades).
 *   - Tracks current progress via currentValue and auto-marks the goal
 *     completed (via PATCH /api/goals/:id/progress) when currentValue >= targetValue.
 *   - Records a milestone log every time progress is updated, so the user can
 *     see how their progress changed over time.
 *   - Exposes a `progress` virtual that computes percentage completion on the fly.
 *
 * The model exports as "Goal" → MongoDB collection "goals".
 */

const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({

  // ── Ownership ────────────────────────────────────────────────────────────────

  // Links the goal to the user who created it.
  // All goal queries filter by this field so users only see their own goals.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Goal definition ──────────────────────────────────────────────────────────

  // Short name shown in the goal card header, e.g. "Hit $10k Profit by June".
  title: {
    type: String,
    required: [true, 'Please provide a goal title'],
    trim: true
  },

  // Optional longer explanation of why the goal matters to the user.
  description: {
    type: String,
    maxlength: 500
  },

  // Category of goal — determines which metric to track and how to display it.
  //   profit      → dollar amount of net P&L to reach
  //   winRate     → percentage of trades that must be wins
  //   consistency → number of consecutive profitable days
  //   drawdown    → maximum allowed drawdown percentage
  //   custom      → anything the user defines
  type: {
    type: String,
    required: true,
    enum: ['profit', 'winRate', 'consistency', 'drawdown', 'custom']
  },

  // The number the user wants to reach, e.g. 10000 (for $10,000 profit).
  targetValue: {
    type: Number,
    required: true
  },

  // The user's current position toward the goal.
  // Updated via PATCH /api/goals/:id/progress.  Starts at 0.
  currentValue: {
    type: Number,
    default: 0
  },

  // The unit that gives targetValue and currentValue their meaning.
  //   dollar  → monetary amount (used with profit goals)
  //   percent → ratio out of 100 (used with winRate and drawdown goals)
  //   days    → count of calendar/trading days (used with consistency goals)
  //   trades  → number of trades (used with custom count goals)
  unit: {
    type: String,
    enum: ['dollar', 'percent', 'days', 'trades'],
    required: true
  },

  // ── Timeline ──────────────────────────────────────────────────────────────────

  // Optional deadline — when the user wants to achieve the goal by.
  // Displayed in the goal card and can be used to calculate days remaining.
  targetDate: {
    type: Date
  },

  // When tracking of this goal began (defaults to the moment it was created).
  startDate: {
    type: Date,
    default: Date.now
  },

  // Set automatically when the goal transitions to 'completed' status.
  completedDate: {
    type: Date
  },

  // ── Status ────────────────────────────────────────────────────────────────────

  // Lifecycle state of the goal.
  //   active    → in progress
  //   completed → currentValue reached targetValue
  //   paused    → user has temporarily paused tracking
  //   failed    → user or system has marked the goal as failed
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'failed'],
    default: 'active'
  },

  // ── Milestone log ─────────────────────────────────────────────────────────────

  // Every time the user updates their progress, a milestone entry is appended here.
  // This creates a history of how progress evolved over time (like a changelog).
  milestones: [{
    // The progress value at the time of this update
    value: Number,
    // When this update was recorded
    date: Date,
    // Optional note the user can attach to explain the milestone
    note: String
  }]

}, {
  // Mongoose automatically manages createdAt and updatedAt timestamps.
  timestamps: true
});

// ── Virtual: progress ─────────────────────────────────────────────────────────
// A virtual field is computed on the fly and never stored in the database.
// progress returns how far through the goal the user is, capped at 100%
// (so a currentValue that exceeds targetValue still shows 100%, not 110%).
goalSchema.virtual('progress').get(function() {
  return Math.min((this.currentValue / this.targetValue) * 100, 100);
});

// Include the `progress` virtual whenever the document is converted to JSON or
// a plain object, so API responses automatically include the percentage.
goalSchema.set('toJSON',   { virtuals: true });
goalSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Goal', goalSchema);
