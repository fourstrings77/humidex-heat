if (!msg.payload?.config?.payload) return null;

// Das ist der eigentliche Event
const eventMsg = msg.payload.config.payload;

// cron-plus Payload nach oben ziehen
msg.action = eventMsg.action;
msg.payload = eventMsg.payload;

// Optional: Topic setzen für Logging
msg.topic = msg.payload.roomId;

return msg;
