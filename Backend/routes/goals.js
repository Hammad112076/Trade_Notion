const express = require('express');
const router = express.Router();
const Goal = require('../models/Goal');
const { protect } = require('../middleware/auth');

// Apply authentication middleware
router.use(protect);

// @route   GET /api/goals
// @desc    Get all goals for user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: goals.length,
      goals
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ message: 'Error fetching goals', error: error.message });
  }
});

// @route   GET /api/goals/:id
// @desc    Get single goal
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const goal = await Goal.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    res.json({
      success: true,
      goal
    });
  } catch (error) {
    console.error('Error fetching goal:', error);
    res.status(500).json({ message: 'Error fetching goal', error: error.message });
  }
});

// @route   POST /api/goals
// @desc    Create new goal
// @access  Private
router.post('/', async (req, res) => {
  try {
    const goalData = {
      ...req.body,
      user: req.user._id
    };
    
    const goal = await Goal.create(goalData);
    
    res.status(201).json({
      success: true,
      goal
    });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ message: 'Error creating goal', error: error.message });
  }
});

// @route   PUT /api/goals/:id
// @desc    Update goal
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    let goal = await Goal.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    goal = await Goal.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      goal
    });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ message: 'Error updating goal', error: error.message });
  }
});

// @route   DELETE /api/goals/:id
// @desc    Delete goal
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const goal = await Goal.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    await goal.deleteOne();
    
    res.json({
      success: true,
      message: 'Goal deleted'
    });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ message: 'Error deleting goal', error: error.message });
  }
});

// @route   PATCH /api/goals/:id/progress
// @desc    Update goal progress
// @access  Private
router.patch('/:id/progress', async (req, res) => {
  try {
    const { currentValue } = req.body;
    
    const goal = await Goal.findOne({ 
      _id: req.params.id, 
      user: req.user._id 
    });
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    goal.currentValue = currentValue;
    
    // Check if goal is completed
    if (currentValue >= goal.targetValue && goal.status !== 'completed') {
      goal.status = 'completed';
      goal.completedDate = Date.now();
    }
    
    // Add milestone
    goal.milestones.push({
      value: currentValue,
      date: Date.now()
    });
    
    await goal.save();
    
    res.json({
      success: true,
      goal
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ message: 'Error updating progress', error: error.message });
  }
});

module.exports = router;