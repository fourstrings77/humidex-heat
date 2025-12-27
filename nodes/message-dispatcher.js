const messages = Array.isArray(msg.payload) ? msg.payload : [msg.payload];

function isEvent(m) {
    // Scheduler-Events
    if (m.action === 'SCHEDULE_EVENT') return true;

    // Event-Messenger (window / manual)
    if (m.type === 'window' || m.type === 'manual_setpoint') return true;

    return false;
}

const temperature = [];
const humidity = [];
const events = [];

for (const m of messages) {
    if (!m || !m.type && !m.action) continue;

    if (m.type === 'temperature') {
        temperature.push(m);
        continue;
    }

    if (m.type === 'humidity') {
        humidity.push(m);
        continue;
    }

    if (isEvent(m)) {
        events.push(m);
        continue;
    }
}

// Status nur zur Beruhigung des Menschen
node.status({
    fill: events.length ? "yellow" : "green",
    shape: "dot",
    text: `T:${temperature.length} H:${humidity.length} E:${events.length}`
});

return [
    temperature.length ? temperature : null,
    humidity.length ? humidity : null,
    events.length ? events : null
];