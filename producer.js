const db = require("./db");

async function publishPaymentEvents() {
  try {
    console.log("Publishing payment events...");

    const result = await db.query(`
      SELECT charge_job_id, invoice_id, amount
      FROM payment_charge_job
      WHERE job_status = 'NEW'
      ORDER BY charge_job_id
    `);

    const jobs = result.rows;
    console.log("Jobs found:", jobs.length);

    for (const job of jobs) {
      const payload = {
        chargeJobId: job.charge_job_id,
        invoiceId: job.invoice_id,
        amount: job.amount,
        paymentType: "CARD"
      };

      await db.query(`
        INSERT INTO event_queue (event_type, invoice_id, payload, status)
        VALUES ('PAYMENT_REQUESTED', $1, $2, 'NEW')
      `, [job.invoice_id, payload]);

      await db.query(`
        UPDATE payment_charge_job
        SET job_status = 'QUEUED',
            updated_at = CURRENT_TIMESTAMP
        WHERE charge_job_id = $1
      `, [job.charge_job_id]);

      console.log(`Published event for invoice ${job.invoice_id}`);
    }

    console.log("Publishing completed.");
  } catch (err) {
    console.error("Producer error:", err.message);
  } finally {
    process.exit();
  }
}

publishPaymentEvents();