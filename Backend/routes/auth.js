/**
 * routes/auth.js — Authentication and user-management API endpoints
 *
 * All routes are mounted under /api/auth in server.js.
 *
 * Public routes (no token required):
 *   POST /api/auth/register  — Create a new user account
 *   POST /api/auth/login     — Authenticate and receive a JWT
 *
 * Protected routes (require "Authorization: Bearer <token>" header):
 *   GET  /api/auth/me            — Return the current user's profile
 *   PUT  /api/auth/profile       — Update name, email, bio, trading experience
 *   PUT  /api/auth/password      — Change password (requires current password)
 *   PUT  /api/auth/preferences   — Update currency, date format, timezone, dark mode
 *   PUT  /api/auth/notifications — Toggle email/reminder/summary notification switches
 *   DELETE /api/auth/account     — Permanently delete the account and all associated data
 *
 * JWT tokens expire after 30 days.  The client stores the token in localStorage
 * and sends it with every protected request via the Authorization header.
 */

const express      = require('express');
const router       = express.Router();
const jwt          = require('jsonwebtoken');
const User         = require('../models/User');
const Trade        = require('../models/Trade');
const Goal         = require('../models/Goal');
const UserSettings = require('../models/UserSettings');
const { protect }  = require('../middleware/auth');

// JWT_SECRET must match the value in middleware/auth.js — both are read from .env.
const JWT_SECRET = process.env.JWT_SECRET;

// ── Helper: generateToken ──────────────────────────────────────────────────────
/**
 * Signs a new JWT containing the user's MongoDB _id.
 * The token expires in 30 days, after which the user must log in again.
 *
 * @param   {string} userId — The MongoDB ObjectId of the user (_id field).
 * @returns {string}        — A signed JWT string to send to the client.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
};

// ── POST /api/auth/register ────────────────────────────────────────────────────
/**
 * Create a new user account.
 *
 * Request body: { name, email, password, tradingExperience }
 *
 * Steps:
 *   1. Check that no existing user has the same email.
 *   2. Create the User document — the pre-save hook hashes the password automatically.
 *   3. Generate a JWT so the user is immediately logged in after registering.
 *
 * Response: 201 { success, token, user: { id, name, email, tradingExperience } }
 * Errors:   400 if the email is already taken
 *           500 on any unexpected server error
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, tradingExperience } = req.body;

    // Prevent duplicate accounts — email must be unique across all users
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create the user — bcrypt hashing happens automatically in the User pre-save hook
    const user = await User.create({
      name,
      email,
      password,
      tradingExperience
    });

    // Issue a JWT so the client can start making authenticated requests right away
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      // Only return the fields the client needs — the password hash is excluded by toJSON()
      user: {
        id:               user._id,
        name:             user.name,
        email:            user.email,
        tradingExperience: user.tradingExperience
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────────
/**
 * Authenticate a user and return a JWT.
 *
 * Request body: { email, password }
 *
 * Steps:
 *   1. Validate that both fields were provided.
 *   2. Find the user by email, explicitly selecting the password hash (it is
 *      hidden by default via select: false on the schema).
 *   3. Use comparePassword() to check the submitted password against the stored hash.
 *   4. Update lastLogin and issue a new JWT.
 *
 * Response: 200 { success, token, user: { id, name, email, tradingExperience } }
 * Errors:   400 if email or password is missing
 *           401 if credentials are wrong (we use the same message for both
 *               "user not found" and "wrong password" to avoid user enumeration)
 *           500 on any unexpected server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Require both fields before hitting the database
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // .select('+password') overrides the schema's select: false so we can compare
    const user = await User.findOne({ email }).select('+password');

    // Return the same generic message whether the user doesn't exist or the
    // password is wrong — prevents attackers from learning which emails are registered
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // comparePassword() uses bcrypt.compare — never decrypts, just re-hashes and checks
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Record when the user last signed in (displayed on the Settings → Plan page)
    user.lastLogin = Date.now();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id:               user._id,
        name:             user.name,
        email:            user.email,
        tradingExperience: user.tradingExperience
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
/**
 * Return the full profile of the currently authenticated user.
 *
 * The `protect` middleware has already verified the token and attached the
 * user to req.user, but we re-fetch here to ensure the data is current
 * (the middleware's cached copy could be stale if another tab changed it).
 *
 * Response: 200 { success, user }
 * Errors:   404 if the user no longer exists
 *           401 (from protect middleware) if no valid token
 */
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/auth/profile ──────────────────────────────────────────────────────
/**
 * Update the user's public profile fields: name, email, bio, tradingExperience.
 *
 * Uses findByIdAndUpdate with { new: true } so the response contains the
 * updated document rather than the pre-update version.
 * runValidators: true re-runs schema validation (e.g. email format check).
 *
 * Request body: { name, email, tradingExperience, bio }
 * Response: 200 { success, user }
 * Errors:   400 on validation failure (e.g. invalid email format)
 */
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, tradingExperience, bio } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, email, tradingExperience, bio },
      { new: true, runValidators: true }
    );
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── PUT /api/auth/password ─────────────────────────────────────────────────────
/**
 * Change the user's password.
 *
 * Requires the current password to prevent an attacker with a stolen session
 * from locking the real owner out of their account.
 *
 * Steps:
 *   1. Validate both fields are present.
 *   2. Load the user with the password hash (hidden by default).
 *   3. Verify the submitted currentPassword matches the stored hash.
 *   4. Set the new password — the pre-save hook will hash it before saving.
 *
 * Request body: { currentPassword, newPassword }
 * Response: 200 { success, message }
 * Errors:   400 if fields are missing or currentPassword is wrong
 */
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both passwords are required' });
    }

    // Re-select +password because protect middleware loads the user without it
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Assigning to user.password marks the field as modified — the pre-save
    // hook will detect this and hash the new value automatically
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── PUT /api/auth/preferences ──────────────────────────────────────────────────
/**
 * Replace the user's preferences object with the submitted body.
 *
 * The entire preferences sub-document is replaced in one operation.
 * Valid fields: { currency, dateFormat, timezone, darkMode }
 *
 * Request body: { currency, dateFormat, timezone, darkMode }
 * Response: 200 { success, user }
 */
