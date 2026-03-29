require("dotenv").config();
const axios = require("axios");

async function callGateway(payload) {
  try {
    const response = await axios.post(process.env.API_URL, payload, {
      timeout: 5000,
      headers: { "Content-Type": "application/json" }
    });

    return response.data;
  } catch (err) {
    return {
      status: "FAILED",
      errorCode: "NETWORK",
      retryable: true,
      message: err.response?.data?.message || err.message
    };
  }
}

module.exports = { callGateway };