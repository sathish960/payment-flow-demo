const db = require("../db/db");

async function seedData() {
  try {
    await db.query(`
      INSERT INTO invoice (customer_id, amount_due, bill_date, payment_type, is_active, is_fully_paid, status)
      VALUES
      (101, 120.00, CURRENT_DATE - INTERVAL '2 day', 'CARD', 'Y', 'N', 'PENDING'),
      (102, 220.00, CURRENT_DATE - INTERVAL '1 day', 'CARD', 'Y', 'N', 'PENDING'),
      (103, 330.00, CURRENT_DATE, 'CARD', 'Y', 'N', 'PENDING'),
      (104, 440.00, CURRENT_DATE, 'CARD', 'Y', 'N', 'PENDING'),
      (105, 550.00, CURRENT_DATE, 'CARD', 'Y', 'N', 'PENDING');
    `);

    await db.query(`
      INSERT INTO payment_charge_job (invoice_id, amount, job_status, retry_count, max_retry_count)
      SELECT invoice_id, amount_due, 'NEW', 0, 3
      FROM invoice
      WHERE payment_type = 'CARD';
    `);

    console.log("Seed data inserted.");
  } catch (err) {
    console.error("Seed error:", err.message);
  } finally {
    process.exit();
  }
}

seedData();