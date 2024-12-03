const User = require("../models/User");
const { addUser, loginUser } = require("../keycloak/keycloak");
const { Sequelize, Op } = require("sequelize");

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

  return savedUser;
};

// Hàm xử lý đăng nhập người dùng
const loginUserService = async (email, password) => {
  // Gọi hàm login từ Keycloak
  const result = await loginUser(email, password);
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
    where: { email: userEmail },
    attributes: ["id", "email"],
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
      username: user.email,
      email: user.email,
    },
  };
};

module.exports = {
  registerUser,
  loginUserService,
  getProfile,
  getProfileV2,
};
