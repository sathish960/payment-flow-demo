module.exports = {
  retryableErrorCodes: ["TEMP_GATEWAY", "TIMEOUT", "NETWORK", "HTTP_503"],
  permanentErrorCodes: ["INVALID_CARD", "BAD_REQUEST", "ACCOUNT_CLOSED"]
};