router.put('/preferences', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { preferences: req.body }, // Replace the whole preferences sub-document
      { new: true }
    );
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── PUT /api/auth/notifications ────────────────────────────────────────────────
/**
 * Replace the user's notification preferences with the submitted body.
 *
 * Valid fields: { email, tradeReminders, weeklySummary, goalAchievements }
 * All are booleans — true means the user wants to receive that notification type.
 *
 * Request body: { email, tradeReminders, weeklySummary, goalAchievements }
 * Response: 200 { success, user }
 */
router.put('/notifications', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { notifications: req.body }, // Replace the whole notifications sub-document
      { new: true }
    );
    res.json({ success: true, user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── DELETE /api/auth/account ───────────────────────────────────────────────────
/**
 * Permanently delete the user's account and every piece of data linked to it.
 *
 * Runs four delete operations in parallel with Promise.all for efficiency:
 *   1. Delete all Trade documents owned by this user
 *   2. Delete all Goal documents owned by this user
 *   3. Delete the UserSettings document for this user
 *   4. Delete the User document itself
 *
 * This is irreversible — there is no soft-delete or recovery mechanism.
 * The client should clear localStorage (token) and redirect to /login after success.
 *
 * Response: 200 { success, message }
 * Errors:   500 on any unexpected server error
 */
router.delete('/account', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Run all deletions concurrently — no operation depends on another completing first
    await Promise.all([
      Trade.deleteMany({ user: userId }),        // All trade journal entries
      Goal.deleteMany({ user: userId }),         // All goals and their milestones
      UserSettings.deleteMany({ user: userId }), // Custom strategies, tags, fields
      User.findByIdAndDelete(userId),            // The account itself
    ]);

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting account', error: error.message });
  }
});

module.exports = router;
