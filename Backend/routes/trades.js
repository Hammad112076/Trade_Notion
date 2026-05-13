/**
 * routes/trades.js — Trade CRUD and performance statistics API endpoints
 *
 * All routes are mounted under /api/trades in server.js.
 * Every route is protected — the `protect` middleware is applied globally via
 * router.use(protect) at the top, so a valid JWT is required for all of them.
 *
 * Routes:
 *   GET    /api/trades/stats/overview — Compute performance metrics (win rate, P&L, etc.)
 *   GET    /api/trades                — List trades with optional filters
 *   POST   /api/trades                — Create a new trade
 *   PUT    /api/trades/:id            — Update an existing trade
 *   DELETE /api/trades/all            — Delete every trade belonging to the user
 *   DELETE /api/trades/:id            — Delete a single trade by ID
 *
 * Helper functions at the module level:
 *   sanitizeEnum()   — Validates a value against an allowed list; returns null if invalid
 *   parseMoney()     — Strips currency symbols so "$182" and "-$50" parse correctly
 *   normalizeToUTC() — Converts any date string to UTC midnight for reliable day-of-week queries
 */

const express   = require('express');
const router    = express.Router();
const Trade     = require('../models/Trade');
const { protect } = require('../middleware/auth');

// Apply the JWT authentication check to EVERY route in this file.
// Any request without a valid Bearer token will receive a 401 before reaching a handler.
router.use(protect);

// ── GET /api/trades/stats/overview ────────────────────────────────────────────
/**
 * Compute summary performance statistics for the logged-in user.
 *
 * Optional query parameter:
 *   ?dateRange=week|month|quarter  — Restrict stats to the last 7, 30, or 90 days.
 *                                    Omit for all-time stats.
 *
 * Metrics returned:
 *   totalPL       — Sum of all P&L values (positive = profitable overall)
 *   totalTrades   — Count of all trades in the period
 *   wins / losses — Count of winning and losing trades
 *   winRate       — wins / totalTrades as a percentage string, e.g. "62.5"
 *   avgWin        — Average P&L of winning trades
 *   avgLoss       — Average absolute P&L of losing trades (always positive)
 *   profitFactor  — totalWins / totalLosses (>1 means the system is profitable)
 *   expectancy    — (winRate × avgWin) − (lossRate × avgLoss) — expected $ per trade
 *
 * Response: 200 { success, stats: { ... } }
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const { dateRange } = req.query;

    // Start with a base query that only returns the current user's trades
    const query = { user: req.user._id };

    // If a date range was requested, add a lower-bound date filter
    if (dateRange) {
      const now  = new Date();
      // Map the shorthand name to a number of days, then convert to milliseconds
      const days = { week: 7, month: 30, quarter: 90 }[dateRange];
      if (days) query.date = { $gte: new Date(now - days * 24 * 60 * 60 * 1000) };
    }

    const trades     = await Trade.find(query);
    const totalTrades = trades.length;

    // Count outcomes
    const wins   = trades.filter(t => t.result === 'win').length;
    const losses  = trades.filter(t => t.result === 'loss').length;

    // Sum all P&L values — missing/null values are treated as $0
    const totalPL = trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);

    // Separate trades into winners and losers for per-category calculations
    const winningTrades = trades.filter(t => t.result === 'win');
    const losingTrades  = trades.filter(t => t.result === 'loss');

    const totalWins   = winningTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    // Math.abs converts the sum of losses (which are negative) into a positive number
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0));

    // Average win per winning trade (0 if there are no winners yet)
    const avgWin  = winningTrades.length > 0 ? (totalWins  / winningTrades.length).toFixed(2) : '0.00';
    // Average loss magnitude per losing trade (0 if there are no losers yet)
    const avgLoss = losingTrades.length  > 0 ? (totalLosses / losingTrades.length).toFixed(2) : '0.00';

    // Profit factor: ratio of gross profits to gross losses.
    // A value > 1 means the system makes more than it loses overall.
    const profitFactor = totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : '0.00';

    // Win rate as a percentage string with one decimal place
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

    // Expectancy = (probability of win × avg win) − (probability of loss × avg loss)
    // Tells the trader how much they can expect to make or lose on average per trade
    const wr        = totalTrades > 0 ? wins / totalTrades : 0;
    const expectancy = ((wr * parseFloat(avgWin)) - ((1 - wr) * parseFloat(avgLoss))).toFixed(2);

    res.json({
      success: true,
      stats: { totalPL: totalPL.toFixed(2), totalTrades, wins, losses, winRate, profitFactor, avgWin, avgLoss, expectancy }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
});

// ── GET /api/trades ────────────────────────────────────────────────────────────
/**
 * Return all trades for the logged-in user, sorted newest-first.
 *
 * Optional query parameters (all can be combined):
 *   ?symbol=NQ          — Filter to trades on a specific symbol (case-insensitive)
 *   ?tradeType=long     — Filter by direction (long or short)
 *   ?status=win         — Filter by result (win, loss, or breakeven)
 *   ?dateRange=today|week|month — Filter to trades in the last day, 7 days, or 30 days
 *
 * Response: 200 { success, count, trades: [...] }
 */
