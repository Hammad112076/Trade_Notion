const express = require('express');
const router = express.Router();
const UserSettings = require('../models/UserSettings');
const { protect } = require('../middleware/auth');

router.use(protect);

// @route   GET /api/settings
// @desc    Get user settings
// @access  Private
router.get('/', async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ user: req.user._id });
    
    if (!settings) {
      settings = await UserSettings.create({
        user: req.user._id,
        customModels: [],
        customMistakeTags: []
      });
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
});

// @route   POST /api/settings/models
// @desc    Add custom model
// @access  Private
router.post('/models', async (req, res) => {
  try {
    const { model } = req.body;
    
    if (!model) {
      return res.status(400).json({ message: 'Model name required' });
    }
    
    let settings = await UserSettings.findOne({ user: req.user._id });
    
    if (!settings) {
      settings = await UserSettings.create({ user: req.user._id, customModels: [model] });
    } else {
      if (!settings.customModels.includes(model)) {
        settings.customModels.push(model);
        await settings.save();
      }
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error adding model', error: error.message });
  }
});

// @route   DELETE /api/settings/models/:model
// @desc    Delete custom model
// @access  Private
router.delete('/models/:model', async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ user: req.user._id });
    
    if (settings) {
      settings.customModels = settings.customModels.filter(m => m !== req.params.model);
      await settings.save();
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting model', error: error.message });
  }
});

// @route   POST /api/settings/mistake-tags
// @desc    Add custom mistake tag
// @access  Private
router.post('/mistake-tags', async (req, res) => {
  try {
    const { tag } = req.body;
    
    if (!tag) {
      return res.status(400).json({ message: 'Tag name required' });
    }
    
    let settings = await UserSettings.findOne({ user: req.user._id });
    
    if (!settings) {
      settings = await UserSettings.create({ user: req.user._id, customMistakeTags: [tag] });
    } else {
      if (!settings.customMistakeTags.includes(tag)) {
        settings.customMistakeTags.push(tag);
        await settings.save();
      }
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error adding tag', error: error.message });
  }
});

module.exports = router;