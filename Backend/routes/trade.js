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
    
    // Build query
    const query = { user: req.user._id };
    
    if (symbol) query.symbol = symbol.toUpperCase();
    if (tradeType) query.tradeType = tradeType;
    if (status) query.status = status;
    
    // Date range filter
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

// @route   GET /api/trades/:id
// @desc    Get single trade
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const trade = await Trade.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    
    res.json({
      success: true,
      trade
    });
  } catch (error) {
    console.error('Error fetching trade:', error);
    res.status(500).json({ message: 'Error fetching trade', error: error.message });
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

// @route   PUT /api/trades/:id
// @desc    Update trade
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    let trade = await Trade.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    
    trade = await Trade.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      trade
    });
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ message: 'Error updating trade', error: error.message });
  }
});

// @route   DELETE /api/trades/:id
// @desc    Delete trade
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const trade = await Trade.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    
    await trade.deleteOne();
    
    res.json({
      success: true,
      message: 'Trade deleted'
    });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ message: 'Error deleting trade', error: error.message });
  }
});

// @route   GET /api/trades/stats/overview
// @desc    Get trading statistics
// @access  Private
router.get('/stats/overview', async (req, res) => {
  try {
    const trades = await Trade.find({ user: req.user._id });
    
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.status === 'win').length;
    const losses = trades.filter(t => t.status === 'loss').length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    
    const totalPL = trades.reduce((sum, t) => sum + t.profitLoss, 0);
    const totalWins = trades.filter(t => t.status === 'win').reduce((sum, t) => sum + t.profitLoss, 0);
    const totalLosses = Math.abs(trades.filter(t => t.status === 'loss').reduce((sum, t) => sum + t.profitLoss, 0));
    
    const avgWin = wins > 0 ? totalWins / wins : 0;
    const avgLoss = losses > 0 ? totalLosses / losses : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
    const expectancy = totalTrades > 0 ? totalPL / totalTrades : 0;
    
    res.json({
      success: true,
      stats: {
        totalTrades,
        wins,
        losses,
        winRate: winRate.toFixed(2),
        totalPL: totalPL.toFixed(2),
        avgWin: avgWin.toFixed(2),
        avgLoss: avgLoss.toFixed(2),
        profitFactor: profitFactor.toFixed(2),
        expectancy: expectancy.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching statistics', error: error.message });
  }
});

module.exports = router;