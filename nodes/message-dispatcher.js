/**
 * Message Dispatcher
 * - Dumm wie Brot
 * - Sortiert Nachrichten nach Typ
 */

const msgs = Array.isArray(msg.payload) ? msg.payload : [msg.payload];

const temperature = [];
const humidity = [];
const events = [];

for (const m of msgs) {
  if (!m) continue;

  if (m.type === "temperature") temperature.push(m);
  else if (m.type === "humidity") humidity.push(m);
  else if (m.action === "INTENT") events.push(m);
}

node.status({
  fill: events.length ? "yellow" : "green",
  shape: "dot",
  text: `T:${temperature.length} H:${humidity.length} E:${events.length}`,
});

return [
  temperature.length ? temperature : null,
  humidity.length ? humidity : null,
  events.length ? events : null,
];
