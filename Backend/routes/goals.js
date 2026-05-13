/**
 * routes/goals.js — Goal CRUD and progress-tracking API endpoints
 *
 * All routes are mounted under /api/goals in server.js.
 * Every route is protected — router.use(protect) at the top enforces this.
 *
 * Routes:
 *   GET    /api/goals              — Return all goals for the user (newest first)
 *   GET    /api/goals/:id          — Return a single goal by its MongoDB _id
 *   POST   /api/goals              — Create a new goal
 *   PUT    /api/goals/:id          — Replace/update a goal's fields
 *   DELETE /api/goals/:id          — Permanently delete a goal
 *   PATCH  /api/goals/:id/progress — Update currentValue; auto-completes the goal
 *                                    if currentValue reaches targetValue
 *
 * All queries filter by { user: req.user._id } so users can only access
 * their own goals.
 */

const express     = require('express');
const router      = express.Router();
const Goal        = require('../models/Goal');
const { protect } = require('../middleware/auth');

// Require a valid JWT for every route in this file
router.use(protect);

// ── GET /api/goals ─────────────────────────────────────────────────────────────
/**
 * Return every goal belonging to the logged-in user.
 * Results are sorted so the most recently created goal appears first,
 * which matches the order they are displayed on the Goals page.
 *
 * Response: 200 { success, count, goals: [...] }
 */
router.get('/', async (req, res) => {
  try {
    // createdAt: -1 → descending order (newest first)
    const goals = await Goal.find({ user: req.user._id }).sort({ createdAt: -1 });

    res.json({ success: true, count: goals.length, goals });
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ message: 'Error fetching goals', error: error.message });
  }
});

// ── GET /api/goals/:id ─────────────────────────────────────────────────────────
/**
 * Return a single goal identified by its MongoDB _id.
 *
 * The ownership check ({ user: req.user._id }) in the query means a user
 * cannot read another user's goal even if they know its ID.
 *
 * Response: 200 { success, goal }
 * Errors:   404 if the goal doesn't exist or belongs to a different user
 */
router.get('/:id', async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id:  req.params.id,   // The MongoDB ObjectId from the URL
      user: req.user._id     // Ownership check — only return if it belongs to this user
    });

    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error fetching goal:', error);
    res.status(500).json({ message: 'Error fetching goal', error: error.message });
  }
});

// ── POST /api/goals ────────────────────────────────────────────────────────────
/**
 * Create a new goal for the logged-in user.
 *
 * The request body should contain the fields defined on the Goal schema:
 *   title, type, targetValue, unit, targetDate (optional), description (optional)
 *
 * The user field is injected server-side from the JWT — the client never sends it.
 * This prevents a user from creating a goal for a different account.
 *
 * Request body: { title, type, targetValue, unit, targetDate?, description? }
 * Response: 201 { success, goal }
 */
router.post('/', async (req, res) => {
  try {
    // Spread the request body and override the user field with the authenticated user's ID
    const goalData = {
      ...req.body,
      user: req.user._id  // Always use the ID from the verified JWT, never trust the client
    };

    const goal = await Goal.create(goalData);

    res.status(201).json({ success: true, goal });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ message: 'Error creating goal', error: error.message });
  }
});

// ── PUT /api/goals/:id ─────────────────────────────────────────────────────────
/**
 * Update an existing goal's fields.
 *
 * First verifies ownership with a findOne — if the goal doesn't exist or
 * belongs to a different user, returns 404 before attempting any update.
 * This two-step approach is slightly safer than passing the user filter directly
 * into findByIdAndUpdate because it gives an explicit ownership error.
 *
 * runValidators: true — re-runs schema validation so enum values and required
 * fields are checked against any new values being set.
 *
 * Request body: any subset of the Goal schema fields
 * Response: 200 { success, goal }
 * Errors:   404 if goal not found or not owned by the user
 */
router.put('/:id', async (req, res) => {
  try {
    // Step 1: Verify the goal exists and belongs to this user
    let goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    // Step 2: Apply the update — { new: true } returns the updated document
    goal = await Goal.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ message: 'Error updating goal', error: error.message });
  }
});

// ── DELETE /api/goals/:id ──────────────────────────────────────────────────────
/**
 * Permanently delete a single goal.
 *
 * The ownership check ensures a user cannot delete another user's goal.
 * goal.deleteOne() is called on the document instance rather than
 * Goal.findByIdAndDelete() so the ownership check in the findOne above
 * is guaranteed to have run first.
 *
 * Response: 200 { success, message }
 * Errors:   404 if the goal doesn't exist or belongs to a different user
 */
router.delete('/:id', async (req, res) => {
  try {
    // Verify ownership before deleting
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    // Delete via the document instance — slightly more semantic than findByIdAndDelete
    await goal.deleteOne();

    res.json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ message: 'Error deleting goal', error: error.message });
  }
});

// ── PATCH /api/goals/:id/progress ─────────────────────────────────────────────
/**
 * Update the currentValue of a goal and optionally mark it as completed.
 *
 * This is a PATCH (partial update) rather than PUT because only the progress
 * value is being changed — not the goal's title, type, or target.
 *
 * Behaviour:
 *   1. Sets goal.currentValue to the submitted value.
 *   2. If currentValue >= targetValue and the goal isn't already completed,
 *      sets status to 'completed' and records the completion date.
 *   3. Appends a milestone entry to the milestones array so the history of
 *      progress updates is preserved.
 *
 * Request body: { currentValue: number }
 * Response: 200 { success, goal }
 * Errors:   404 if goal not found or not owned by the user
 */
router.patch('/:id/progress', async (req, res) => {
  try {
    const { currentValue } = req.body;

    // Ownership check before updating
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });

    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    // Record the new progress value
    goal.currentValue = currentValue;

    // Auto-complete the goal if the target has been reached or exceeded
    if (currentValue >= goal.targetValue && goal.status !== 'completed') {
      goal.status        = 'completed';
      goal.completedDate = Date.now();
    }

    // Append a milestone so the user can later review how their progress changed over time
    goal.milestones.push({
      value: currentValue,
      date:  Date.now()
      // note is optional — not included here but can be added via a PUT update
    });

    await goal.save();

    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ message: 'Error updating progress', error: error.message });
  }
});

module.exports = router;
