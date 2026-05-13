/**
 * models/Trade.js — Mongoose schema and model for a single trade entry
 *
 * A Trade document captures everything about one trading event:
 *   - What was traded (symbol, direction, session, strategy)
 *   - Execution details (entry/exit prices, share count)
 *   - Outcome (P&L, result — win/loss/breakeven)
 *   - Risk management (stop-loss, take-profit, risk amount, R:R ratio)
 *   - Psychology (confidence level, emotion before/after)
 *   - Post-trade review (mistake tags, what went right/wrong)
 *   - Market context (market condition)
 *
 * A pre-save hook automatically calculates P&L from prices and determines
 * the win/loss/breakeven result, so those fields are always consistent.
 *
 * Three indexes are created for the most common query patterns so MongoDB
 * does not need to do full-collection scans when filtering a user's trades.
 *
 * The model is exported as "Trade" → collection "trades" in MongoDB.
 */

const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({

  // ── Ownership ────────────────────────────────────────────────────────────────

  // References the User document that owns this trade.
  // Every query filters by this field so users can only see their own trades.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Basic trade information ───────────────────────────────────────────────────

  // The ticker or instrument symbol, e.g. "NQ", "AAPL", "GBPUSD".
  // Stored in uppercase so "aapl" and "AAPL" are treated as the same symbol.
  symbol: {
    type: String,
    required: [true, 'Please provide a symbol'],
    uppercase: true,
    trim: true
  },

  // The date (and optionally time) when the trade was taken.
  // Stored as UTC midnight so calendar grouping by day is reliable.
  date: {
    type: Date,
    required: true,
    default: Date.now
  },

  // Optional human-readable day label selected by the user, e.g. "Monday".
  // Lets the user override the auto-detected day of the week.
  tradingDay: {
    type: String,
    default: null
  },

  // ── Direction ────────────────────────────────────────────────────────────────

  // Whether the trade was a buy (long) or sell-short (short).
  // P&L is calculated differently depending on direction (see pre-save hook).
  direction: {
    type: String,
    required: true,
    enum: ['long', 'short']
  },

  // ── Session ──────────────────────────────────────────────────────────────────

  // The market session during which the trade was active.
  // Used in analytics to reveal which sessions are most profitable.
  session: {
    type: String,
    enum: ['pre-market', 'morning', 'midday', 'afternoon', 'power-hour', 'after-hours'],
    default: null
  },

  // ── Strategy / model ─────────────────────────────────────────────────────────

  // The trading strategy used, e.g. "Breakout", "ORB", or a custom strategy
  // the user added via the Settings page.  Free-text so users can enter anything.
  model: {
    type: String,
    default: null
  },

  // ── Execution prices ─────────────────────────────────────────────────────────

  // Price at which the position was opened.
  entryPrice: {
    type: Number
  },

  // Price at which the position was closed.
  exitPrice: {
    type: Number
  },

  // Number of shares, contracts, or units traded.
  // Combined with entry/exit prices by the pre-save hook to compute P&L.
  shares: {
    type: Number,
    default: null
  },

  // ── P&L ──────────────────────────────────────────────────────────────────────

  // Net profit or loss on this trade in the user's chosen currency.
  // Positive = profit, negative = loss.
  // Can be set directly, or auto-calculated from entry/exit/shares in the pre-save hook.
  profitLoss: {
    type: Number,
    required: true
  },

  // Running total of all P&L up to and including this trade (not auto-updated;
  // kept for historical reference if the client ever needs a quick cumulative value).
  cumulativePL: {
    type: Number,
    default: 0
  },

  // ── Risk management ──────────────────────────────────────────────────────────

  // Risk-to-reward ratio as a human-readable string, e.g. "1:2.5".
  // Entered manually by the user — not calculated automatically.
  riskRewardRatio: {
    type: String,
    default: null
  },

  // Price level at which the trade would be automatically closed to cap losses.
  stopLoss: {
    type: Number
  },

  // Price level at which the user planned to take profits.
  takeProfit: {
    type: Number
  },

  // Dollar amount the user was willing to risk on this trade (i.e. the "1R" value).
  riskAmount: {
    type: Number
  },

  // ── Outcome ──────────────────────────────────────────────────────────────────

  // Win, loss, or breakeven — determined automatically from profitLoss in the
  // pre-save hook, so this field is always consistent with the P&L value.
  result: {
    type: String,
    enum: ['win', 'loss', 'breakeven'],
    required: true
  },

  // ── Psychology ───────────────────────────────────────────────────────────────

  // How confident the user felt before entering, on a scale of 1 (very unsure) to 10 (very sure).
  confidenceLevel: {
    type: Number,
    min: 1,
    max: 10,
    default: null
  },

  // Emotional state just BEFORE entering the trade.
  // Tracking pre-trade emotions helps identify patterns (e.g. "I lose when I trade impulsively").
  emotionBefore: {
    type: String,
    enum: ['confident', 'anxious', 'excited', 'fearful', 'calm', 'greedy', 'disciplined', 'impulsive', 'neutral'],
    default: null
  },

  // Emotional state just AFTER the trade closed.
  // Comparing before/after helps the user understand how outcomes affect their mindset.
  emotionAfter: {
    type: String,
    enum: ['satisfied', 'disappointed', 'regretful', 'proud', 'frustrated', 'relieved', 'angry', 'neutral'],
    default: null
  },

  // ── Post-trade review ─────────────────────────────────────────────────────────

  // Array of short mistake labels, e.g. ["early entry", "broke rules"].
  // Users can create their own custom tags in Settings and reuse them here.
  mistakeTag: [{
    type: String
  }],

  // Free-text notes on what the user executed well during this trade.
  whatWentRight: {
    type: String,
    maxlength: 2000
  },

  // Free-text notes on what the user could have done better.
  whatWentWrongI: {
    type: String,
    maxlength: 2000
  },

  // ── Pre-trade / post-trade notes ──────────────────────────────────────────────

  // Thoughts written BEFORE entering the trade (thesis, planned entry, risk).
  preTradeNotes: {
    type: String,
    maxlength: 2000
  },

  // Thoughts written AFTER the trade (outcome review, lessons learned).
  postTradeNotes: {
    type: String,
    maxlength: 2000
  },

  // ── Market context ────────────────────────────────────────────────────────────

  // Describes the broader market environment during the trade.
  // Useful for spotting which conditions suit the user's strategies.
  marketCondition: {
    type: String,
    enum: ['trending', 'ranging', 'volatile', 'calm']
  },

  // ── Media ─────────────────────────────────────────────────────────────────────

  // Array of URLs or file paths to chart screenshots attached to this trade.
  screenshots: [{
    type: String
  }],

  // Additional free-form labels for flexible filtering (e.g. "earnings play", "FOMC day").
  tags: [{
    type: String
  }]

}, {
  // Automatically maintain createdAt (when the trade was logged) and
  // updatedAt (when it was last edited) timestamps.
  timestamps: true
});

