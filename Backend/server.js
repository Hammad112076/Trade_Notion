const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth"); // Adjust if auth.js is in ../routes

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);

// Serve static files from the HTML folder
app.use(express.static(path.join(__dirname, "../Frontend/frontend/src/HTML")));

// Root route - serves login page
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/frontend/src/HTML/register.html"));
});

// Dashboard route
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/frontend/src/HTML/dashboard.html"));
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/frontend/src/HTML/home.html"));
});
// Root route - serves login page
app.get("/Login", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/frontend/src/HTML/Login.html"));
});
// MongoDB connection
mongoose.connect("mongodb://localhost:27017/tradenotion")
  .then(() => console.log("MongoDB connected locally"))
  .catch(err => console.error("MongoDB connection error:", err));

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
