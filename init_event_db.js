const db = require("./db");

async function initEventDb() {
  try {
    await db.query(`
      DROP TABLE IF EXISTS payment_audit_log;
      DROP TABLE IF EXISTS event_queue;
      DROP TABLE IF EXISTS payment_transaction;
      DROP TABLE IF EXISTS payment_charge_job;
      DROP TABLE IF EXISTS invoice;
    `);

    await db.query(`
      CREATE TABLE invoice (
        invoice_id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL,
        amount_due NUMERIC(10,2) NOT NULL,
        bill_date DATE NOT NULL,
        payment_type VARCHAR(20) NOT NULL,
        is_active CHAR(1) DEFAULT 'Y',
        is_fully_paid CHAR(1) DEFAULT 'N',
        status VARCHAR(30) DEFAULT 'PENDING'
      );
    `);

    await db.query(`
      CREATE TABLE payment_charge_job (
        charge_job_id SERIAL PRIMARY KEY,
        invoice_id INT REFERENCES invoice(invoice_id),
        amount NUMERIC(10,2) NOT NULL,
        job_status VARCHAR(30) DEFAULT 'NEW',
        retry_count INT DEFAULT 0,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE payment_transaction (
        payment_txn_id SERIAL PRIMARY KEY,
        invoice_id INT REFERENCES invoice(invoice_id),
        payment_type VARCHAR(20),
        amount NUMERIC(10,2),
        txn_status VARCHAR(20),
        txn_reference VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE event_queue (
        event_id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        invoice_id INT,
        payload JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'NEW',
        retry_count INT DEFAULT 0,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE payment_audit_log (
        audit_id SERIAL PRIMARY KEY,
        invoice_id INT,
        event_id INT,
        request_payload JSONB,
        response_payload JSONB,
        status VARCHAR(30),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      INSERT INTO invoice (customer_id, amount_due, bill_date, payment_type, is_active, is_fully_paid, status)
      VALUES
      (101, 120.00, CURRENT_DATE - INTERVAL '2 day', 'CARD', 'Y', 'N', 'PENDING'),
      (102, 220.00, CURRENT_DATE - INTERVAL '1 day', 'CARD', 'Y', 'N', 'PENDING'),
      (103, 900.00, CURRENT_DATE, 'CARD', 'Y', 'N', 'PENDING'),
      (104, 440.00, CURRENT_DATE, 'CARD', 'Y', 'N', 'PENDING'),
      (105, 550.00, CURRENT_DATE, 'CARD', 'Y', 'N', 'PENDING');
    `);

    await db.query(`
      INSERT INTO payment_charge_job (invoice_id, amount, job_status, retry_count)
      SELECT invoice_id, amount_due, 'NEW', 0
      FROM invoice
      WHERE payment_type = 'CARD';
    `);

    console.log("Event-driven database initialized.");
  } catch (err) {
    console.error("Init error:", err.message);
  } finally {
    process.exit();
  }
}

initEventDb();