const express = require("express");

const app = express();
app.use(express.json());

app.post("/pay", (req, res) => {
  try {
    const { invoiceId, amount } = req.body;

    console.log("Received payment request:", req.body);

    // Validation
    if (!invoiceId || !amount) {
      return res.status(400).json({
        status: "FAILED",
        message: "Missing invoiceId or amount"
      });
    }

    // Convert to number (important)
    const invoiceNum = Number(invoiceId);

    if (isNaN(invoiceNum)) {
      return res.status(400).json({
        status: "FAILED",
        message: "Invalid invoiceId"
      });
    }

    // Business logic
    if (invoiceNum % 2 === 1) {
      return res.status(200).json({
        status: "SUCCESS",
        txnReference: `TXN-${invoiceNum}-${Date.now()}`
      });
    }

    // Temporary failure (retryable)
    return res.status(200).json({
      status: "FAILED",
      errorCode: "TEMP_GATEWAY",
      retryable: true,
      message: "Temporary gateway issue"
    });

  } catch (err) {
    console.error("API Error:", err.message);

    return res.status(500).json({
      status: "FAILED",
      errorCode: "INTERNAL_ERROR",
      retryable: false,
      message: "Something went wrong"
    });
  }
});

// Port config
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Fake payment API running on http://localhost:${PORT}`);
});