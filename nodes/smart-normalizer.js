const roomId = msg.roomId;
const type = msg.type;
let val = msg.payload;

let store = flow.get('heating_store');
if (!store || !store.rooms[roomId]) return null;

const room = store.rooms[roomId];

// Wert-Normalisierung
if (type === 'window') {
    // Erkennt 'on', 'open' oder true als offen
    val = (val === 'on' || val === 'open' || val === true);
} else {
    val = parseFloat(val);
}

// State im Store aktualisieren
room.state[type] = val;
room.state.lastUpdate = new Date().toISOString();
flow.set('heating_store', store);

const st = room.state;

// VALIDIERUNG: Wann darf die Nachricht zum Controller?
// Wir lassen sie durch, wenn Temperatur vorhanden ist. 
// Humidity ist optional (für Räume wie dein Bad).
if (st.temperature !== undefined && st.temperature !== null) {

    msg.payload = {
        roomId: roomId,
        temperature: st.temperature,
        humidity: st.humidity || null, // Fallback für Räume ohne Hum-Sensor
        // WICHTIG: Korrekte Prüfung auf deinen Store-Key 'window_open_since'
        windowOpen: !!st.window_open_since,
        manual_setpoint: st.manual_setpoint || null,
        config: room,
        default_schedules: store.default_schedules,
        // Geben wir mit, ob es ein Tick oder ein Event war
        trigger: msg.action || 'sensor_update'
    };

    return msg;
}

return null;