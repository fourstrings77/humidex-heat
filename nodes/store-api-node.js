/**
 * Store API Node
 * - Single Source of Truth (SSOT)
 * - Nimmt nur kanonische Intents entgegen
 * - Mutiert ausschließlich den Store
 */

const STORE_KEY = "heating_store";

function now() {
  return new Date().toISOString();
}

let scheduleOut = [];

function initStore(config) {
  for (const room of Object.values(config.rooms)) {
    room.state ??= {
      heating: "off",
      window_open_since: null,
      manual_override: null,
      learned_overshoot: 0,
      lastChange: now(),
    };
  }
  flow.set(STORE_KEY, config);
}

function updateRoom(roomId, patch) {
  const store = flow.get(STORE_KEY);
  if (!store?.rooms?.[roomId]) return;

  store.rooms[roomId].state = {
    ...store.rooms[roomId].state,
    ...patch,
    lastChange: now(),
  };

  flow.set(STORE_KEY, store);
}

switch (msg.action) {
  case "INIT":
    initStore(msg.payload);
    node.status({ fill: "green", shape: "dot", text: "Store ready" });
    break;

  case "INTENT": {
    const { roomId, intent, source } = msg.payload;
    if (!roomId || !intent) {
      node.warn("INTENT ohne roomId oder intent verworfen");
      return null;
    }

    if (intent === "WINDOW_OPEN") {
      updateRoom(roomId, { window_open_since: Date.now() });
    }

    if (intent === "WINDOW_CLOSE") {
      updateRoom(roomId, { window_open_since: null });
    }

    if (intent === "MANUAL_OVERRIDE") {
      updateRoom(roomId, { manual_override: msg.payload.value });
    }

    break;
  }

  case "UPDATE_ROOM_STATE": {
    const { roomId, state } = msg.payload;
    updateRoom(roomId, state);
    break;
  }

  case "TICK": {
    const store = flow.get(STORE_KEY);
    if (!store) return null;

    const poll = [];
    for (const [id, r] of Object.entries(store.rooms)) {
      poll.push({ type: "temperature", roomId: id, entityId: r.temp_sensor });
      if (r.humidity_sensor) {
        poll.push({
          type: "humidity",
          roomId: id,
          entityId: r.humidity_sensor,
        });
      }
    }

    return [null, { payload: poll }];
  }
}

return [msg, scheduleOut];
