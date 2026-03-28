require("dotenv").config();
const axios = require("axios");
const db = require("./db");

async function retryPayments() {
  try {
    console.log("ENV PASSWORD:", process.env.DB_PASSWORD);
    console.log("API URL:", process.env.API_URL);
    console.log("Starting retry processing...");

    const result = await db.query(`
      SELECT charge_job_id, invoice_id, amount, retry_count
      FROM payment_charge_job
      WHERE job_status = 'RETRY_PENDING'
      ORDER BY charge_job_id
    `);

    const jobs = result.rows;

    console.log("Retry jobs found:", jobs.length);

    for (const job of jobs) {
      console.log(`Retrying charge_job_id=${job.charge_job_id}, invoice_id=${job.invoice_id}`);

      const payload = {
        invoiceId: job.invoice_id,
        amount: job.amount
      };

      console.log("Payload being sent:", payload);

      let apiResponse;

      try {
        const response = await axios.post(process.env.API_URL, payload);
        apiResponse = response.data;
        console.log("Retry API response:", apiResponse);
      } catch (err) {
        console.error("Retry API error:", err.message);
        apiResponse = {
          status: "FAILED",
          message: "Retry API call failed"
        };
      }

      if (apiResponse.status === "SUCCESS") {
        await db.query(
          `
          UPDATE payment_charge_job
          SET job_status = 'SUCCESS',
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,
          [job.charge_job_id]
        );

        await db.query(
          `
          INSERT INTO payment_transaction (invoice_id,payment_type ,amount, txn_status, txn_reference)
          VALUES ($1,'card', $2, $3, $4)
          `,
          [job.invoice_id, job.amount, "SUCCESS", apiResponse.txnReference]
        );

        console.log(`Retry success for invoice_id=${job.invoice_id}`);
      } else {
        const newRetryCount = job.retry_count + 1;
        const newStatus = newRetryCount >= 3 ? "PERMANENT_FAILED" : "RETRY_PENDING";

        await db.query(
          `
          UPDATE payment_charge_job
          SET job_status = $1,
              retry_count = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $3
          `,
          [newStatus, newRetryCount, job.charge_job_id]
        );

        console.log(
          `Retry failed for invoice_id=${job.invoice_id}, retry_count=${newRetryCount}, status=${newStatus}`
        );
      }
    }

    console.log("Retry processing completed.");
  } catch (error) {
    console.error("Error in retryPayments():", error.message);
  }
}

retryPayments();