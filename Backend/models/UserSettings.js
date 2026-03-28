const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  customModels: [{
    type: String,
    trim: true
  }],
  customMistakeTags: [{
    type: String,
    trim: true
  }],
  customFields: [{
    type: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);