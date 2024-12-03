const express = require("express");
const handleAccessToken = require("../middlewares/authMiddleware");
const passport = require("../middlewares/passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const {
  registerUser,
  loginUserService,
  getProfile,
  getProfileV2,
} = require("../services/UserService");
const validateUser = require("../validators/userValidator");
const router = express.Router();
const { addUser } = require("../keycloak/keycloak");
const User = require("../models/User");
const AppSetting = require("../models/AppSetting");
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

    const token = await loginUserService(email, password, false);
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

// Route bắt đầu xác thực với Google
router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"], // Các quyền bạn muốn yêu cầu từ Google
  })
);

router.get(
  "/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    // Đăng nhập thành công
    console.log(req.user);
    let foundedUser = null;
    let flag = 0;
    // Lấy thông tin password mặc định
    const appSetting = await AppSetting.findOne({
      where: { settingKey: "PASSWORD_DEFAULT" },
    });
    try {
      const userInfo = req.user;
      let entity = {
        username: userInfo.emails[0].value,
        email: userInfo.emails[0].value,
        firstName: userInfo.name.givenName || " ",
        lastName: userInfo.name.familyName || " ",
      };

      const result = await getProfileV2(entity.email);
      if (result.status === true) {
        foundedUser = result.data;
      } else {
        entity.password = appSetting.settingValue;

        const keycloakUser = await addUser(entity, true);
        flag = 1;
        console.log("User created:", keycloakUser);

        // Lưu thông tin người dùng vào database
        const entityUser = {
          username: keycloakUser.username,
          email: entity.email,
          keycloakUserId: keycloakUser.id,
          ssoProvider: "GOOGLE",
        };
        const savedUser = await User.create(entityUser);
        flag = 2;
        foundedUser = savedUser;
      }
    } catch (error) {
      if (flag === 1) {
        // Xóa user trên keycloak
      }
      console.log("Lỗi trong quá trình xác thực Tokena :", error);
      res.json({
        message: "Lỗi hệ thống!",
      });
    }

    // Login để lấy token
    try {
      const token = await loginUserService(
        foundedUser.username,
        appSetting.settingValue,
        true
      );
      res.json({ data: token });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);
module.exports = router;
