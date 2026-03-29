require("dotenv").config();
const axios = require("axios");
const db = require("./db");

async function consumePaymentEvents() {
  try {
    console.log("Consuming payment events...");

    const result = await db.query(`
      SELECT event_id, invoice_id, payload
      FROM event_queue
      WHERE status = 'NEW'
        AND event_type = 'PAYMENT_REQUESTED'
      ORDER BY event_id
      LIMIT 5
    `);

    const events = result.rows;
    console.log("Events found:", events.length);

    for (const event of events) {
      const payload = event.payload;

      console.log(`Processing event_id=${event.event_id}, invoice_id=${payload.invoiceId}`);

      let apiResponse;

      try {
        const response = await axios.post(process.env.API_URL, {
          invoiceId: payload.invoiceId,
          amount: payload.amount
        });
        apiResponse = response.data;
      } catch (err) {
        apiResponse = {
          status: "FAILED",
          message: err.response?.data?.message || err.message
        };
      }

      await db.query(`
        INSERT INTO payment_audit_log
        (invoice_id, event_id, request_payload, response_payload, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        payload.invoiceId,
        event.event_id,
        payload,
        apiResponse,
        apiResponse.status,
        apiResponse.message || null
      ]);

      if (apiResponse.status === "SUCCESS") {
        await db.query(`
          INSERT INTO payment_transaction
          (invoice_id, payment_type, amount, txn_status, txn_reference)
          VALUES ($1, 'CARD', $2, 'SUCCESS', $3)
        `, [payload.invoiceId, payload.amount, apiResponse.txnReference]);

        await db.query(`
          UPDATE invoice
          SET is_fully_paid = 'Y',
              status = 'PAID'
          WHERE invoice_id = $1
        `, [payload.invoiceId]);

        await db.query(`
          UPDATE payment_charge_job
          SET job_status = 'SUCCESS',
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
        `, [payload.chargeJobId]);

        await db.query(`
          UPDATE event_queue
          SET status = 'PROCESSED',
              processed_at = CURRENT_TIMESTAMP
          WHERE event_id = $1
        `, [event.event_id]);

        console.log(`Success for invoice ${payload.invoiceId}`);
      } else {
        const nextRetry = 1;

        await db.query(`
          UPDATE payment_charge_job
          SET job_status = 'RETRY_PENDING',
              retry_count = retry_count + 1,
              next_retry_at = CURRENT_TIMESTAMP + INTERVAL '1 minute',
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
        `, [payload.chargeJobId]);

        await db.query(`
          UPDATE event_queue
          SET status = 'FAILED',
              retry_count = retry_count + 1,
              next_retry_at = CURRENT_TIMESTAMP + INTERVAL '1 minute'
          WHERE event_id = $1
        `, [event.event_id]);

        console.log(`Failed for invoice ${payload.invoiceId}, moved to RETRY_PENDING`);
      }
    }

    console.log("Consumer completed.");
  } catch (err) {
    console.error("Consumer error:", err.message);
  } finally {
    process.exit();
  }
}

consumePaymentEvents();