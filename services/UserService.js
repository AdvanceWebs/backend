const User = require("../models/User");
const {
  addUser,
  loginUser,
  updateUserIdInKeycloak,
  updateEmailVerified,
  updateUserPassword,
} = require("../keycloak/keycloak");
const { Sequelize, Op } = require("sequelize");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Hàm xử lý đăng ký người dùng
const registerUser = async (user) => {
  // Kiểm tra xem email đã tồn tại chưa
  console.log("Email: ", user.email);

  if (
    !user ||
    !user.username ||
    !user.email ||
    !user.password ||
    !user.firstName ||
    !user.lastName
  ) {
    throw new Error("Missing required user information.");
  }
  const existingUser = await User.findOne({
    where: {
      [Sequelize.Op.or]: [{ email: user.email }, { username: user.username }],
    },
  });

  if (existingUser) {
    if (existingUser.email === user.email) {
      throw new Error("Email already exists.");
    }
    if (existingUser.username === user.username) {
      throw new Error("Username already exists.");
    }
  }

  // Tạo người dùng trên Keycloak
  const keyCloakUser = {
    username: user.username,
    email: user.email,
    firstName: user.firstName || " ",
    lastName: user.lastName || " ",
    password: user.password,
  };
  const savedKeyCloakUser = await addUser(keyCloakUser, true);

  // Lưu thông tin người dùng vào database
  const entity = {
    username: savedKeyCloakUser.username,
    email: user.email,
    keycloakUserId: savedKeyCloakUser.id,
  };
  const savedUser = await User.create(entity);
  try {
    const updatedKeycloakUser = await updateUserIdInKeycloak(
      savedUser.id,
      savedKeyCloakUser
    );

    // Tạo token kích hoạt
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    sendActivationEmail(user.email, token);
  } catch (err) {
    console.error("Error updating user:", err.message);
    throw err;
  }
  return savedUser;
};

// Hàm xử lý đăng nhập người dùng
const loginUserService = async (email, password, bypassSsoProvider) => {
  // Gọi hàm login từ Keycloak
  const result = await loginUser(email, password, bypassSsoProvider);
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.token;
};

// Hàm lấy thông tin người dùng (profile)
const getProfile = async (userEmail) => {
  const user = await User.findOne({
    where: { email: userEmail },
    attributes: ["id", "email"],
  });
  if (!user) {
    throw new Error("User not found.");
  }

  return {
    id: user.id,
    username: user.email,
    email: user.email,
  };
};

// Hàm lấy thông tin người dùng (profile)
const getProfileV2 = async (userEmail) => {
  const user = await User.findOne({
    where: {
      [Op.or]: [{ email: userEmail }, { username: userEmail }],
    },
    attributes: ["id", "email", "username"], // Include username in the attributes
  });
  if (!user) {
    return {
      status: false,
      data: null,
      message: "User not found.",
    };
  }

  return {
    status: true,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  };
};

// Gửi email kích hoạt
const sendActivationEmail = async (email, token) => {
  console.log("admin email: ", process.env.EMAIL_USER);
  console.log("admin password: ", process.env.EMAIL_PASS);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const activationLink = `${process.env.AUTH_SERVICE}/user/activate/${token}`;
  console.log("Email: ", email);
  transporter.sendMail(
    {
      from: `"To Do App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to To Do App - Activate Your Account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 8px;">
          <div style="text-align: center; padding: 10px 0;">
            <h2 style="color: #4CAF50; margin: 0;">Welcome to To Do App!</h2>
            <p style="color: #666; font-size: 14px;">Your gateway to amazing experiences.</p>
          </div>
          <div style="padding: 20px; background-color: #ffffff; border-radius: 8px;">
            <p style="font-size: 16px; color: #333; line-height: 1.5;">
              Hi there,
            </p>
            <p style="font-size: 16px; color: #333; line-height: 1.5;">
              Thank you for signing up for <strong>To Do App</strong>. We're excited to have you on board! Please click the button below to activate your account.
            </p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${activationLink}" style="display: inline-block; padding: 12px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">
                Activate My Account
              </a>
            </div>
            <p style="font-size: 14px; color: #666; line-height: 1.5;">
              If the button above doesn't work, please copy and paste the following link into your web browser:
            </p>
            <p style="font-size: 14px; color: #666; word-break: break-all;">
              <a href="${activationLink}" style="color: #4CAF50;">${activationLink}</a>
            </p>
          </div>
          <div style="text-align: center; padding: 10px 0; border-top: 1px solid #ddd; margin-top: 20px;">
            <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} Your App. All rights reserved.</p>
          </div>
        </div>
      `,
    },
    function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    }
  );
};

const verifyActivation = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new Error("User not found.");
    }
    await updateEmailVerified(user.keycloakUserId, true);
  } catch (err) {
    console.error("Error verifying activation:", err.message);
    throw err;
  }
};

const sendLinkResetPassword = async (email, req) => {
  try {
    const token = jwt.sign({ email: email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "Password Reset",
      html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
        <p>Please click on the following link, or paste this into your browser to complete the process:</p>
        <p>
          <a href="http://${
            process.env.FRONTEND_SERVICE
          }/reset-password/${token}" style="color: #1a73e8;">
            Reset Password
          </a>
        </p>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
        <div style="text-align: center; padding: 10px 0; border-top: 1px solid #ddd; margin-top: 20px;">
          <p style="font-size: 12px; color: #aaa;">&copy; ${new Date().getFullYear()} Your App. All rights reserved.</p>
        </div>
      </div>
    `,
    };

    transporter.sendMail(mailOptions);
    console.log("Reset link sent to email");
  } catch (error) {
    console.error("Error sending reset link:", error.message);
    throw error;
  }
};

const resetPasswordService = async (token, password) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return { success: false, message: "Invalid token or user not found" };
    }
    const result = await updateUserPassword(user, password);
    return result;
  } catch (error) {
    console.error("Error ", error.message);
    throw error;
  }
};

module.exports = {
  registerUser,
  loginUserService,
  getProfile,
  getProfileV2,
  verifyActivation,
  sendLinkResetPassword,
  resetPasswordService,
};
