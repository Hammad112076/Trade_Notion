const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);

// Define the HTML directory path
const htmlDir = path.join(__dirname, "..", "Frontend", "frontend", "src", "HTML");

console.log("=== SERVER STARTUP DEBUG ===");
console.log("HTML Directory:", htmlDir);
console.log("Checking if directory exists:", fs.existsSync(htmlDir));

if (fs.existsSync(htmlDir)) {
    console.log("Files in HTML directory:");
    fs.readdirSync(htmlDir).forEach(file => {
        console.log("  -", file);
    });
}

// Serve static files from the HTML folder
app.use(express.static(htmlDir));

// Root route - serves home page
app.get("/", (req, res) => {
  const filePath = path.join(htmlDir, "home.html");
  console.log("Attempting to serve:", filePath);
  console.log("File exists:", fs.existsSync(filePath));
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("home.html not found at: " + filePath);
  }
  res.sendFile(filePath);
});

// Login route
app.get("/login", (req, res) => {
  const filePath = path.join(htmlDir, "login.html");
  console.log("Attempting to serve:", filePath);
  console.log("File exists:", fs.existsSync(filePath));
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("login.html not found at: " + filePath);
  }
  res.sendFile(filePath);
});

// Register route
app.get("/register", (req, res) => {
  const filePath = path.join(htmlDir, "register.html");
  console.log("Attempting to serve:", filePath);
  console.log("File exists:", fs.existsSync(filePath));
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("register.html not found at: " + filePath);
  }
  res.sendFile(filePath);
});

// Dashboard route
app.get("/dashboard", (req, res) => {
  const filePath = path.join(htmlDir, "dashboard.html");
  console.log("Attempting to serve:", filePath);
  console.log("File exists:", fs.existsSync(filePath));
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("dashboard.html not found at: " + filePath);
  }
  res.sendFile(filePath);
});

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/tradenotion")
  .then(() => console.log("MongoDB connected locally"))
  .catch(err => console.error("MongoDB connection error:", err));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("=========================");
});