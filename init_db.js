const db = require("./db");

async function initDb() {
  try {
    await db.query(`
      DROP TABLE IF EXISTS payment_transaction;
      DROP TABLE IF EXISTS payment_charge_job;
      DROP TABLE IF EXISTS invoice;
      DROP TABLE IF EXISTS payment_audit_log;
       
      create table payment_audit_log (
audit_id serial primary key,
invoice_id int,
charge_job_id int,
request_payload jsonb,
response_payload jsonb,
status varchar(30),
error_message text,
created_at timestamp default current_timestamp
);



      CREATE TABLE invoice (
        invoice_id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL,
        amount_due NUMERIC(10,2) NOT NULL,
        bill_date DATE NOT NULL,
        payment_type VARCHAR(20) NOT NULL,
        is_active CHAR(1) NOT NULL DEFAULT 'Y',
        is_fully_paid CHAR(1) NOT NULL DEFAULT 'N',
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
      );

      CREATE TABLE payment_charge_job (
        charge_job_id SERIAL PRIMARY KEY,
        invoice_id INT NOT NULL REFERENCES invoice(invoice_id),
        amount NUMERIC(10,2) NOT NULL,
        job_status VARCHAR(30) NOT NULL DEFAULT 'NEW',
        retry_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      alter table payment_charge_job add column processing_flag boolean default FALSE;

      CREATE TABLE payment_transaction (
        payment_txn_id SERIAL PRIMARY KEY,
        invoice_id INT NOT NULL REFERENCES invoice(invoice_id),
        payment_type VARCHAR(20) NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        txn_status VARCHAR(30) NOT NULL,
        txn_reference VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      INSERT INTO invoice (customer_id, amount_due, bill_date, payment_type, is_active, is_fully_paid, status)
      VALUES
      (101, 500.00, CURRENT_DATE - INTERVAL '1 day', 'CARD', 'Y', 'N', 'PENDING'),
      (102, 750.00, CURRENT_DATE - INTERVAL '1 day', 'CARD', 'Y', 'N', 'PENDING'),
      (103, 900.00, CURRENT_DATE - INTERVAL '1 day', 'CARD', 'Y', 'N', 'PENDING');
    `);

    await db.query(`
      INSERT INTO payment_charge_job (invoice_id, amount, job_status)
      SELECT invoice_id, amount_due, 'NEW'
      FROM invoice
      WHERE payment_type = 'CARD';
    `);

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
  } finally {
    process.exit();
  }
}

initDb();