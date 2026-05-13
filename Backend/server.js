/**
 * server.js — Express application entry point
 *
 * This file boots the entire Trade Notion backend:
 *   1. Loads environment variables from .env
 *   2. Creates the Express app and applies middleware (CORS, JSON parsing)
 *   3. Mounts all API route groups under /api/...
 *   4. Registers HTML page routes so each URL returns the correct .html file
 *   5. Connects to MongoDB Atlas
 *   6. Starts listening on the configured PORT
 *
 * Run with:  npm start   (uses node)
 *            npm run dev (uses nodemon — auto-restarts on changes)
 */

// Load PORT, MONGODB_URI, JWT_SECRET, ALLOWED_ORIGINS from the .env file
require("dotenv").config();

const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const path     = require("path");

// ── Route modules ──────────────────────────────────────────────────────────────
// Each module exports an Express Router that handles a specific resource group.
const authRoutes     = require("./routes/auth");     // /api/auth/*   — register, login, profile
const tradeRoutes    = require("./routes/trades");   // /api/trades/* — CRUD + stats
const goalRoutes     = require("./routes/goals");    // /api/goals/*  — CRUD + progress
const settingsRoutes = require("./routes/settings"); // /api/settings/* — custom models, tags

const app  = express();
// Default to port 5000 if PORT is not set in .env
const PORT = process.env.PORT || 5000;

// ── CORS configuration ─────────────────────────────────────────────────────────
// ALLOWED_ORIGINS is a comma-separated list in .env, e.g. "http://localhost:5000,https://myapp.com".
// Requests with no Origin header (same-origin, curl, health checks) are always permitted.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5000"];

app.use(cors({
  // Called for every request — approve origins in the whitelist, block everything else.
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, Render health checks)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  // Required so that the browser sends cookies / Authorization headers cross-origin
  credentials: true
}));

// Parse incoming JSON request bodies so route handlers can access req.body
app.use(express.json());

// ── API Routes ─────────────────────────────────────────────────────────────────
// All data operations go through these routes.  The frontend calls these with
// an Authorization: Bearer <token> header for protected endpoints.
app.use("/api/auth",     authRoutes);     // Authentication & user management
app.use("/api/trades",   tradeRoutes);    // Trade CRUD & statistics
app.use("/api/goals",    goalRoutes);     // Goal CRUD & progress updates
app.use("/api/settings", settingsRoutes); // User customisation (models, tags)

// ── Static HTML serving ────────────────────────────────────────────────────────
// The frontend is plain HTML/CSS/JS — no React build step.  Express serves the
// HTML files directly from this folder.  CSS, images, and any other static
// assets in this directory are also served automatically via express.static.
const htmlDir = path.join(__dirname, "..", "Frontend", "frontend", "src", "HTML");

// Serve all files inside htmlDir as static assets (CSS, images, etc.)
app.use(express.static(htmlDir));

// ── Page routes ────────────────────────────────────────────────────────────────
// Each route sends the matching .html file so users can navigate by URL.
// Without these, navigating to /dashboard would return 404 instead of the page.

// Landing page — shown to unauthenticated visitors
app.get("/", (req, res) => {
  res.sendFile(path.join(htmlDir, "home.html"));
});

// Login page — email + password form that exchanges credentials for a JWT
app.get("/login", (req, res) => {
  res.sendFile(path.join(htmlDir, "login.html"));
});

// Registration page — collects name, email, password, trading experience
app.get("/register", (req, res) => {
  res.sendFile(path.join(htmlDir, "register.html"));
});

// Dashboard — main logged-in home showing stats and recent trades
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(htmlDir, "dashboard.html"));
});

// Trade journal — full list of all trades with filters and CSV import/export
app.get("/trades", (req, res) => {
  res.sendFile(path.join(htmlDir, "trades.html"));
});

// New trade form — Notion-style form to log a single trade
app.get("/new-trade", (req, res) => {
  res.sendFile(path.join(htmlDir, "new-trade.html"));
});

// Analytics — charts (equity curve, drawdown, rolling P&L) and quant tables
app.get("/analytics", (req, res) => {
  res.sendFile(path.join(htmlDir, "analytics.html"));
});

// Calendar — monthly grid view showing wins, losses, and daily P&L
app.get("/calendar", (req, res) => {
  res.sendFile(path.join(htmlDir, "calendar.html"));
});

// Reports — generate and download CSV reports (performance, detailed, monthly, etc.)
app.get("/reports", (req, res) => {
  res.sendFile(path.join(htmlDir, "reports.html"));
});

// Goals — create, track, and update trading goals (profit, win rate, etc.)
app.get("/goals", (req, res) => {
  res.sendFile(path.join(htmlDir, "goals.html"));
});

// Settings — profile, password, notifications, preferences, account deletion
app.get("/settings", (req, res) => {
  res.sendFile(path.join(htmlDir, "settings.html"));
});

// Legal pages — linked from the home page footer and registration form
app.get("/terms",   (req, res) => res.sendFile(path.join(htmlDir, "terms.html")));
app.get("/privacy", (req, res) => res.sendFile(path.join(htmlDir, "privacy.html")));

// ── MongoDB Atlas connection ────────────────────────────────────────────────────
// Mongoose connects to the Atlas cluster defined in MONGODB_URI.
// serverSelectionTimeoutMS: how long to wait when finding a server (5 s).
// socketTimeoutMS: how long to wait for a query response (45 s).
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log("✅ MongoDB Atlas connected successfully");
    console.log("📊 Database: tradenotion");
  })
  .catch(err => {
    // If the initial connection fails (bad URI, network issues), log the error
    // and exit the process — the server cannot function without the database.
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ── Mongoose connection event listeners ────────────────────────────────────────
// These fire throughout the lifetime of the process, not just on startup.

// Fired each time Mongoose successfully opens a connection to Atlas
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to MongoDB Atlas');
});

// Fired if a connection-level error occurs while the app is running
mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

// Fired when Mongoose loses its connection (network interruption, Atlas restart, etc.)
mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected from MongoDB Atlas');
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// When the process receives SIGINT (Ctrl+C in the terminal), close the
// MongoDB connection cleanly before exiting so no in-flight operations are lost.
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed through app termination');
  process.exit(0);
});

// ── Global error-handling middleware ───────────────────────────────────────────
// This runs AFTER all routes.  If any route calls next(err) or throws an
// unhandled error, Express passes it here and we return a 500 JSON response.
// In development the real error message is included; in production it is hidden.
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    // Only expose the raw error text during local development to avoid leaking internals
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// ── Start listening ────────────────────────────────────────────────────────────
// Begin accepting HTTP requests.  PORT comes from .env (default 5000).
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 HTML files location: ${htmlDir}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});
