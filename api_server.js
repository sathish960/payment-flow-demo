const express = require("express");

const app = express();
app.use(express.json());

app.post("/pay", (req, res) => {
  try {
    const { invoiceId, amount } = req.body;

    if (!invoiceId || !amount) {
      return res.status(400).json({
        status: "FAILED",
        errorCode: "BAD_REQUEST",
        retryable: false,
        message: "Missing invoiceId or amount"
      });
    }

    const invoiceNum = Number(invoiceId);

    if (isNaN(invoiceNum)) {
      return res.status(400).json({
        status: "FAILED",
        errorCode: "BAD_REQUEST",
        retryable: false,
        message: "Invalid invoiceId"
      });
    }

    if (invoiceNum % 5 === 0) {
      return res.status(200).json({
        status: "FAILED",
        errorCode: "TEMP_GATEWAY",
        retryable: true,
        message: "Temporary gateway issue"
      });
    }

    if (invoiceNum % 7 === 0) {
      return res.status(200).json({
        status: "FAILED",
        errorCode: "INVALID_CARD",
        retryable: false,
        message: "Card declined permanently"
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      txnReference: `TXN-${invoiceNum}-${Date.now()}`
    });
  } catch (err) {
    return res.status(500).json({
      status: "FAILED",
      errorCode: "INTERNAL_ERROR",
      retryable: false,
      message: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Fake payment API running on http://localhost:${PORT}`);
});