router.get('/', async (req, res) => {
  try {
    const { symbol, tradeType, status, dateRange } = req.query;

    // Always scope to the current user — users cannot see each other's trades
    const query = { user: req.user._id };

    // Symbol filter: convert to uppercase to match how symbols are stored
    if (symbol)    query.symbol    = symbol.toUpperCase();
    // Direction filter: "long" or "short"
    if (tradeType) query.direction = tradeType;
    // Result filter: "win", "loss", or "breakeven"
    if (status)    query.result    = status;

    // Date range filter: calculate the start date and add a $gte (≥) condition
    if (dateRange) {
      const now = new Date();
      let startDate;

      switch(dateRange) {
        case 'today':
          // Set time to midnight so "today" means the full calendar day
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          // Subtract 7 days from the current time
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          // Subtract 1 month from the current time
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = null;
      }

      if (startDate) {
        query.date = { $gte: startDate };
      }
    }

    // Sort by date descending so the most recent trade appears first in the list
    const trades = await Trade.find(query).sort({ date: -1 });

    res.json({ success: true, count: trades.length, trades });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ message: 'Error fetching trades', error: error.message });
  }
});

// ── Enum allow-lists ────────────────────────────────────────────────────────────
// These arrays mirror the enum values on the Trade schema.
// sanitizeEnum() checks incoming strings against them before saving, which
// prevents invalid values from ever reaching the database even if the client
// sends something unexpected (e.g. from a CSV import).

const VALID_SESSIONS   = ['pre-market','morning','midday','afternoon','power-hour','after-hours'];
const VALID_EMOTION_B  = ['confident','anxious','excited','fearful','calm','greedy','disciplined','impulsive','neutral'];
const VALID_EMOTION_A  = ['satisfied','disappointed','regretful','proud','frustrated','relieved','angry','neutral'];
const VALID_RESULTS    = ['win','loss','breakeven'];
const VALID_CONDITIONS = ['trending','ranging','volatile','calm'];

// ── Helper: sanitizeEnum ───────────────────────────────────────────────────────
/**
 * Return the lowercase-trimmed value if it exists in `allowed`, otherwise null.
 * Prevents invalid enum values from being stored (e.g. if CSV data has typos).
 *
 * @param  {any}      value   — The raw input value (may be undefined, null, or a string).
 * @param  {string[]} allowed — The list of permitted values.
 * @returns {string|null}     — The sanitized value, or null if it wasn't in the list.
 */
function sanitizeEnum(value, allowed) {
  if (!value) return null;
  const v = value.toString().toLowerCase().trim();
  return allowed.includes(v) ? v : null;
}

// ── Helper: parseMoney ────────────────────────────────────────────────────────
/**
 * Strip currency symbols and other non-numeric characters from a value so it
 * can be parsed as a JavaScript float.
 *
 * Handles common real-world formats:
 *   "$182"      → 182
 *   "-$182.00"  → -182
 *   "£50.50"    → 50.5
 *   "(100)"     → -100 is NOT handled here (handled in the CSV importer client-side)
 *
 * @param  {any}    v — Raw input (string, number, or null/undefined).
 * @returns {number}  — Parsed float, or 0 if the value cannot be parsed.
 */
