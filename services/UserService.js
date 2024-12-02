const User = require("../models/User");
const { addUser, loginUser } = require("../keycloak/keycloak");

// Hàm xử lý đăng ký người dùng
const registerUser = async (email, password) => {
  // Kiểm tra xem email đã tồn tại chưa
  console.log("Email: ", email);
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new Error("Email already exists");
  }

  // Tạo người dùng trên Keycloak
  const keyCloakUser = {
    username: email,
    email,
    firstName: "",
    lastName: "",
    password: password,
  };
  const savedKeyCloakUser = await addUser(keyCloakUser);

  // Lưu thông tin người dùng vào database
  const entity = {
    email,
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
    throw new Error("User not found");
  }

  return {
    id: user.id,
    username: user.email,
    email: user.email,
  };
};

module.exports = {
  registerUser,
  loginUserService,
  getProfile,
};
