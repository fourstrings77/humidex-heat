const d = msg.payload;
const room = d.config;
const now = new Date();

// =====================
// Konstanten
// =====================
const WINDOW_GRACE_MS = 2 * 60 * 1000;
const PREHEAT_OFFSET = room.preheat_offset ?? 2.0;

// =====================
// EVENT MODE (höchste Priorität)
// =====================
if (msg.action === 'HEAT_ON' || msg.action === 'HEAT_OFF') {
    let nextState = 'off';
    let reason = msg.action;

    if (msg.action === 'HEAT_ON') {
        nextState = msg.payload?.mode === 'preheat' ? 'preheat' : 'heat';
    }

    msg.payload = {
        roomId: msg.payload.roomId,
        heater_entity: room.heater_entity,
        nextState,
        currentState: room.state.heating,
        changed: nextState !== room.state.heating,
        reason,
        forced: true,
        ts: Date.now()
    };

    node.status({
        fill: nextState === 'off' ? 'grey' : 'red',
        shape: 'ring',
        text: `EVENT → ${nextState}`
    });

    return msg;
}

// =====================
// Sensor-Handling
// =====================
const hasExternalSensors =
    d.temperature !== null &&
    d.temperature !== undefined &&
    d.humidity !== null &&
    d.humidity !== undefined;

let temp, hum, currentVal;

if (hasExternalSensors) {
    temp = d.temperature;
    hum = d.humidity;

    const dewPoint = temp - ((100 - hum) / 5);
    const e = 6.112 * Math.pow(10, (7.5 * dewPoint) / (237.7 + dewPoint));
    currentVal = Math.round((temp + 0.5555 * (e - 10)) * 10) / 10;
} else {
    temp = d.manual_setpoint;
    currentVal = temp;
}

// =====================
// Zeit / Schedule
// =====================
const currentDay = now.getDay();
const currentMin = now.getHours() * 60 + now.getMinutes();

function getActiveSchedule() {
    const parseT = (t) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
    };

    return (room.schedules || [])
        .filter(s => {
            if (!s.days.includes(currentDay)) return false;
            const start = parseT(s.start);
            const end = parseT(s.end);
            return start < end
                ? currentMin >= start && currentMin < end
                : currentMin >= start || currentMin < end;
        })
        .sort((a, b) => b.humidex_target - a.humidex_target)[0] || null;
}

const activeSched =
    getActiveSchedule() ||
    (currentDay % 6 === 0
        ? d.default_schedules.weekend
        : d.default_schedules.weekday);

let target = activeSched.humidex_target;
const hyst = activeSched.humidex_hysteresis || 1;

// =====================
// Preheat-Ziel
// =====================
const isPreheatActive = room.state.heating === 'preheat';
if (isPreheatActive) {
    target += PREHEAT_OFFSET;
}

// =====================
// Manual Override
// =====================
const manual = d.manual_setpoint;
const isControlCmd = manual === 30 || manual === 5;

let reason = "schedule_active";
let manualOverride = false;

if (!isControlCmd && Math.abs(manual - target) > (hyst + 0.5)) {
    target = manual;
    reason = "MANUAL_OVERRIDE";
    manualOverride = true;
}

// =====================
// Adaptive Learning
// =====================
const learnedOffset = Math.min(
    Math.max(0, room.state.learned_overshoot || 0),
    2.0
);

// =====================
// Entscheidungslogik
// =====================
let nextState = room.state.heating || "off";

// Fenster Hybrid
if (d.windowOpen) {
    if (!room.state.window_open_since) {
        room.state.window_open_since = now.getTime();
    }

    const openForMs = now.getTime() - room.state.window_open_since;

    if (openForMs >= WINDOW_GRACE_MS) {
        nextState = "off";
        reason = "window_open";
    } else {
        reason = "window_open_grace";
    }
} else {
    room.state.window_open_since = null;

    if (hasExternalSensors) {
        if (currentVal < (target - hyst)) {
            nextState = isPreheatActive ? "preheat" : "heat";
            reason = `heating_to_${target}`;
        } else {
            const stopThreshold = room.adaptive_learning
                ? (target - learnedOffset)
                : (target + hyst);

            if (currentVal > stopThreshold) {
                nextState = "off";
                reason = room.adaptive_learning
                    ? `adaptive_stop_at_${stopThreshold.toFixed(1)}`
                    : `stop_above_${target + hyst}`;
            } else {
                reason = "within_hysteresis";
            }
        }
    } else {
        if (temp < (target - hyst)) {
            nextState = "heat";
            reason = `heating_to_${target}_classic`;
        } else if (temp > (target + hyst)) {
            nextState = "off";
            reason = `stop_above_${target}_classic`;
        } else {
            reason = "within_hysteresis_classic";
        }
    }
}

// =====================
// 5-Minuten-Tick Sicherheitsnetz
// =====================
if (
    d.tick === true &&
    activeSched &&
    nextState === "off" &&
    room.state.heating === "off" &&
    !d.windowOpen
) {
    nextState = isPreheatActive ? "preheat" : "heat";
    reason = "tick_schedule_correction";
}

// =====================
// Output
// =====================
msg.payload = {
    roomId: d.roomId,
    heater_entity: room.heater_entity,
    value: currentVal,
    target,
    nextState,
    currentState: room.state.heating,
    changed: nextState !== room.state.heating,
    reason,
    manual_override: manualOverride,
    adaptive: room.adaptive_learning,
    has_external_sensors: hasExternalSensors,
    ts: now.getTime()
};

node.status({
    fill: nextState === "heat" || nextState === "preheat" ? "red" : "grey",
    shape: "dot",
    text: `${currentVal} → ${target} (${reason})`
});

return msg;