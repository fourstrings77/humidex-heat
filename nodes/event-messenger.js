/**
 * Event Messenger
 * - Übersetzt fremde Events in kanonische INTENTS
 * - Kein Store-Zugriff
 */

function emitIntent(roomId, intent, extra = {}, source = "unknown") {
  return {
    action: "INTENT",
    payload: {
      roomId,
      intent,
      source,
      ...extra,
    },
  };
}

// --- cron-plus Scheduler ---
const sched = msg.payload?.config?.payload;
if (sched?.action === "SCHEDULE_EVENT") {
  const roomId = sched.payload?.room;
  const intent = sched.payload?.eventType;

  if (!roomId || !intent) {
    node.warn("Scheduler-Event ohne roomId oder eventType verworfen");
    return null;
  }

  return emitIntent(roomId, intent, {}, "schedule");
}

// --- Window Sensor ---
if (msg.eventType === "WINDOW_EVENT") {
  const roomId = msg.topic?.split("_").pop();
  if (!roomId) return null;

  return emitIntent(
    roomId,
    msg.payload === "on" ? "WINDOW_OPEN" : "WINDOW_CLOSE",
    {},
    "window"
  );
}

// --- Manual Override (Thermostat) ---
if (msg.eventType === "OVERRIDE_EVENT") {
  const roomId = msg.topic?.split(".").pop();
  if (!roomId) return null;

  return emitIntent(
    roomId,
    "MANUAL_OVERRIDE",
    { value: msg.payload },
    "manual"
  );
}

node.warn("Unbekanntes Event verworfen");
return null;
