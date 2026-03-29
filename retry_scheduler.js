const db = require("./db");

async function retryScheduler() {
  try {
    console.log("Running retry scheduler...");

    const result = await db.query(`
      SELECT event_id, invoice_id, payload, retry_count
      FROM event_queue
      WHERE status = 'FAILED'
        AND next_retry_at <= CURRENT_TIMESTAMP
        AND retry_count < 3
      ORDER BY event_id
    `);

    const events = result.rows;
    console.log("Retryable events found:", events.length);

    for (const event of events) {
      await db.query(`
        UPDATE event_queue
        SET status = 'NEW'
        WHERE event_id = $1
      `, [event.event_id]);

      console.log(`Republished event_id=${event.event_id} for invoice_id=${event.invoice_id}`);
    }

    await db.query(`
      UPDATE payment_charge_job
      SET job_status = 'PERMANENT_FAILED',
          updated_at = CURRENT_TIMESTAMP
      WHERE job_status = 'RETRY_PENDING'
        AND retry_count >= 3
    `);

    console.log("Retry scheduler completed.");
  } catch (err) {
    console.error("Retry scheduler error:", err.message);
  } finally {
    process.exit();
  }
}

retryScheduler();