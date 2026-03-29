const { v4: uuidv4 } = require("uuid");
const kafka = require("../config/kafka");
const db = require("../db/db");

async function publishPaymentRequests() {
  const producer = kafka.producer();

  try {
    await producer.connect();

    const result = await db.query(`
      SELECT charge_job_id, invoice_id, amount, retry_count
      FROM payment_charge_job
      WHERE job_status = 'NEW'
      ORDER BY charge_job_id
      LIMIT 20
    `);

    for (const job of result.rows) {
      const event = {
        eventId: uuidv4(),
        eventType: "PAYMENT_REQUESTED",
        chargeJobId: job.charge_job_id,
        invoiceId: job.invoice_id,
        amount: Number(job.amount),
        paymentType: "CARD",
        retryCount: job.retry_count
      };

      await producer.send({
        topic: "payment-requested",
        messages: [
          {
            key: String(job.invoice_id),
            value: JSON.stringify(event)
          }
        ]
      });

      await db.query(`
        UPDATE payment_charge_job
        SET job_status = 'QUEUED',
            updated_at = CURRENT_TIMESTAMP
        WHERE charge_job_id = $1
      `, [job.charge_job_id]);

      console.log(`Published payment-requested for invoice ${job.invoice_id}`);
    }
  } catch (err) {
    console.error("Producer error:", err.message);
  } finally {
    await producer.disconnect();
    process.exit();
  }
}

publishPaymentRequests();