function parseMoney(v) {
  if (v == null) return 0;
  // [^0-9.\-] removes everything that isn't a digit, dot, or minus sign
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Helper: normalizeToUTC ────────────────────────────────────────────────────
/**
 * Convert a date string to a UTC midnight Date object so that day-of-week
 * calculations (getUTCDay()) are consistent regardless of the server's timezone.
 *
 * Supports two formats:
 *   ISO:    "2025-06-23"    → parsed directly via Date.UTC
 *   Locale: "June 23, 2025" → parsed via new Date(), then midnight-ified in UTC
 *
 * @param  {string|null} dateStr — The raw date string from the request body or CSV.
 * @returns {Date|null}          — A UTC midnight Date, or null if parsing fails.
 */
function normalizeToUTC(dateStr) {
  if (!dateStr) return null;
  const s   = String(dateStr).trim();
  // Try ISO format first (YYYY-MM-DD) — most reliable because it has no locale ambiguity
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  // Fall back to locale string parsing (e.g. "June 23, 2025")
  const d = new Date(s);
  if (isNaN(d)) return null;
  // Re-express as UTC midnight so the stored date doesn't drift with the timezone offset
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ── POST /api/trades ───────────────────────────────────────────────────────────
/**
 * Create a new trade entry.
 *
 * The request body can come from two sources:
 *   1. The New Trade form (new-trade.html) — clean, validated data
 *   2. The CSV importer (trades.html) — flexible, potentially messy data
 *
 * Both sources are normalised here before the Trade document is created:
 *   - direction aliases ("sell" → "short")
 *   - currency-formatted P&L strings ("$182" → 182)
 *   - enum values are sanitized against the allow-lists above
 *   - dates are converted to UTC midnight
 *
 * Request body: { symbol, date, direction|tradeType, shares, profitLoss|status,
 *                 strategy|model, notes: { tradingDay, session, riskRewardRatio,
 *                 confidenceLevel, emotionBefore, emotionAfter, mistakeTags,
 *                 whatWentRight, whatWentWrong } }
 *
 * Response: 201 { success, trade }
 * Errors:   400 on validation failure
 */
router.post('/', async (req, res) => {
  try {
    const {
      symbol, tradeType, direction, date,
      entryPrice, exitPrice, shares,
      profitLoss, status, result,
      strategy, model: modelField,
      notes = {}
    } = req.body;

    // Parse numeric fields — null is kept as null (the Trade schema allows optional prices)
    const entry = entryPrice != null ? parseFloat(entryPrice) : null;
    const exit  = exitPrice  != null ? parseFloat(exitPrice)  : null;
    const qty   = shares     != null ? parseFloat(shares)     : null;

    // Normalise direction: accept "sell" from CSV exports, default to "long"
    const rawDir = (direction || tradeType || 'long').toLowerCase();
    const dir    = rawDir === 'short' || rawDir === 'sell' ? 'short' : 'long';

    // Strip any currency formatting from the P&L value
    const pl = parseMoney(profitLoss);

    // Determine the result label: prefer an explicit value, fall back to deriving it from P&L
    const resolvedResult = sanitizeEnum(result || status, VALID_RESULTS)
                        || (pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven');

    // Build the document — spread-in optional price fields only when they are present,
    // so we don't store null for fields the user left blank
    const tradeData = {
      user:            req.user._id,
      symbol,
      date:            normalizeToUTC(date),
      direction:       dir,
      model:           modelField || strategy || null,
      ...(entry !== null && { entryPrice: entry }),
      ...(exit  !== null && { exitPrice:  exit  }),
      ...(qty   !== null && { shares:     qty   }),
      profitLoss:      pl,
      result:          resolvedResult,
      // Psychology and review fields come in the nested `notes` object
      tradingDay:      notes.tradingDay                                 || null,
      session:         sanitizeEnum(notes.session, VALID_SESSIONS),
      riskRewardRatio: notes.riskRewardRatio                            || null,
      confidenceLevel: notes.confidenceLevel                            || null,
      emotionBefore:   sanitizeEnum(notes.emotionBefore, VALID_EMOTION_B),
      emotionAfter:    sanitizeEnum(notes.emotionAfter,  VALID_EMOTION_A),
      mistakeTag:      notes.mistakeTags || [],
      whatWentRight:   notes.whatWentRight  || null,
      whatWentWrongI:  notes.whatWentWrong  || null,
    };

    const trade = await Trade.create(tradeData);

    res.status(201).json({ success: true, trade });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(400).json({ message: error.message || 'Error creating trade' });
  }
});

// ── PUT /api/trades/:id ────────────────────────────────────────────────────────
/**
 * Update an existing trade.
 *
 * Uses findOneAndUpdate with both the trade _id AND the current user's ID in
 * the filter — this means a user cannot edit another user's trade even if they
 * know its ID (the document simply won't be found and a 404 is returned).
 *
 * runValidators: false — skips Mongoose schema validation on update because
 * partial updates (only changing a few fields) would fail required-field checks.
 *
 * Only fields present in the request body are applied; undefined fields are
 * skipped using spread conditionals (...(field !== undefined && { ... })).
 *
 * Request body: same shape as POST, all fields optional
 * Response: 200 { success, trade }
 * Errors:   404 if trade not found or doesn't belong to user
 *           500 on unexpected error
 */
router.put('/:id', async (req, res) => {
  try {
    const {
      symbol, date, direction, tradeType, shares,
      profitLoss, result, status,
      strategy, model: modelField,
      notes = {}
    } = req.body;

    const pl  = parseFloat(profitLoss) || 0;
    const dir = direction || tradeType || 'long';
    // Derive result from P&L if not explicitly provided in the request
    const resolvedResult = result || status || (pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven');

    // Build the update object — only include notes fields that were actually sent
    // (if notes.session is undefined it means the client didn't touch that field
    //  and we should leave the stored value unchanged)
    const update = {
      ...(symbol    && { symbol: symbol.toUpperCase() }),
      ...(date      && { date: normalizeToUTC(date) }),
      direction:       dir,
      model:           modelField || strategy,
      ...(shares != null && { shares: parseFloat(shares) || null }),
      profitLoss:      pl,
      result:          resolvedResult,
      ...(notes.tradingDay      !== undefined && { tradingDay:     notes.tradingDay      || null }),
      ...(notes.session         !== undefined && { session:        notes.session         || null }),
      ...(notes.riskRewardRatio !== undefined && { riskRewardRatio:notes.riskRewardRatio || null }),
      ...(notes.confidenceLevel !== undefined && { confidenceLevel:notes.confidenceLevel || null }),
      ...(notes.emotionBefore   !== undefined && { emotionBefore:  notes.emotionBefore ? notes.emotionBefore.toLowerCase() : null }),
      ...(notes.emotionAfter    !== undefined && { emotionAfter:   notes.emotionAfter  ? notes.emotionAfter.toLowerCase()  : null }),
      ...(notes.mistakeTags     !== undefined && { mistakeTag:     notes.mistakeTags   || [] }),
      ...(notes.whatWentRight   !== undefined && { whatWentRight:  notes.whatWentRight  || null }),
      ...(notes.whatWentWrong   !== undefined && { whatWentWrongI: notes.whatWentWrong  || null }),
    };

    // The user filter ensures ownership — a user can only update their own trades
    const trade = await Trade.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      update,
      { new: true, runValidators: false }
    );

    if (!trade) return res.status(404).json({ message: 'Trade not found' });

    res.json({ success: true, trade });
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ message: 'Error updating trade', error: error.message });
  }
});

// ── DELETE /api/trades/all ─────────────────────────────────────────────────────
/**
 * Delete every trade belonging to the logged-in user.
 *
 * IMPORTANT: This route must be registered BEFORE DELETE /api/trades/:id,
 * otherwise Express would try to match "all" as a MongoDB ObjectId and fail.
 *
 * The UI shows two confirmation prompts before calling this endpoint.
 *
 * Response: 200 { success, deleted: <count> }
 */
router.delete('/all', async (req, res) => {
  try {
    // deleteMany returns { deletedCount: N } — we pass that count back so the UI
    // can confirm exactly how many records were removed
    const result = await Trade.deleteMany({ user: req.user._id });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Error deleting all trades:', error);
    res.status(500).json({ message: 'Error deleting trades', error: error.message });
  }
});

// ── DELETE /api/trades/:id ─────────────────────────────────────────────────────
/**
 * Delete a single trade by its MongoDB _id.
 *
 * The ownership check (user: req.user._id) in the query means a user cannot
 * delete another user's trade by guessing its ID — the document simply won't
 * be found and a 404 is returned.
 *
 * Response: 200 { success, message }
 * Errors:   404 if the trade doesn't exist or doesn't belong to the user
 */
router.delete('/:id', async (req, res) => {
  try {
    // findOneAndDelete returns the deleted document, or null if not found
    const trade = await Trade.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }

    res.json({ success: true, message: 'Trade deleted' });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ message: 'Error deleting trade', error: error.message });
  }
});

module.exports = router;
