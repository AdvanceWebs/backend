const express = require("express");
const { connectDB } = require("./config/database");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Connect to the database
connectDB();

// Middleware
app.use(express.json());
app.use(cors({ origin: "https://ia4-user-registration-frontend.vercel.app" }));

// Routes
app.use("/user", require("./routes/user"));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
