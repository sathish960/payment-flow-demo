const express = require("express");

const app = express();
app.use(express.json());

app.post("/pay", (req, res) => {
  const { invoiceId, amount } = req.body;

  console.log("Received payment request:", req.body);

  if (!invoiceId || !amount) {
    return res.status(400).json({
      status: "FAILED",
      message: "Missing invoiceId or amount"
    });
  }

  // Example logic:
  // odd invoiceId => success
  // even invoiceId => fail
  if (invoiceId % 2 === 1) {
    return res.json({
      status: "SUCCESS",
      txnReference: `TXN-${invoiceId}-${Date.now()}`
    });
  }

  return res.json({
    status: "FAILED",
    message: "Temporary gateway issue"
  });
});

app.listen(3000, () => {
  console.log("Fake payment API running on http://localhost:3000");
});