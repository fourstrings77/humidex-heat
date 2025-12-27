const res = msg.payload;

// --- Home Assistant ---
let outHA = null;
if (res.changed) {
    const isHeating = res.nextState === "heat" || res.nextState === "preheat";

    outHA = {
        payload: {
            action: isHeating
                ? "climate.set_temperature"
                : "climate.set_hvac_mode",
            data: {
                entity_id: res.heater_entity,
                ...(isHeating
                    ? {
                        temperature: res.nextState === "preheat" ? 30 : res.target,
                        hvac_mode: "heat"
                    }
                    : { hvac_mode: "off" })
            }
        }
    };
}

// --- Store ---
const outStore = {
    action: "UPDATE_ROOM_STATE",
    payload: {
        roomId: res.roomId,
        state: {
            heating: res.nextState,
            phase: res.nextState === "preheat" ? "preheat" : "normal",
            target: res.target,
            lastReason: res.reason,
            manual_override: res.manual_override
        }
    }
};

// --- Learning ---
const outLearn = { payload: res };

// --- MQTT ---
const outMqtt = {
    topic: `heating/${res.roomId}/state`,
    payload: {
        active: res.nextState === "heat" || res.nextState === "preheat",
        phase: res.nextState,
        target: res.target,
        value: res.value,
        reason: res.reason,
        manual_override: res.manual_override,
        adaptive: res.adaptive,
        sensors: res.has_external_sensors ? "humidex" : "classic",
        ts: res.ts
    }
};

return [outHA, outStore, outLearn, outMqtt];