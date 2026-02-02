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
    if (tradeType) query.tradeType = tradeType;
    if (status) query.status = status;
    
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
    const tradeData = {
      ...req.body,
      user: req.user._id
    };
    
    const trade = await Trade.create(tradeData);
    
    res.status(201).json({
      success: true,
      trade
    });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ message: 'Error creating trade', error: error.message });
  }
});

module.exports = router;