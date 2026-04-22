const express = require('express');
const router = express.Router();
const Trade = require('../models/Trade');
const { protect } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/trades/stats/overview
// @desc    Get performance stats for logged-in user
// @access  Private
router.get('/stats/overview', async (req, res) => {
  try {
    const { dateRange } = req.query;
    const query = { user: req.user._id };

    if (dateRange) {
      const now = new Date();
      const days = { week: 7, month: 30, quarter: 90 }[dateRange];
      if (days) query.date = { $gte: new Date(now - days * 24 * 60 * 60 * 1000) };
    }

    const trades = await Trade.find(query);
    const totalTrades = trades.length;
    const wins   = trades.filter(t => t.result === 'win').length;
    const losses = trades.filter(t => t.result === 'loss').length;
    const totalPL = trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);

    const winningTrades = trades.filter(t => t.result === 'win');
    const losingTrades  = trades.filter(t => t.result === 'loss');
    const totalWins   = winningTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0));

    const avgWin  = winningTrades.length > 0 ? (totalWins  / winningTrades.length).toFixed(2) : '0.00';
    const avgLoss = losingTrades.length  > 0 ? (totalLosses / losingTrades.length).toFixed(2) : '0.00';
    const profitFactor = totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : '0.00';
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
    const wr = totalTrades > 0 ? wins / totalTrades : 0;
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

// @route   GET /api/trades
// @desc    Get all trades for logged-in user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { symbol, tradeType, status, dateRange } = req.query;
    
    const query = { user: req.user._id };
    
    if (symbol) query.symbol = symbol.toUpperCase();
    if (tradeType) query.direction = tradeType;
    if (status) query.result = status;
    
    if (dateRange) {
      const now = new Date();
      let startDate;
      
      switch(dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.date = { $gte: startDate };
      }
    }
    
    const trades = await Trade.find(query).sort({ date: -1 });
    
    res.json({
      success: true,
      count: trades.length,
      trades
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ message: 'Error fetching trades', error: error.message });
  }
});

// Enum allow-lists for sanitization
const VALID_SESSIONS    = ['pre-market','morning','midday','afternoon','power-hour','after-hours'];
const VALID_EMOTION_B   = ['confident','anxious','excited','fearful','calm','greedy','disciplined','impulsive','neutral'];
const VALID_EMOTION_A   = ['satisfied','disappointed','regretful','proud','frustrated','relieved','angry','neutral'];
const VALID_RESULTS     = ['win','loss','breakeven'];
const VALID_CONDITIONS  = ['trending','ranging','volatile','calm'];

function sanitizeEnum(value, allowed) {
  if (!value) return null;
  const v = value.toString().toLowerCase().trim();
  return allowed.includes(v) ? v : null;
}

// Strip currency symbols and % so "$182" or "-$182.00" parses correctly
function parseMoney(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Always store dates as UTC midnight so getUTCDay() is reliable on the frontend.
// Handles both ISO "2025-06-23" and locale strings like "June 23, 2025".
function normalizeToUTC(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// @route   POST /api/trades
// @desc    Create new trade
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { symbol, tradeType, direction, date, entryPrice, exitPrice, shares,
            profitLoss, status, result, strategy, model: modelField, notes = {} } = req.body;

    const entry = entryPrice != null ? parseFloat(entryPrice) : null;
    const exit  = exitPrice  != null ? parseFloat(exitPrice)  : null;
    const qty   = shares     != null ? parseFloat(shares)     : null;
    const rawDir = (direction || tradeType || 'long').toLowerCase();
    const dir    = rawDir === 'short' || rawDir === 'sell' ? 'short' : 'long';
    const pl     = parseMoney(profitLoss);
    const resolvedResult = sanitizeEnum(result || status, VALID_RESULTS)
                        || (pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven');

    const tradeData = {
      user:             req.user._id,
      symbol,
      date:             normalizeToUTC(date),
      direction:        dir,
      model:            modelField || strategy || null,
      ...(entry !== null && { entryPrice: entry }),
      ...(exit  !== null && { exitPrice:  exit  }),
      ...(qty   !== null && { shares:     qty   }),
      profitLoss:       pl,
      result:           resolvedResult,
      tradingDay:       notes.tradingDay                                           || null,
      session:          sanitizeEnum(notes.session, VALID_SESSIONS),
      riskRewardRatio:  notes.riskRewardRatio                                      || null,
      confidenceLevel:  notes.confidenceLevel                                      || null,
      emotionBefore:    sanitizeEnum(notes.emotionBefore, VALID_EMOTION_B),
      emotionAfter:     sanitizeEnum(notes.emotionAfter,  VALID_EMOTION_A),
      mistakeTag:       notes.mistakeTags || [],
      whatWentRight:    notes.whatWentRight  || null,
      whatWentWrongI:   notes.whatWentWrong  || null,
    };

    const trade = await Trade.create(tradeData);

    res.status(201).json({
      success: true,
      trade
    });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(400).json({ message: error.message || 'Error creating trade' });
  }
});

// @route   PUT /api/trades/:id
// @desc    Update a trade
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const { symbol, date, direction, tradeType, shares, profitLoss, result, status, strategy, model: modelField, notes = {} } = req.body;

    const pl  = parseFloat(profitLoss) || 0;
    const dir = direction || tradeType || 'long';
    const resolvedResult = result || status || (pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven');

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
      ...(notes.emotionBefore   !== undefined && { emotionBefore:  notes.emotionBefore   ? notes.emotionBefore.toLowerCase()  : null }),
      ...(notes.emotionAfter    !== undefined && { emotionAfter:   notes.emotionAfter    ? notes.emotionAfter.toLowerCase()   : null }),
      ...(notes.mistakeTags     !== undefined && { mistakeTag:     notes.mistakeTags     || [] }),
      ...(notes.whatWentRight   !== undefined && { whatWentRight:  notes.whatWentRight   || null }),
      ...(notes.whatWentWrong   !== undefined && { whatWentWrongI: notes.whatWentWrong   || null }),
    };

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

// @route   DELETE /api/trades/all
// @desc    Delete all trades for logged-in user
// @access  Private
router.delete('/all', async (req, res) => {
  try {
    const result = await Trade.deleteMany({ user: req.user._id });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Error deleting all trades:', error);
    res.status(500).json({ message: 'Error deleting trades', error: error.message });
  }
});

// @route   DELETE /api/trades/:id
// @desc    Delete a trade
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
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