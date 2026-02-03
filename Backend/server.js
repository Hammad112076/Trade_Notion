const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

// Import routes
const authRoutes = require("./routes/auth");
const tradeRoutes = require("./routes/trades");
const goalRoutes = require("./routes/goals");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api/goals", goalRoutes);

// Define the HTML directory path
const htmlDir = path.join(__dirname, "..", "Frontend", "frontend", "src", "HTML");

// Serve static files from the HTML folder
app.use(express.static(htmlDir));

// Root route - serves home page
app.get("/", (req, res) => {
  res.sendFile(path.join(htmlDir, "home.html"));
});

// Login route
app.get("/Login", (req, res) => {
  res.sendFile(path.join(htmlDir, "Login.html"));
});

// Register route
app.get("/register", (req, res) => {
  res.sendFile(path.join(htmlDir, "register.html"));
});

// Dashboard route
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(htmlDir, "dashboard.html"));
});

// Trades routes
app.get("/trades", (req, res) => {
  res.sendFile(path.join(htmlDir, "trades.html"));
});

app.get("/new-trade", (req, res) => {
  res.sendFile(path.join(htmlDir, "new-trade.html"));
});

// Analytics route
app.get("/analytics", (req, res) => {
  res.sendFile(path.join(htmlDir, "analytics.html"));
});

// Calendar route
app.get("/calendar", (req, res) => {
  res.sendFile(path.join(htmlDir, "calendar.html"));
});

// Reports route
app.get("/reports", (req, res) => {
  res.sendFile(path.join(htmlDir, "reports.html"));
});

// Goals route
app.get("/goals", (req, res) => {
  res.sendFile(path.join(htmlDir, "goals.html"));
});

// Settings route
app.get("/settings", (req, res) => {
  res.sendFile(path.join(htmlDir, "settings.html"));
});

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/tradenotion")
  .then(() => console.log("✅ MongoDB connected locally"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : {} 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 HTML files location: ${htmlDir}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});