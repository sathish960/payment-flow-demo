require("dotenv").config();
const axios = require("axios");
const db = require("./db");
//this is new change 
async function processPayments() {
  try {
    console.log("Starting payment processing...");

    const result = await db.query(`
      SELECT charge_job_id, invoice_id, amount, job_status, retry_count
      FROM payment_charge_job
      WHERE job_status = 'NEW'
      ORDER BY charge_job_id
    `);

    const jobs = result.rows;
    console.log("Jobs found:", jobs.length);

    for (const job of jobs) {
      console.log(`Processing charge_job_id=${job.charge_job_id}, invoice_id=${job.invoice_id}`);

      // Skip jobs with amount > 800
      if (job.amount > 800) {
        await db.query(
          `
          UPDATE payment_charge_job
          SET job_status = 'RETRY_PENDING',
              retry_count = retry_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,
          [job.charge_job_id]
        );

        console.log(`Skipped invoice_id=${job.invoice_id} because amount > 800`);
        continue;
      }

      const payload = {
        invoiceId: job.invoice_id,
        amount: job.amount
      };

      let apiResponse;
      try {
        const response = await axios.post(process.env.API_URL, payload);
        apiResponse = response.data;
        console.log("API response:", apiResponse);
      } catch (err) {
        console.error("API call error:", err.message);
        apiResponse = {
          status: "FAILED",
          message: "API call failed"
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

        console.log(`Payment success for invoice_id=${job.invoice_id}`);
      } else {
        await db.query(
          `
          UPDATE payment_charge_job
          SET job_status = 'RETRY_PENDING',
              retry_count = retry_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,
          [job.charge_job_id]
        );

        console.log(`Payment failed for invoice_id=${job.invoice_id}, moved to RETRY_PENDING`);
      }
    }

    console.log("Payment processing completed.");
  } catch (err) {
    console.error("Process error:", err);
  } finally {
    process.exit();
  }
}

processPayments();
