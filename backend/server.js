
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Test = require("./models/Test");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const fileRoutes = require("./routes/fileRoutes");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

// Test route
app.get("/api/db-test", async (req, res) => {
  try {
    const record = await Test.create({
      message: "SecureShare database is working!",
    });

    res.status(201).json({
      success: true,
      message: record.message,
      id: record._id,
    });
  } catch (error) {
    console.error("Database test failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Database test failed",
    });
  }
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`SecureShare server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}
app.get("/", (req, res) => {
  res.json({ message: "Welcome to SecureShare API!" });
});

startServer();

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({
    message: "Authentication successful!",
    user: req.user,
  });
});

