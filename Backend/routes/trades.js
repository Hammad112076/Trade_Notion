const express = require('express');
const router = express.Router();
const Trade = require('../models/Trade');
const { protect } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

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

// @route   POST /api/trades
// @desc    Create new trade
// @access  Private
router.post('/', async (req, res) => {
  try {
    const { symbol, tradeType, direction, date, entryPrice, exitPrice, shares,
            profitLoss, status, result, strategy, model: modelField, notes = {} } = req.body;

    // Calculate P&L and result if not provided
    const entry = entryPrice != null ? parseFloat(entryPrice) : null;
    const exit  = exitPrice  != null ? parseFloat(exitPrice)  : null;
    const qty   = shares     != null ? parseFloat(shares)     : null;
    const dir   = direction || tradeType || 'long';
    const pl    = parseFloat(profitLoss) || 0;
    const resolvedResult = result || status || (pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven');

    const tradeData = {
      user:             req.user._id,
      symbol,
      date,
      direction:        dir,
      model:            modelField || strategy,
      ...(entry !== null && { entryPrice: entry }),
      ...(exit  !== null && { exitPrice:  exit  }),
      ...(qty   !== null && { shares:     qty   }),
      profitLoss:       pl,
      result:           resolvedResult,
      // flatten notes fields
      tradingDay:       notes.tradingDay       || null,
      session:          notes.session          || null,
      riskRewardRatio:  notes.riskRewardRatio  || null,
      confidenceLevel:  notes.confidenceLevel  || null,
      emotionBefore:    notes.emotionBefore    ? notes.emotionBefore.toLowerCase() : null,
      emotionAfter:     notes.emotionAfter     ? notes.emotionAfter.toLowerCase()  : null,
      mistakeTag:       notes.mistakeTags      || [],
      whatWentRight:    notes.whatWentRight    || null,
      whatWentWrongI:   notes.whatWentWrong    || null,
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