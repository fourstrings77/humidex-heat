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
let roomId;

if (eventType === 'SCHEDULE_EVENT') {
    roomId = event.roomId;
} else {
    roomId = getRoomId(entityId);
}

if (!roomId) {
    node.warn(`Kein Raum für ${eventType === 'SCHEDULE_EVENT' ? 'Schedule' : 'Entity'} ${eventType === 'SCHEDULE_EVENT' ? event.roomId : entityId} gefunden`);
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
        // Handle manual override by setting manual_override in room state
        room.state.manual_override = event;
        room.state.last_manual_override = now.toISOString();
        flow.set('heating_store', store);
        return [{ action: 'UPDATE_ROOM_STATE', payload: { roomId, state: { manual_override: event } } }, null];
    break;
    case 'SCHEDULE_EVENT':
        // Process schedule events
        const scheduleAction = event.event === 'START_HEAT' ? 'HEAT_ON' : 
                              event.event === 'STOP_HEAT' ? 'HEAT_OFF' : 
                              event.event === 'START_PREHEAT' ? 'HEAT_ON' : null;
        
        if (scheduleAction) {
            return [{
                action: scheduleAction,
                payload: {
                    roomId: event.roomId,
                    mode: event.event === 'START_PREHEAT' ? 'preheat' : 'normal'
                }
            }, null];
        }
        break;
    default:
        node.error("Unknown Event", msg);
}
return null;