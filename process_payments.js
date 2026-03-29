require("dotenv").config();
const axios = require("axios");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database : process.env.DB_NAME,
  user : process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});


async function processPayments() {
  const client = await pool.connect();
  try {
    console.log("Starting payment processing...");
    const result = await client.query(`
      SELECT * 
      FROM payment_charge_job
      where job_status='NEW'
      AND processing_flag=FALSE
      ORDER BY charge_job_id
      LIMIT 5
      FOR UPDATE SKIP LOCKED
      `);

        const jobs = result.rows;
    console.log("Jobs picked:", jobs.length);

    for (const job of jobs) {
      console.log(`Processing invoice ${job.invoice_id}`);
      try{
        await client.query("BEGIN")
        
        await client.query(`
          UPDATE payment_charge_job
          SET  processing_flag=TRUE
          WHERE charge_job_id= $1
          `,[job.charge_job_id]);

          //Idempotency check
          const existing = await client.query(`
            SELECT 1
            FROM payment_transaction
            WHERE invoice_id = $1
            AND txn_status='SUCCESS'
            `,[job.invoice_id]);

      if(existing.rows.length >0){
        console.log('skipping invoice ${job.invoice_id} (already paid)');
        await client.query("COMMIT");
        continue;
      }
       const payload = {
        invoiceId: job.invoice_id,
        amount: job.amount
      };
   
      let apiResponse;
      try {
        const res = await axios.post(process.env.API_URL, payload,{timeout:5000});
        apiResponse = res.data;
        console.log("API response:", apiResponse);
      } catch (err) {
        apiResponse = {
          status: "FAILED",
          errorCode:"NETWORK",
          message: err.message
        };
      }
 //audit log
  await client.query(`
    INSERT INTO payment_audit_log
    (invoice_id,charge_job_id,request_payload,response_payload,status)
    VALUES($1,$2,$3,$4,$5)`,[job.invoice_id,job.charge_job_id,payload,apiResponse,apiResponse.status]);

      if (apiResponse.status === "SUCCESS") {
        await client.query(
          `
          INSERT INTO payment_transaction (invoice_id, payment_type, amount, txn_status, txn_reference)
          VALUES ($1, 'CARD', $2, 'SUCCESS', $3)
          `,
          [job.invoice_id, job.amount, apiResponse.txnReference]
        );

        await client.query(
          `
          UPDATE payment_charge_job
          SET job_status = 'SUCCESS',
              processing_flag=FALSE,
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,
          [job.charge_job_id]
        );

        await client.query(
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
        //retry vs permanent fail
        const retryableErrors=["NETWORK","TIMEOUT"];
        const nextRetry=job.retry_count+1;

        if(retryableErrors.includes(apiResponse.errorCode) && nextRetry < 3){
          await client.query(`
            UPDATE payments_charge_job
            SET job_status='RETRY_PENDING',
            retry_count=$2,
            processing_flag=FALSE
            WHERE charge_job_id =$1`,[job.charge_job_id,nextRetry]);
           


        }else{
            await client.query(`
          UPDATE payment_charge_job
          SET job_status = 'PERMANENT_FAILED',
              retry_count = $2,
              processing_flag=FALSE,
              updated_at = CURRENT_TIMESTAMP
          WHERE charge_job_id = $1
          `,[job.charge_job_id,nextRetry]);
        }
      }
       await client.query("COMMIT");
    } catch (err){
      await client.query("ROLLBACK");
      console.error("transaction failed",err.message);
    }
    
  }
 } catch (err) {
    console.error ("Process error:", err.message);
  } finally {
    client.release();
  }
}

processPayments();
