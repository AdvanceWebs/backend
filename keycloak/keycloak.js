const KcAdminClient = require("keycloak-admin").default;
const axios = require("axios");
const https = require("https");

require("dotenv").config(); // Đọc biến môi trường từ tệp .env

// Tạo một https.Agent để bỏ qua chứng chỉ SSL tự ký
const agent = new https.Agent({
  rejectUnauthorized: false, // Bỏ qua lỗi chứng chỉ không hợp lệ
});

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

  // In ra tất cả biến môi trường
  console.log("Keycloak environment variables:", {
    baseUrl,
    realmName,
    clientId,
    clientSecret,
    adminUsername,
    adminPassword,
  });

  try {
    // Gửi yêu cầu xác thực với Keycloak để lấy token
    const response = await axios.post(
      `${baseUrl}/realms/${realmName}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        username: adminUsername,
        password: adminPassword,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình để bỏ qua SSL certificate
      }
    );

    console.log("Connected to Keycloak successfully.");
    return response.data; // Trả về dữ liệu token nhận được từ Keycloak
  } catch (err) {
    console.error("Failed to connect to Keycloak:", err);
    throw err;
  }
}

// Hàm thêm user vào Keycloak
async function addUser(user) {
  if (!user || !user.username || !user.email || !user.password) {
    throw new Error("Missing required user information.");
  }

  try {
    // Kết nối đến Keycloak để lấy token
    const tokenData = await connectToKeycloak();
    console.log("Token data:", tokenData);
    // Lấy token từ phản hồi của Keycloak
    const token = tokenData.access_token;

    // Gửi yêu cầu thêm user mới vào Keycloak
    const response = await axios.post(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`,
      {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [
          {
            type: "password",
            value: user.password,
            temporary: false,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình
      }
    );

    if (response.status !== 201) {
      throw new Error("Failed to create user.");
    }
    console.log(user);
    const foundedUser = await getUser(user.username);

    console.log("User created:", foundedUser);
    return foundedUser; // Trả về thông tin user đã được tạo
  } catch (err) {
    console.error("Error creating user:", err.message);
    throw err;
  }
}

async function getUser(username) {
  if (!username) {
    throw new Error("Missing required username.");
  }

  try {
    // Kết nối đến Keycloak để lấy token
    const tokenData = await connectToKeycloak();
    console.log("Token data:", tokenData);
    const token = tokenData.access_token; // Lấy token từ phản hồi của Keycloak

    // Gửi yêu cầu đến Keycloak để lấy thông tin người dùng dựa trên username
    const response = await axios.get(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`,
      {
        params: {
          username: username, // Dùng query param để tìm người dùng theo username
        },
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình nếu cần
      }
    );

    if (response.data.length === 0) {
      console.log("User not found");
      return null; // Nếu không tìm thấy người dùng, trả về null
    }

    console.log("User found:", response.data[0]);
    return response.data[0]; // Trả về thông tin người dùng đầu tiên tìm thấy
  } catch (err) {
    console.error("Error fetching user:", err.message);
    throw err; // Ném lỗi nếu có lỗi xảy ra
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
        httpsAgent: agent, // Sử dụng httpsAgent để bỏ qua SSL certificate
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
