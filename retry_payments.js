require("dotenv").config();
const axios = require("axios");
const db = require("./db");

async function retryPayments() {
  try {
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
        invoiceId: 1, 
        amount: job.amount
      };

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
          INSERT INTO payment_transaction (invoice_id, payment_type, amount, txn_status, txn_reference)
          VALUES ($1, 'CARD', $2, 'SUCCESS', $3)
          `,
          [job.invoice_id, job.amount, apiResponse.txnReference]
        );

        await db.query(
          `
          UPDATE payment_charge_job
          SET job_status = 'PROCESSED',
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,
          [job.charge_job_id]
        );

        await db.query(
          `
          UPDATE invoice
          SET is_fully_paid = 'Y',
              status = 'PAID'
          WHERE invoice_id = $1
          `,
          [job.invoice_id]
        );

        console.log(`Retry success for invoice_id=${job.invoice_id}`);
      } else {
        await db.query(
          `
          UPDATE payment_charge_job
          SET retry_count = retry_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,
          [job.charge_job_id]
        );

        console.log(`Retry failed again for invoice_id=${job.invoice_id}`);
      }
    }

    console.log("Retry processing completed.");
  } catch (err) {
    console.error("Retry process error:", err);
  } finally {
    process.exit();
  }
}

retryPayments();