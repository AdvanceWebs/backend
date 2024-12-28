const express = require("express");
const handleAccessToken = require("../middlewares/authMiddleware");
const passport = require("../middlewares/passport");
const {
  registerUser,
  loginUserService,
  getProfile,
  getProfileV2,
  verifyActivation,
} = require("../services/UserService");
const validateUser = require("../validators/userValidator");
const router = express.Router();
const { addUser } = require("../keycloak/keycloak");
const User = require("../models/User");
const AppSetting = require("../models/AppSetting");
const { handleGoogleCallback } = require("../services/AuthService");

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
        firstName: userInfo.name.givenName || ". ",
        lastName: userInfo.name.familyName || ". ",
      };

      const result = await getProfileV2(entity.email);
      if (result.status === true) {
        foundedUser = result.data;
        if (foundedUser.ssoProvider === null) {
          res.json({
            success: false,
            message: "Email đã được một tài khoản khác đăng ký",
          });
        }
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
        success: false,
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
      res.json({ success: true, data: token });
    } catch (error) {
      res.json({ success: false, message: "Server error" });
    }
  }
);

// Route to initiate GitHub OAuth authentication
router.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

// GitHub OAuth callback route
router.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  async (req, res) => {
    let foundedUser = null;
    let flag = 0;
    // Lấy thông tin password mặc định
    const appSetting = await AppSetting.findOne({
      where: { settingKey: "PASSWORD_DEFAULT" },
    });
    try {
      const userInfo = req.user;
      let entity = {
        username: userInfo.username || userInfo.email,
        email: userInfo.email || `${userInfo.username}@github.com`,
        firstName: userInfo.firstName || ". ",
        lastName: userInfo.displayName || ". ",
      };

      let resultUsername = await getProfileV2(entity.username);
      let resultEmail = await getProfileV2(entity.email);

      let result = { status: false, data: null };

      if (resultUsername.status === true) {
        if (resultUsername.data.ssoProvider !== null) {
          result = resultUsername;
        } else {
          res.json({
            success: false,
            message: "Username đã được một tài khoản khác đăng ký",
          });
        }
      } else {
        if (resultEmail.status === true) {
          if (resultEmail.data.ssoProvider !== null) {
            result = resultEmail;
          } else {
            res.json({
              success: false,
              message: "Email đã được một tài khoản khác đăng ký",
            });
          }
        }
      }

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
          ssoProvider: "GITHUB",
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
        success: false,
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
      res.json({ success: true, data: token });
    } catch (error) {
      res.json({ success: false, message: "Lỗi hệ thống!" });
    }
  }
);

// Kích hoạt tài khoản
router.get("/activate/:token", async (req, res) => {
  const { token } = req.params;

  try {
    await verifyActivation(token);
    res.status(200).json({ message: "Account activated successfully!" });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Invalid or expired token", error: error.message });
  }
});

module.exports = router;
