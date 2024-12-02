const axios = require("axios");
require("dotenv").config(); // Đọc biến môi trường từ tệp .env

const { registerUser, loginUserService, getProfile } = require("./UserService");
const { addUser } = require("../keycloak/keycloak");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const handleGoogleCallback = async (req, res) => {
  try {
    // 1. Lấy Authorization Code từ query parameters
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Authorization code not found" });
    }
    console.log(
      "in env: ",
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    try {
      console.log("Lỗi trong quá trình xác thực Tokena :", code);
      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code: code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        })
      );
    } catch (error) {
      console.error("Lỗi trong quá trình xác thực Tokena :");
    }

    const { access_token, id_token } = tokenResponse.data;

    // 3. Lấy thông tin người dùng từ Google
    const userInfoResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );



    // 4. Xử lý hoặc lưu thông tin người dùng
    console.log("Thông tin người dùng:", userInfo);

    // 5. Trả về frontend hoặc chuyển hướng tiếp
    res.json({
      message: "Đăng nhập thành công!",
      user: userInfo,
      id_token: id_token,
    });
  } catch (error) {
    console.error("Lỗi trong quá trình xác thực:", error);
    res
      .status(500)
      .json({ error: "Đã xảy ra lỗi trong quá trình xử lý callback" });
  }
};

module.exports = { handleGoogleCallback };
