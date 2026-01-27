const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  symbol: {
    type: String,
    required: [true, 'Please provide a symbol'],
    uppercase: true,
    trim: true
  },
  tradeType: {
    type: String,
    required: true,
    enum: ['long', 'short']
  },
  entryPrice: {
    type: Number,
    required: [true, 'Please provide entry price']
  },
  exitPrice: {
    type: Number,
    required: [true, 'Please provide exit price']
  },
  shares: {
    type: Number,
    required: [true, 'Please provide number of shares'],
    min: 1
  },
  profitLoss: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['win', 'loss', 'breakeven'],
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Risk Management
  stopLoss: {
    type: Number
  },
  takeProfit: {
    type: Number
  },
  riskAmount: {
    type: Number
  },
  riskRewardRatio: {
    type: String
  },
  // Strategy & Notes
  strategy: {
    type: String,
    enum: ['momentum', 'breakout', 'reversal', 'scalping', 'swing', 'other']
  },
  marketCondition: {
    type: String,
    enum: ['trending', 'ranging', 'volatile', 'calm']
  },
  preTradeNotes: {
    type: String,
    maxlength: 2000
  },
  postTradeNotes: {
    type: String,
    maxlength: 2000
  },
  emotionalState: {
    type: String,
    enum: ['confident', 'anxious', 'greedy', 'fearful', 'disciplined', 'impulsive']
  },
  // Screenshots/Images
  screenshots: [{
    type: String
  }],
  // Tags
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

// Calculate P&L before saving
tradeSchema.pre('save', function(next) {
  if (this.tradeType === 'long') {
    this.profitLoss = (this.exitPrice - this.entryPrice) * this.shares;
  } else {
    this.profitLoss = (this.entryPrice - this.exitPrice) * this.shares;
  }
  
  // Determine status
  if (this.profitLoss > 0) {
    this.status = 'win';
  } else if (this.profitLoss < 0) {
    this.status = 'loss';
  } else {
    this.status = 'breakeven';
  }
  
  next();
});

// Indexes for better query performance
tradeSchema.index({ user: 1, date: -1 });
tradeSchema.index({ user: 1, symbol: 1 });
tradeSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Trade', tradeSchema);