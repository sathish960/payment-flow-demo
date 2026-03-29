const kafka = require("../config/kafka");
const db = require("../db/db");
const retryRules = require("../config/retryRules");
const { alreadySuccessful } = require("../services/idempotencyService");
const { insertAudit } = require("../services/auditService");
const { insertDlq } = require("../services/dlqService");

async function startResultConsumer() {
  const successConsumer = kafka.consumer({ groupId: "payment-success-updater" });
  const failConsumer = kafka.consumer({ groupId: "payment-failure-updater" });

  await successConsumer.connect();
  await failConsumer.connect();

  await successConsumer.subscribe({ topic: "payment-succeeded", fromBeginning: true });
  await failConsumer.subscribe({ topic: "payment-failed", fromBeginning: true });

  await successConsumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      const client = await db.pool.connect();

      try {
        await client.query("BEGIN");

        const exists = await alreadySuccessful(client, event.invoiceId);
        if (exists) {
          await insertAudit(client, {
            invoiceId: event.invoiceId,
            chargeJobId: event.chargeJobId,
            eventId: event.eventId,
            eventType: event.eventType,
            requestPayload: event,
            responsePayload: event.response,
            finalStatus: "SKIPPED_DUPLICATE_SUCCESS",
            errorMessage: "Invoice already paid"
          });

          await client.query("COMMIT");
          return;
        }

        await client.query(
          `INSERT INTO payment_transaction
           (invoice_id, payment_type, amount, txn_status, txn_reference, event_id)
           VALUES ($1,'CARD',$2,'SUCCESS',$3,$4)`,
          [
            event.invoiceId,
            event.amount,
            event.response.txnReference,
            event.eventId
          ]
        );

        await client.query(
          `UPDATE invoice
           SET is_fully_paid = 'Y',
               status = 'PAID'
           WHERE invoice_id = $1`,
          [event.invoiceId]
        );

        await client.query(
          `UPDATE payment_charge_job
           SET job_status = 'SUCCESS',
               processing_flag = FALSE,
               updated_at = CURRENT_TIMESTAMP
           WHERE charge_job_id = $1`,
          [event.chargeJobId]
        );

        await insertAudit(client, {
          invoiceId: event.invoiceId,
          chargeJobId: event.chargeJobId,
          eventId: event.eventId,
          eventType: event.eventType,
          requestPayload: event,
          responsePayload: event.response,
          finalStatus: "SUCCESS"
        });

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Success consumer DB error:", err.message);
      } finally {
        client.release();
      }
    }
  });

  await failConsumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      const client = await db.pool.connect();

      try {
        await client.query("BEGIN");

        const errorCode = event.response.errorCode || "UNKNOWN";
        const retryable = retryRules.retryableErrorCodes.includes(errorCode);
        const nextRetry = Number(event.retryCount || 0) + 1;

        if (retryable && nextRetry < 3) {
          await client.query(
            `UPDATE payment_charge_job
             SET job_status = 'RETRY_PENDING',
                 retry_count = $2,
                 next_retry_at = CURRENT_TIMESTAMP + INTERVAL '1 minute',
                 last_error_code = $3,
                 last_error_message = $4,
                 processing_flag = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE charge_job_id = $1`,
            [
              event.chargeJobId,
              nextRetry,
              errorCode,
              event.response.message
            ]
          );

          await insertAudit(client, {
            invoiceId: event.invoiceId,
            chargeJobId: event.chargeJobId,
            eventId: event.eventId,
            eventType: event.eventType,
            requestPayload: event,
            responsePayload: event.response,
            finalStatus: "RETRY_PENDING",
            errorCode,
            errorMessage: event.response.message
          });
        } else {
          await client.query(
            `UPDATE payment_charge_job
             SET job_status = 'PERMANENT_FAILED',
                 retry_count = $2,
                 last_error_code = $3,
                 last_error_message = $4,
                 processing_flag = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE charge_job_id = $1`,
            [
              event.chargeJobId,
              nextRetry,
              errorCode,
              event.response.message
            ]
          );

          await insertAudit(client, {
            invoiceId: event.invoiceId,
            chargeJobId: event.chargeJobId,
            eventId: event.eventId,
            eventType: event.eventType,
            requestPayload: event,
            responsePayload: event.response,
            finalStatus: "PERMANENT_FAILED",
            errorCode,
            errorMessage: event.response.message
          });

          await insertDlq(client, {
            eventId: event.eventId,
            topicName: "payment-failed",
            invoiceId: event.invoiceId,
            payload: event,
            failureReason: "Max retries reached or non-retryable error",
            errorCode,
            retryCount: nextRetry
          });
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Fail consumer DB error:", err.message);
      } finally {
        client.release();
      }
    }
  });
}

startResultConsumer().catch(err => {
  console.error("Result consumer startup error:", err.message);
});