async function alreadySuccessful(client, invoiceId) {
  const result = await client.query(
    `SELECT 1
     FROM payment_transaction
     WHERE invoice_id = $1
       AND txn_status = 'SUCCESS'`,
    [invoiceId]
  );

  return result.rows.length > 0;
}

module.exports = { alreadySuccessful };