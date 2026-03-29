const db = require("../db/db");

async function initDb() {
  try {
    await db.query(`
      DROP TABLE IF EXISTS payment_dlq;
      DROP TABLE IF EXISTS payment_audit_log;
      DROP TABLE IF EXISTS payment_transaction;
      DROP TABLE IF EXISTS payment_charge_job;
      DROP TABLE IF EXISTS invoice;
    `);

    await db.query(`
      CREATE TABLE invoice (
        invoice_id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL,
        amount_due NUMERIC(12,2) NOT NULL,
        bill_date DATE NOT NULL,
        payment_type VARCHAR(20) NOT NULL,
        is_active CHAR(1) DEFAULT 'Y',
        is_fully_paid CHAR(1) DEFAULT 'N',
        status VARCHAR(30) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE payment_charge_job (
        charge_job_id SERIAL PRIMARY KEY,
        invoice_id INT REFERENCES invoice(invoice_id),
        amount NUMERIC(12,2) NOT NULL,
        job_status VARCHAR(30) DEFAULT 'NEW',
        retry_count INT DEFAULT 0,
        max_retry_count INT DEFAULT 3,
        next_retry_at TIMESTAMP,
        last_error_code VARCHAR(50),
        last_error_message TEXT,
        processing_flag BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE payment_transaction (
        payment_txn_id SERIAL PRIMARY KEY,
        invoice_id INT REFERENCES invoice(invoice_id),
        payment_type VARCHAR(20) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        txn_status VARCHAR(20) NOT NULL,
        txn_reference VARCHAR(120),
        event_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE payment_audit_log (
        audit_id SERIAL PRIMARY KEY,
        invoice_id INT,
        charge_job_id INT,
        event_id UUID,
        event_type VARCHAR(50),
        request_payload JSONB,
        response_payload JSONB,
        final_status VARCHAR(30),
        error_code VARCHAR(50),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE payment_dlq (
        dlq_id SERIAL PRIMARY KEY,
        event_id UUID,
        topic_name VARCHAR(100),
        invoice_id INT,
        payload JSONB,
        failure_reason TEXT,
        error_code VARCHAR(50),
        retry_count INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE UNIQUE INDEX uniq_payment_success_invoice
      ON payment_transaction(invoice_id)
      WHERE txn_status = 'SUCCESS';
    `);

    console.log("Production-style DB initialized.");
  } catch (err) {
    console.error("DB init error:", err.message);
  } finally {
    process.exit();
  }
}

initDb();