const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

// Import routes (REMOVED uploadRoutes)
const authRoutes = require("./routes/auth");
const tradeRoutes = require("./routes/trades");
const goalRoutes = require("./routes/goals");
const settingsRoutes = require("./routes/settings");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes (REMOVED upload route)
app.use("/api/auth", authRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/settings", settingsRoutes);

// Define the HTML directory path
const htmlDir = path.join(__dirname, "..", "Frontend", "frontend", "src", "HTML");

// Serve static files from the HTML folder
app.use(express.static(htmlDir));

// Root route - serves home page
app.get("/", (req, res) => {
  res.sendFile(path.join(htmlDir, "home.html"));
});

// Login route
app.get("/login", (req, res) => {
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


// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://hammadshahzad861_db_user:L7nkzZnwYs5AmnNg@cluster1.u10tbzm.mongodb.net/tradenotion?retryWrites=true&w=majority&appName=Cluster1";

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log("✅ MongoDB Atlas connected successfully");
    console.log("📊 Database: tradenotion");
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('🔗 Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected from MongoDB Atlas');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed through app termination');
  process.exit(0);
});

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