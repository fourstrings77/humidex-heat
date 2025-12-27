const res = msg.payload;
const roomId = res.roomId;
const store = flow.get('heating_store');
if (!store || !store.rooms[roomId]) return null;
const room = store.rooms[roomId];

if (!room.adaptive_learning) return null;

if (res.changed && res.nextState === "off" && !res.reason.includes("window")) {
    room.state.last_stop_val = res.humidex;
    room.state.peak_after_stop = res.humidex;
    flow.set('heating_store', store);
}

if (res.currentState === "off" && room.state.last_stop_val) {
    if (res.humidex > room.state.peak_after_stop) room.state.peak_after_stop = res.humidex;
    const overshoot = Math.max(0, room.state.peak_after_stop - room.state.last_stop_val);
    if (overshoot < 3.0) {
        const old = room.state.learned_overshoot || 0;
        room.state.learned_overshoot = Math.round(((old * 0.9) + (overshoot * 0.1)) * 10) / 10;
        flow.set('heating_store', store);
    }
}

if (res.nextState === "heat") {
    room.state.last_stop_val = null;
    flow.set('heating_store', store);
}
return null;