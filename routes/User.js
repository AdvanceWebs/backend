const express = require("express");
const handleAccessToken = require("../middlewares/authMiddleware");
const {
  registerUser,
  loginUserService,
  getProfile,
} = require("../services/userService");
const validateUser = require("../validators/userValidator");
const router = express.Router();

// POST /user/register
router.post("/register", validateUser, async (req, res) => {
  const user = req.body;

  try {
    const savedUser = await registerUser(user);
    console.log("User created:", savedUser);
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error(error.message);
    if (error.message === "Email already exists.") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message === "Username already exists.") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message === "Missing required user information.") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// Login User
router.post("/login", async (req, res) => {
  const { email, password, username } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Missing required information." });
    }

    const token = await loginUserService(email, password);
    res.json({ data: token });
  } catch (error) {
    console.error(error.message);
    if (error.message === "Invalid username or password.") {
      return res.status(401).json({ message: error.message });
    }
    if (error.message === "Username and password are required.") {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Server error" });
  }
});

// Profile Route (Protected)
router.get("/profile", handleAccessToken, async (req, res) => {
  try {
    const userProfile = await getProfile(req.user.email);
    res.json(userProfile);
  } catch (error) {
    console.error(error.message);
    if (error.message === "User not found") {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
