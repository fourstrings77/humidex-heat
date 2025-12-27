// =====================
// Event Processor Node
// =====================

const store = flow.get('heating_store');
if (!store) {
    node.error('Store nicht initialisiert!');
    return null;
}

const ROOM_LOOKUP = flow.get('room_by_heater') || {};
const entityId = msg.topic;
const eventType = msg.eventType;

node.status({fill:"red",shape:"ring",text: eventType});
const now = new Date();
const WINDOW_GRACE_MS = 2 * 60 * 1000; // 2 Minuten Fenster-Entprellung

// --- Hilfsfunktionen ---
function getRoomId(entityId) {
    return ROOM_LOOKUP[entityId] || null;
}

function updateWindowState(room, isOpen) {
   
    if (isOpen) {
        if (!room.state.window_open_since) {
            room.state.window_open_since = now.getTime();
        }
        const openForMs = now.getTime() - room.state.window_open_since;
        return openForMs >= WINDOW_GRACE_MS;
    } else {
        room.state.window_open_since = null;
        return false;
    }
}

function markManualOverride(room) {
    room.state.manual_override_active = true;
    room.state.last_manual_override = now.toISOString();
}

// --- Event Verarbeitung ---
const event = msg.payload;
let roomId = getRoomId(entityId);

if (!roomId) {
    node.warn(`Kein Raum für Entity ${entityId} gefunden`);
    return null;
}

const room = store.rooms[roomId];

switch(eventType){
    case 'WINDOW_EVENT':

        const windowOpen = event === 'on';
        const shouldStopHeating = updateWindowState(room, windowOpen);

        const payload = {
            roomId,
            state: {
                heating: shouldStopHeating ? 'off' : room.state.heating,
                window_open_since: (new Date()).getTime(),
            },
            reason: shouldStopHeating ? 'window_open' : 'window_open_grace'
        };
        //node.warn(payload);
        return [{ action: 'UPDATE_ROOM_STATE', payload }, null];
    break;
    case 'OVERRIDE_EVENT':
        return null;
    break;
    default:
        node.error("Unknown Event", msg);
}
return null;