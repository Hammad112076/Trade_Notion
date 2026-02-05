const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Basic Trade Info
  symbol: {
    type: String,
    required: [true, 'Please provide a symbol'],
    uppercase: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  tradingDay: {
    type: String, // e.g., "Day 1", "Day 45", etc.
    default: null
  },
  
  // Trade Direction & Type
  direction: {
    type: String,
    required: true,
    enum: ['long', 'short']
  },
  
  // Session
  session: {
    type: String,
    enum: ['pre-market', 'morning', 'midday', 'afternoon', 'power-hour', 'after-hours'],
    default: null
  },
  
  // Model/Strategy (User can create custom ones)
  model: {
    type: String,
    required: true
  },
  
  // Trade Execution
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
  
  // P&L
  profitLoss: {
    type: Number,
    required: true
  },
  cumulativePL: {
    type: Number,
    default: 0
  },
  
  // Risk/Reward
  riskRewardRatio: {
    type: String, // e.g., "1:2", "1:3"
    default: null
  },
  stopLoss: {
    type: Number
  },
  takeProfit: {
    type: Number
  },
  riskAmount: {
    type: Number
  },
  
  // Result
  result: {
    type: String,
    enum: ['win', 'loss', 'breakeven'],
    required: true
  },
  
  // Confidence & Emotions
  confidenceLevel: {
    type: Number, // 1-10 scale
    min: 1,
    max: 10,
    default: null
  },
  emotionBefore: {
    type: String,
    enum: ['confident', 'anxious', 'excited', 'fearful', 'calm', 'greedy', 'disciplined', 'impulsive', 'neutral'],
    default: null
  },
  emotionAfter: {
    type: String,
    enum: ['satisfied', 'disappointed', 'regretful', 'proud', 'frustrated', 'relieved', 'angry', 'neutral'],
    default: null
  },
  
  // Mistakes & Analysis
  mistakeTag: [{
    type: String // User can add multiple mistake tags
  }],
  whatWentRight: {
    type: String,
    maxlength: 2000
  },
  whatWentWrongI: {
    type: String,
    maxlength: 2000
  },
  
  // Additional Notes
  preTradeNotes: {
    type: String,
    maxlength: 2000
  },
  postTradeNotes: {
    type: String,
    maxlength: 2000
  },
  
  // Market Conditions
  marketCondition: {
    type: String,
    enum: ['trending', 'ranging', 'volatile', 'calm']
  },
  
  // Screenshots/Images
  screenshots: [{
    type: String
  }],
  
  // Additional tags
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

// Calculate P&L before saving
tradeSchema.pre('save', function() {
  if (this.direction === 'long') {
    this.profitLoss = (this.exitPrice - this.entryPrice) * this.shares;
  } else {
    this.profitLoss = (this.entryPrice - this.exitPrice) * this.shares;
  }
  
  // Determine result
  if (this.profitLoss > 0) {
    this.result = 'win';
  } else if (this.profitLoss < 0) {
    this.result = 'loss';
  } else {
    this.result = 'breakeven';
  }
});

// Indexes for better query performance
tradeSchema.index({ user: 1, date: -1 });
tradeSchema.index({ user: 1, symbol: 1 });
tradeSchema.index({ user: 1, result: 1 });

module.exports = mongoose.model('Trade', tradeSchema);