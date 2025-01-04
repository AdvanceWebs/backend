const express = require("express");
const {
  handleAccessToken,
  checkAdmin,
} = require("../middlewares/authMiddleware");
const passport = require("../middlewares/passport");
const {
  registerUser,
  loginUserService,
  getProfile,
  getProfileV2,
  verifyActivation,
  sendLinkResetPassword,
  resetPasswordService,
  upgradeUserVip,
  updateProfile,
} = require("../services/UserService");
const {
  addUser,
  loginUser,
  updateUserIdInKeycloak,
  updateEmailVerified,
} = require("../keycloak/keycloak");
const validateUser = require("../validators/userValidator");
const router = express.Router();
const User = require("../models/User");
const AppSetting = require("../models/AppSetting");
const { handleGoogleCallback } = require("../services/AuthService");

// POST /user/register
router.post("/register", validateUser, async (req, res) => {
  const user = req.body;

  try {
    const savedUser = await registerUser(user);
    console.log("User created:", savedUser);
    res.status(201).json({ message: "Check email to activate your account" });
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
    if (error.message === "Account not verified.") {
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
    res.status(200).json({
      success: true,
      message: "Fetch user profile successfully",
      data: userProfile,
    });
  } catch (error) {
    console.error(error.message);
    if (error.message === "User not found") {
      return res.status(404).json({ message: error.message, success: false });
    }
    res.status(500).json({ message: "Server error", sucess: false });
  }
});

// Profile Route (Protected)
router.put("/profile", handleAccessToken, async (req, res) => {
  try {
    const newInfoUser = req.body;
    const userProfile = await updateProfile(req.user.email, newInfoUser);
    res.status(201).json({
      message: "Update user successfully",
      success: true,
      data: userProfile,
    });
  } catch (error) {
    console.error(error.message);
    if (error.message === "User not found") {
      return res.status(404).json({ message: error.message, success: false });
    }
    res.status(500).json({ message: "Server error", success: false });
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

        const keycloakUser = await addUser(entity, true, true);
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

        const updatedKeycloakUser = await updateUserIdInKeycloak(
          savedUser.id,
          keycloakUser,
          true
        );
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

        const keycloakUser = await addUser(entity, true, true);
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

        const updatedKeycloakUser = await updateUserIdInKeycloak(
          savedUser.id,
          keycloakUser,
          true
        );
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

// Forgot password route
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (user.ssoProvider !== null) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot reset password" });
    }

    await sendLinkResetPassword(email);
    res.json({ success: true, message: "Reset link sent to email" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Reset password route
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  try {
    const result = await resetPasswordService(token, password);
    if (result.success === false) {
      if (result.message === "Invalid token") {
        return res
          .status(401)
          .json({ success: false, message: result.message });
      }
      return res.status(400).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: "Password has been reset" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Kích hoạt tài khoản
router.get("/activate/:token", async (req, res) => {
  const { token } = req.params;
  try {
    await verifyActivation(token);
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Activation</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .container {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 100%;
          }
          h1 {
            color: #4CAF50;
            font-size: 24px;
            margin-bottom: 10px;
          }
          p {
            color: #555;
            font-size: 16px;
            margin-bottom: 20px;
          }
          a {
            text-decoration: none;
            color: white;
            background-color: #4CAF50;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
          }
          a:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Account Activated!</h1>
          <p>Your account has been successfully activated. You can now log in and start using our services.</p>
          <a href="${process.env.FRONTEND_SERVICE}/login">Go to Login</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Activation</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .container {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 100%;
          }
          h1 {
            color: #ff4d4d;
            font-size: 24px;
            margin-bottom: 10px;
          }
          p {
            color: #555;
            font-size: 16px;
            margin-bottom: 20px;
          }
          a {
            text-decoration: none;
            color: white;
            background-color: #007bff;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
          }
          a:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Activation Failed</h1>
          <p>${error.message}</p>
          <a href="/resend-activation">Resend Activation Link</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Tăng hạng thành viên cho user lên role user-vip
router.post("/upgrade-vip", checkAdmin, async (req, res) => {
  const { email } = req.body; // Use req.body instead of req.params for email
  try {
    const result = await upgradeUserVip(email);
    if (result.success === false) {
      return res.status(400).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: "User upgraded to VIP role" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Tạo link thanh toán momo
router.post("/create-payment", handleAccessToken, async (req, res) => {
  const momoConfig = require("../config/momo");
  const { partnerCode, accessKey, secretKey, requestType, endpoint } =
    momoConfig;
  console.log(req.user.email);
  const amount = "50000";
  const orderId = `MOMO${new Date().getTime()}`;
  const requestId = `${new Date().getTime()}`;
  const orderInfo = `Upgrade-account`;
  const redirectUrl = `${process.env.FRONTEND_SERVICE}/upgrade-account-result`;
  const ipnUrl = `${process.env.AUTH_SERVICE_DEPLOY}/user/momo-callback`;
  const extraData = Buffer.from(
    JSON.stringify({ email: req.user.email })
  ).toString("base64");
  const paymentCode =
    "T8Qii53fAXyUftPV3m9ysyRhEanUs9KlOPfHgpMR0ON50U10Bh+vZdpJU7VY4z+Z2y77fJHkoDc69scwwzLuW5MzeUKTwPo3ZMaB29imm6YulqnWfTkgzqRaion+EuD7FN9wZ4aXE1+mRt0gHsU193y+yxtRgpmY7SDMU9hCKoQtYyHsfFR5FUAOAKMdw2fzQqpToei3rnaYvZuYaxolprm9+/+WIETnPUDlxCYOiw7vPeaaYQQH0BF0TxyU3zu36ODx980rJvPAgtJzH1gUrlxcSS1HQeQ9ZaVM1eOK/jl8KJm6ijOwErHGbgf/hVymUQG65rHU2MWz9U8QUjvDWA==";
  const orderGroupId = "";
  const autoCapture = true;
  const lang = "en";

  // Tạo raw signature trước khi kí HMAC SHA 256
  var rawSignature =
    "accessKey=" +
    accessKey +
    "&amount=" +
    amount +
    "&extraData=" +
    extraData +
    "&ipnUrl=" +
    ipnUrl +
    "&orderId=" +
    orderId +
    "&orderInfo=" +
    orderInfo +
    "&partnerCode=" +
    partnerCode +
    "&redirectUrl=" +
    redirectUrl +
    "&requestId=" +
    requestId +
    "&requestType=" +
    requestType;

  // Ký HMAC
  const crypto = require("crypto");
  var signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  // Tạo request body gửi về cho Momo endpoint
  const requestBody = {
    partnerCode: partnerCode,
    partnerName: "Test",
    storeId: "MomoTestStore",
    requestId: requestId,
    amount: amount,
    orderId: orderId,
    orderInfo: orderInfo,
    redirectUrl: redirectUrl,
    ipnUrl: ipnUrl,
    lang: lang,
    requestType: requestType,
    autoCapture: autoCapture,
    extraData: extraData,
    orderGroupId: orderGroupId,
    signature: signature,
  };

  // Sử dụng axios
  const axios = require("axios");
  try {
    const result = await axios.post(endpoint, requestBody, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    return res.status(200).json(result.data);
  } catch (e) {
    console.log("Error:", e.response ? e.response.data : e.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.post("/momo-callback", async (req, res) => {
  console.log("MOMO Callback");
  console.log(req.body);
  const momoConfig = require("../config/momo");
  const { secretKey, accessKey } = momoConfig;
  let MOMO_Params = req.body;
  let callbackData = MOMO_Params;

  let secureHash = MOMO_Params["signature"];

  delete MOMO_Params["signature"];

  let querystring = require("qs");
  const signData = querystring.stringify(MOMO_Params, { encode: false });
  console.log("sign data: ", signData);

  // Tạo chuỗi `rawSignature` theo thứ tự quy định
  const rawSignature = `accessKey=${accessKey}&amount=${callbackData.amount}&extraData=${callbackData.extraData}&message=${callbackData.message}&orderId=${callbackData.orderId}&orderInfo=${callbackData.orderInfo}&orderType=${callbackData.orderType}&partnerCode=${callbackData.partnerCode}&payType=${callbackData.payType}&requestId=${callbackData.requestId}&responseTime=${callbackData.responseTime}&resultCode=${callbackData.resultCode}&transId=${callbackData.transId}`;

  console.log("raw signature: ", rawSignature);

  const crypto = require("crypto");
  var signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  console.log("secure hash: ", secureHash);
  console.log("signature: ", signature);
  if (secureHash === signature && resultCode === 0) {
    console.log("Thanh cong");
    // Xử lý logic của bạn ở đây

    // Giải mã extraData
    const extraData = req.body.extraData
      ? Buffer.from(req.body.extraData, "base64").toString("utf-8")
      : null;
    const parsedExtraData = extraData ? JSON.parse(extraData) : null;

    if (!parsedExtraData || !parsedExtraData.email) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid request body" });
    }
    try {
      const result = await upgradeUserVip(parsedExtraData.email);
      if (result.success === false) {
        return res
          .status(400)
          .json({ success: false, message: result.message });
      }
      res.json({ success: true, message: "User upgraded to VIP role" });
    } catch (e) {
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  } else {
    console.log("That bai");
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

module.exports = router;
