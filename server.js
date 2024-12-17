const express = require("express");
const session = require("express-session");
const { connectDB } = require("./config/database");
const cors = require("cors");
const passport = require("passport"); // Adjust the path
const route = require("./routes/User");
require("dotenv").config();

const app = express();

// Connect to the database
connectDB();

// Middleware
app.use(express.json());
app.use(cors({ origin: "https://power-ai-theta.vercel.app" }));
// app.use(express.urlencoded({ extended: true }));

// Configure session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET, // Replace with a secure secret key
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport.js
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/user", route);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
