const KcAdminClient = require("keycloak-admin").default;
const axios = require("axios");
const https = require("https");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

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
async function addUser(user, check, emailVerified = false) {
  try {
    let credentials = null;
    if (check) {
      credentials = [
        {
          type: "password",
          value: user.password,
          temporary: false,
        },
      ];
    }

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
        emailVerified: emailVerified,
        credentials: credentials,
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

// Hàm cập nhật userId cho user
async function updateUserIdInKeycloak(
  userId,
  userKeycloak,
  emailVerified = false
) {
  // Kết nối đến Keycloak để lấy token
  const tokenData = await connectToKeycloak();
  console.log("Token data:", tokenData);
  // Lấy token từ phản hồi của Keycloak
  const token = tokenData.access_token;

  const response = await axios.put(
    `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${userKeycloak.id}`,
    {
      username: userKeycloak.username,
      email: userKeycloak.email,
      firstName: userKeycloak.firstName,
      lastName: userKeycloak.lastName,
      enabled: true,
      emailVerified: emailVerified,
      attributes: {
        userId: userId, // Thêm userId vào attributes
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      httpsAgent: agent, // Sử dụng agent đã cấu hình
    }
  );
  return response.data;
}

// Hàm cập nhật trường email_verified
async function updateEmailVerified(userId, isVerified) {
  try {
    // Kết nối đến Keycloak để lấy token
    const tokenData = await connectToKeycloak();
    console.log("Token data:", tokenData);
    // Lấy token từ phản hồi của Keycloak
    const token = tokenData.access_token;
    const response = await axios.put(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${userId}`,
      { emailVerified: isVerified }, // Cập nhật trường email_verified
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình
      }
    );

    console.log("User updated successfully:", response.status);
  } catch (error) {
    console.error(
      "Error updating user:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Hàm cập nhật thông tin của user
async function updateUserInfoInKeyCloak(userId, userKeycloak) {
  try {
    // Kết nối đến Keycloak để lấy token
    const tokenData = await connectToKeycloak();
    console.log("Token data:", tokenData);
    // Lấy token từ phản hồi của Keycloak
    const token = tokenData.access_token;
    const response = await axios.put(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${userId}`,
      {
        firstName: userKeycloak.firstName,
        lastName: userKeycloak.lastName,
      }, // Cập nhật trường email_verified
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình
      }
    );

    console.log("User updated successfully:", response.status);
    return getUser(userKeycloak.username);
  } catch (error) {
    console.error(
      "Error updating user:",
      error.response?.data || error.message
    );
    throw error;
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
async function loginUser(username, password, bypassSsoProvider) {
  if (!username || !password) {
    throw new Error("Username and password are required.");
  }

  const foundedUser = await User.findOne({
    where: { username: username },
  });
  if (bypassSsoProvider === false) {
    if (!foundedUser || foundedUser.ssoProvider !== null) {
      return {
        success: false,
        message: "Invalid username or password.",
      };
    }
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
    // Giải mã access_token
    const decoded = jwt.decode(access_token);

    // Lấy trường email_verified
    const emailVerified = decoded.email_verified;
    if (!emailVerified) {
      return {
        success: false,
        message: "Account not verified.",
      };
    }

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

async function updateUserPassword(user, newPassword) {
  try {
    // Kết nối đến Keycloak để lấy token
    const tokenData = await connectToKeycloak();
    console.log("Token data:", tokenData);
    const token = tokenData.access_token; // Lấy token từ phản hồi của Keycloak

    // Update user password in Keycloak
    const userId = user.keycloakUserId; // Assuming you store Keycloak user ID in your user model
    const response = await axios.put(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${userId}/reset-password`,
      {
        type: "password",
        value: newPassword,
        temporary: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình nếu cần
      }
    );

    console.log("Password updated successfully: ", response);
    return { success: true, message: "Password updated successfully" };
  } catch (error) {
    console.error("Error updating password in Keycloak:", error.message);
    return { success: false, message: "Internal error!" };
  }
}

async function addRoleToUser(user, roleName) {
  try {
    // Kết nối đến Keycloak để lấy token
    const tokenData = await connectToKeycloak();
    console.log("Token data:", tokenData);
    const token = tokenData.access_token; // Lấy token từ phản hồi của Keycloak

    // Find the role by name
    const roleResponse = await axios.get(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/roles/${roleName}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình nếu cần
      }
    );

    const role = roleResponse.data;
    if (!role) {
      throw new Error("Role not found");
    }

    // Assign the role to the user
    await axios.post(
      `${process.env.KEYCLOAK_BASE_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users/${user.keycloakUserId}/role-mappings/realm`,
      [role],
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent, // Sử dụng agent đã cấu hình nếu cần
      }
    );

    console.log("Role added successfully to user");
    return { success: true, message: "Role added successfully to user" };
  } catch (error) {
    console.error("Error adding role to user:", error.message);
    throw error;
  }
}

// Export cả hai hàm để sử dụng ở nơi khác
module.exports = {
  connectToKeycloak,
  addUser,
  loginUser,
  updateUserIdInKeycloak,
  updateEmailVerified,
  updateUserPassword,
  addRoleToUser,
  getUser,
  updateUserInfoInKeyCloak,
};
