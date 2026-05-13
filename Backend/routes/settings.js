/**
 * routes/settings.js — User customisation settings API endpoints
 *
 * All routes are mounted under /api/settings in server.js.
 * Every route is protected — router.use(protect) enforces a valid JWT.
 *
 * A UserSettings document is created automatically the first time GET /api/settings
 * is called for a user who doesn't have one yet (upsert-on-read pattern).
 *
 * Routes:
 *   GET    /api/settings                    — Fetch (or create) the user's settings
 *   POST   /api/settings/models             — Add a custom trading strategy name
 *   DELETE /api/settings/models/:model      — Remove a custom strategy by name
 *   POST   /api/settings/mistake-tags       — Add a custom mistake tag label
 *   POST   /api/settings/custom-fields      — Replace the entire custom fields array
 */

const express        = require('express');
const router         = express.Router();
const UserSettings   = require('../models/UserSettings');
const { protect }    = require('../middleware/auth');

// Require a valid JWT for every route in this file
router.use(protect);

// ── GET /api/settings ──────────────────────────────────────────────────────────
/**
 * Return the settings document for the logged-in user.
 *
 * If no document exists yet (new user, or first time opening Settings), one is
 * created with empty arrays for customModels and customMistakeTags.  This avoids
 * a 404 on first visit and means every other route can assume the document exists.
 *
 * Response: 200 { success, settings }
 */
router.get('/', async (req, res) => {
  try {
    // Try to find an existing settings document for this user
    let settings = await UserSettings.findOne({ user: req.user._id });

    // If none exists, create a fresh one with default empty lists
    if (!settings) {
      settings = await UserSettings.create({
        user:             req.user._id,
        customModels:     [],
        customMistakeTags: []
      });
    }

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
});

// ── POST /api/settings/models ──────────────────────────────────────────────────
/**
 * Add a custom trading strategy (model) name to the user's settings.
 *
 * The new name is appended to the customModels array only if it isn't already
 * present — duplicate entries are silently ignored.
 *
 * If no settings document exists yet, one is created with this model as the
 * first entry (same upsert-on-write pattern as the GET route).
 *
 * The custom model immediately becomes available in the Strategy dropdown
 * on the New Trade form (new-trade.html loads /api/settings on page load).
 *
 * Request body: { model: string }
 * Response: 200 { success, settings }
 * Errors:   400 if model name is missing
 */
router.post('/models', async (req, res) => {
  try {
    const { model } = req.body;

    // Require a non-empty model name
    if (!model) {
      return res.status(400).json({ message: 'Model name required' });
    }

    let settings = await UserSettings.findOne({ user: req.user._id });

    if (!settings) {
      // First time — create the document with this model as the only entry
      settings = await UserSettings.create({ user: req.user._id, customModels: [model] });
    } else {
      // Only push if the model isn't already in the list (prevents duplicates)
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

// ── DELETE /api/settings/models/:model ────────────────────────────────────────
/**
 * Remove a custom strategy name from the user's settings.
 *
 * The model name is passed as a URL parameter.  Array.filter() removes every
 * entry that matches, then the document is saved.
 *
 * If the settings document doesn't exist, the route succeeds silently
 * (nothing to remove means the desired end state is already achieved).
 *
 * Response: 200 { success, settings }
 */
router.delete('/models/:model', async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ user: req.user._id });

    if (settings) {
      // Filter out the matching model name and save the updated array
      settings.customModels = settings.customModels.filter(m => m !== req.params.model);
      await settings.save();
    }

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting model', error: error.message });
  }
});

// ── POST /api/settings/mistake-tags ───────────────────────────────────────────
/**
 * Add a custom mistake tag label to the user's settings.
 *
 * Mistake tags are short strings the user creates to categorise trading errors
 * (e.g. "chased entry", "revenge trade", "ignored stop-loss").  They appear as
 * selectable chips on the New Trade form so the user can tag each trade.
 *
 * Duplicate tags are silently ignored.
 *
 * Request body: { tag: string }
 * Response: 200 { success, settings }
 * Errors:   400 if tag name is missing
 */
router.post('/mistake-tags', async (req, res) => {
  try {
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ message: 'Tag name required' });
    }

    let settings = await UserSettings.findOne({ user: req.user._id });

    if (!settings) {
      // First time — create the document with this tag as the only entry
      settings = await UserSettings.create({ user: req.user._id, customMistakeTags: [tag] });
    } else {
      // Only push if not already present
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

// ── POST /api/settings/custom-fields ─────────────────────────────────────────
/**
 * Replace the user's entire customFields array with the submitted data.
 *
 * customFields is a flexible Mixed-type array that can hold any JSON structure.
 * This is a full replacement (not append) — whatever is submitted becomes the
 * new stored value, overwriting whatever was there before.
 *
 * If no settings document exists, one is created with the provided customFields.
 *
 * Request body: { customFields: any[] }
 * Response: 200 { success, settings }
 */
router.post('/custom-fields', async (req, res) => {
  try {
    const { customFields } = req.body;

    let settings = await UserSettings.findOne({ user: req.user._id });

    if (!settings) {
      // Create on first write
      settings = await UserSettings.create({ user: req.user._id, customFields });
    } else {
      // Full replacement — overwrites the existing customFields array entirely
      settings.customFields = customFields;
      await settings.save();
    }

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error saving custom fields', error: error.message });
  }
});

module.exports = router;
