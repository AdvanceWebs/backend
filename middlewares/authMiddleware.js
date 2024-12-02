const jwt = require("jsonwebtoken");
const axios = require("axios");

const handleAccessToken = async (req, res, next) => {
  try {
    // Lấy Access Token từ header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Access token is missing or invalid." });
    }

    // Extract token từ header
    const token = authHeader.split(" ")[1];

    // Giải mã phần header của JWT để lấy `kid`
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header.kid) {
      return res.status(401).json({ message: "Invalid token header." });
    }

    const kid = decodedHeader.header.kid;

    // Lấy public key tương ứng với `kid`
    const publicKey = await getKeycloakPublicKeyByKid(kid);

    // Xác minh Access Token bằng public key
    const decodedToken = jwt.verify(token, publicKey, {
      algorithms: ["RS256"], // Keycloak sử dụng RS256
    });

    // Lưu thông tin người dùng vào req.user
    req.user = {
      username: decodedToken.preferred_username,
      email: decodedToken.email,
    };

    console.log("Access token is valid:", req.user);
    next(); // Chuyển sang middleware hoặc route handler tiếp theo
  } catch (err) {
    console.error("Error handling access token:", err.message);
    return res
      .status(401)
      .json({ message: "Invalid or expired access token." });
  }
};

// Hàm lấy đúng public key từ Keycloak dựa trên `kid`
const getKeycloakPublicKeyByKid = async (kid) => {
  try {
    // Lấy thông tin từ file .env
    const keycloakUrl = process.env.KEYCLOAK_BASE_URL;
    const realmName = process.env.KEYCLOAK_REALM;

    // Gửi yêu cầu đến Keycloak endpoint để lấy danh sách các public key
    const response = await axios.get(
      `${keycloakUrl}/realms/${realmName}/protocol/openid-connect/certs`
    );

    // Tìm khóa khớp với `kid`
    const key = response.data.keys.find((k) => k.kid === kid);
    if (!key) {
      throw new Error(`No matching public key found for kid: ${kid}`);
    }

    // Định dạng public key với header và footer
    const publicKey = key.x5c[0];
    return `-----BEGIN CERTIFICATE-----\n${publicKey}\n-----END CERTIFICATE-----`;
  } catch (err) {
    console.error("Error fetching Keycloak public key:", err.message);
    throw new Error("Failed to fetch Keycloak public key.");
  }
};
module.exports = handleAccessToken;