// ── Pre-save hook — auto-calculate P&L and result ──────────────────────────────
// Runs before every .save() call.
// If all three execution fields (entryPrice, exitPrice, shares) are present,
// it computes P&L using the correct formula for the trade direction:
//   Long:  (exitPrice − entryPrice) × shares  → positive when price went up
//   Short: (entryPrice − exitPrice) × shares  → positive when price went down
// After calculating (or if prices are not provided), it sets the result field
// based on whether profitLoss is positive, negative, or exactly zero.
tradeSchema.pre('save', function() {
  if (this.entryPrice != null && this.exitPrice != null && this.shares) {
    if (this.direction === 'long') {
      // For a long position: profit is made when the exit price exceeds the entry price
      this.profitLoss = (this.exitPrice - this.entryPrice) * this.shares;
    } else {
      // For a short position: profit is made when the price falls (entry > exit)
      this.profitLoss = (this.entryPrice - this.exitPrice) * this.shares;
    }
  }

  // Determine the outcome label from the computed (or user-supplied) P&L value
  if (this.profitLoss > 0) {
    this.result = 'win';
  } else if (this.profitLoss < 0) {
    this.result = 'loss';
  } else {
    this.result = 'breakeven';
  }
});

// ── Database indexes ───────────────────────────────────────────────────────────
// Compound indexes on (user, <field>) cover the most common query patterns.
// Without these, MongoDB would scan every trade document to find a user's trades.

// Used when listing all trades for a user in date order (the default view)
tradeSchema.index({ user: 1, date: -1 });

// Used when filtering by symbol (e.g. "show me all NQ trades")
tradeSchema.index({ user: 1, symbol: 1 });

// Used when filtering by outcome (e.g. "show me only losses")
tradeSchema.index({ user: 1, result: 1 });

module.exports = mongoose.model('Trade', tradeSchema);
