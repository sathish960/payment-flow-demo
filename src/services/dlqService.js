async function insertDlq(client, {
  eventId,
  topicName,
  invoiceId,
  payload,
  failureReason,
  errorCode,
  retryCount
}) {
  await client.query(
    `INSERT INTO payment_dlq
     (event_id, topic_name, invoice_id, payload, failure_reason, error_code, retry_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [eventId, topicName, invoiceId, payload, failureReason, errorCode || null, retryCount || 0]
  );
}

module.exports = { insertDlq };
