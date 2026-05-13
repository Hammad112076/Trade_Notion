/**
 * middleware/auth.js — JWT authentication middleware
 *
 * Exports a single middleware function: `protect`.
 *
 * How it works:
 *   1. Looks for an "Authorization: Bearer <token>" header on the incoming request.
 *   2. Verifies the token's signature using JWT_SECRET.
 *   3. Loads the full user document from MongoDB and attaches it to req.user.
 *   4. Calls next() so the actual route handler can run.
 *
 * If anything goes wrong (missing token, bad signature, deleted user) it
 * immediately returns a 401 Unauthorized response and never calls next().
 *
 * Usage — add to any route that requires a logged-in user:
 *   router.get('/me', protect, (req, res) => { ... req.user ... });
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// JWT_SECRET must match the secret used when the token was signed in routes/auth.js.
// No fallback — missing JWT_SECRET crashes the server on startup rather than
// silently signing tokens with a weak default string.
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * protect — Express middleware that enforces authentication.
 *
 * Attaches the authenticated user document to req.user so downstream
 * route handlers can access the current user's ID, preferences, etc.
 *
 * @param {import('express').Request}  req  - The incoming HTTP request.
 * @param {import('express').Response} res  - The outgoing HTTP response.
 * @param {Function}                   next - Call this to proceed to the route handler.
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // The browser sends the JWT as:  Authorization: Bearer eyJhbGci...
    // We check that the header exists and starts with the word "Bearer".
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Split "Bearer eyJhbGci..." on the space and take the second part (the token itself)
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token was found in the header, the request is not authenticated — reject it.
    if (!token) {
      return res.status(401).json({ message: 'Not authorized to access this route' });
    }

    try {
      // jwt.verify throws if the token is expired, tampered with, or signed with the wrong secret.
      // On success it returns the decoded payload, which contains the user's MongoDB _id.
      const decoded = jwt.verify(token, JWT_SECRET);

      // Fetch the full user document so the route handler has access to name, email, preferences, etc.
      req.user = await User.findById(decoded.id);

      // Edge case: the token is valid but the user was deleted from the database after it was issued.
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Authentication passed — let the route handler run.
      next();
    } catch (error) {
      // jwt.verify threw (expired, invalid signature, malformed token)
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } catch (error) {
    // Unexpected server-side error (e.g. database connection dropped during User.findById)
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
