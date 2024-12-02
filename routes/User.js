const express = require("express");
const handleAccessToken = require("../middlewares/authMiddleware");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const {
  registerUser,
  loginUserService,
  getProfile,
} = require("../services/userService");
const validateUser = require("../validators/userValidator");
const router = express.Router();

const { handleGoogleCallback } = require("../services/AutheService");

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

router.get(
  "/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    // Đăng nhập thành công

    const userInfo = userInfoResponse.data;
    const entity = {
      username: userInfo.email,
      email: userInfo.email,
      firstName: userInfo.given_name || " ",
      lastName: userInfo.family_name || " ",
    };

    try {
      const foundUser = await getProfile(userInfo.email);
    } catch (error) {
      if (error.message === "User not found.") {
        const savedUser = await addUser(entity, false);
        console.log("User created:", savedUser);
      }
    }

    const result = await loginUserService(userInfo.email, null);

    res.json({
      message: "Đăng nhập thành công!",
      user: req.user,
    });
  }
);
module.exports = router;
