const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Please provide a goal title'],
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  type: {
    type: String,
    required: true,
    enum: ['profit', 'winRate', 'consistency', 'drawdown', 'custom']
  },
  targetValue: {
    type: Number,
    required: true
  },
  currentValue: {
    type: Number,
    default: 0
  },
  unit: {
    type: String,
    enum: ['dollar', 'percent', 'days', 'trades'],
    required: true
  },
  targetDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'failed'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  },
  milestones: [{
    value: Number,
    date: Date,
    note: String
  }]
}, {
  timestamps: true
});

// Calculate progress percentage
goalSchema.virtual('progress').get(function() {
  return Math.min((this.currentValue / this.targetValue) * 100, 100);
});

// Ensure virtuals are included in JSON
goalSchema.set('toJSON', { virtuals: true });
goalSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Goal', goalSchema);