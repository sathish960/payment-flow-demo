const kafka = require("../config/kafka");
const { callGateway } = require("../services/gatewayClient");

async function runConsumer() {
  const consumer = kafka.consumer({ groupId: "payment-request-processor" });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: "payment-requested", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      console.log("Processing event:", event);

      const apiResponse = await callGateway({
        invoiceId: event.invoiceId,
        amount: event.amount
      });

      const resultEvent = {
        eventId: event.eventId,
        eventType: apiResponse.status === "SUCCESS" ? "PAYMENT_SUCCEEDED" : "PAYMENT_FAILED",
        chargeJobId: event.chargeJobId,
        invoiceId: event.invoiceId,
        amount: event.amount,
        retryCount: event.retryCount,
        response: apiResponse
      };

      await producer.send({
        topic: apiResponse.status === "SUCCESS" ? "payment-succeeded" : "payment-failed",
        messages: [
          {
            key: String(event.invoiceId),
            value: JSON.stringify(resultEvent)
          }
        ]
      });
    }
  });
}

runConsumer().catch(err => {
  console.error("Request consumer error:", err.message);
});