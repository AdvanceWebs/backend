const KcAdminClient = require("keycloak-admin").default;
const axios = require("axios");

require("dotenv").config(); // Đọc biến môi trường từ tệp .env

// Hàm kết nối đến Keycloak
async function connectToKeycloak() {
  // Lấy thông tin từ biến môi trường
  const baseUrl = process.env.KEYCLOAK_BASE_URL;
  const realmName = process.env.KEYCLOAK_REALM;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

  // Kiểm tra biến môi trường
  if (
    !baseUrl ||
    !realmName ||
    !clientId ||
    !clientSecret ||
    !adminUsername ||
    !adminPassword
  ) {
    throw new Error(
      "Missing required environment variables for Keycloak connection."
    );
  }

  //In ra tất cả biến môi trường
  console.log("Keycloak environment variables:", {
    baseUrl,
    realmName,
    clientId,
    clientSecret,
    adminUsername,
    adminPassword,
  });

  // Tạo Keycloak Admin Client
  const kcAdminClient = new KcAdminClient();

  try {
    // Cấu hình realm
    kcAdminClient.setConfig({
      baseUrl,
      realmName: realmName,
    });
    // Xác thực với Keycloak
    await kcAdminClient.auth({
      username: adminUsername,
      password: adminPassword,
      grantType: "password",
      clientId,
      clientSecret,
      baseUrl,
    });

    console.log("Connected to Keycloak successfully.");
    return kcAdminClient; // Trả về client đã được kết nối
  } catch (err) {
    console.error("Failed to connect to Keycloak:", err);
    throw err;
  }
}

// Hàm thêm user, sử dụng client từ connectToKeycloak
async function addUser(user) {
  if (!user || !user.username || !user.email || !user.password) {
    throw new Error("Missing required user information.");
  }

  try {
    // Kết nối đến Keycloak
    const kcAdminClient = await connectToKeycloak();

    // Kiểm tra xem user đã tồn tại hay chưa (dựa trên username)
    const existingUsers = await kcAdminClient.users.find({
      username: user.username,
    });

    if (existingUsers.length > 0) {
      throw new Error(`User with username "${user.username}" already exists.`);
    }

    // Kiểm tra xem email đã tồn tại hay chưa (dựa trên email)
    const existingEmails = await kcAdminClient.users.find({
      email: user.email,
    });

    if (existingEmails.length > 0) {
      throw new Error(`User with email "${user.email}" already exists.`);
    }

    // Tạo user mới
    const newUser = await kcAdminClient.users.create({
      username: user.username,
      email: user.email,
      firstName: ".",
      lastName: ".",
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: "password",
          value: user.password,
          temporary: false,
        },
      ],
    });

    console.log("User created:", newUser);
    return newUser; // Trả về user đã được tạo
  } catch (err) {
    console.error("Error creating user:", err.message);
    throw err;
  }
}

// Hàm login user sử dụng axios
async function loginUser(username, password) {
  if (!username || !password) {
    throw new Error("Username and password are required.");
  }

  try {
    // Lấy thông tin cấu hình từ biến môi trường
    const baseUrl = process.env.KEYCLOAK_BASE_URL;
    const realmName = process.env.KEYCLOAK_REALM;
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

    // Gửi yêu cầu đến endpoint /protocol/openid-connect/token để login
    const response = await axios.post(
      `${baseUrl}/realms/${realmName}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        username: username,
        password: password,

        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Trích xuất token từ phản hồi
    const { access_token, refresh_token, expires_in } = response.data;

    console.log("User logged in successfully.", response);
    return {
      success: true,
      message: "Login successful.",
      token: response.data,
    };
  } catch (err) {
    // Nếu lỗi xảy ra, log chi tiết lỗi từ phản hồi của Keycloak
    console.error("Error logging in user:", err.response?.data || err.message);
    return {
      success: false,
      message: "Invalid username or password.",
    };
  }
}

// Export cả hai hàm để sử dụng ở nơi khác
module.exports = {
  connectToKeycloak,
  addUser,
  loginUser,
};
