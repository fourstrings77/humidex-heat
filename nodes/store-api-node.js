const STORE_KEY = 'heating_store';
const ROOM_LOOKUP_KEY = "room_by_heater";

const ACTION = msg.action || 'INIT';
const payload = msg.payload || {};
let scheduleOut = [];
function now() { return new Date().toISOString(); }

function updateLookup(store) {
    const lookup = {};
    for (const [roomId, room] of Object.entries(store.rooms)) {
        if (room.heater_entity) lookup[room.heater_entity] = roomId;
        if (room.temp_sensor) lookup[room.temp_sensor] = roomId;
        if (room.humidity_sensor) lookup[room.humidity_sensor] = roomId;
        if (room.window_sensor) lookup[room.window_sensor] = roomId;
    }
    flow.set(ROOM_LOOKUP_KEY, lookup);
}
function validateConfig(payload) {
    if (payload.length == 0) {
        node.error('No Config given!', msg);
    }

    return true;
}
function getSchedulesByRoom(room) {

}
/**
 * Berechnet den effektiven Startzeitpunkt und korrigiert ggf. die Wochentage.
 * * @param {string} startTime - Format "HH:mm"
 * @param {number[]} days - Array von Wochentagen [0-6]
 * @param {number} offsetMinutes - Minuten, die abgezogen werden sollen
 * @returns {{hour: number, minute: number, days: number[], timeStr: string}}
 */
function calculateEffectiveSchedule(startTime, days, offsetMinutes) {
    const [h, m] = startTime.split(':').map(Number);
    
    const date = new Date();
    date.setHours(h, m, 0, 0);
    const originalDate = date.getDate();

    // Zeit abziehen
    date.setMinutes(date.getMinutes() - offsetMinutes);

    const result = {
        hour: date.getHours(),
        minute: date.getMinutes(),
        days: [...days],
        timeStr: ""
    };

    // Datums-Shift korrigieren (Vortag-Problem)
    if (date.getDate() !== originalDate) {
        result.days = result.days.map(d => (d === 0 ? 6 : d - 1));
    }

    result.timeStr = `${String(result.hour).padStart(2, '0')}:${String(result.minute).padStart(2, '0')}`;
    
    return result;
}
function createDailyCronJobs() {
    const config = flow.get(STORE_KEY);
    if (!config || !config.rooms) return;

    for (const [roomName, roomData] of Object.entries(config.rooms)) {
        let scheduleId = 0;

        for (const s of roomData.schedules) {
            const [startHour, startMinute] = s.start.split(':');
            const [endHour, endMinute] = s.end.split(':');

            const scheduleDays = s.days.join(',');


            if(roomData.adaptive_learning){
                const offset = roomData.adaptive_learning ? 20 : 0; // 20 Min bei adaptive, sonst 0
                const effectiveStart = calculateEffectiveSchedule(s.start, s.days, offset);
                const preheatDays = effectiveStart.days.join(',');
                
                scheduleOut.push({
                    "payload": {
                        "command": "add",
                        "name": `${roomName}_${scheduleId}_STARTPREHEAT_${effectiveStart.hour}_${effectiveStart.minute}`,
                        "expression": `0 ${effectiveStart.minute} ${effectiveStart.hour} * * ${preheatDays}`,
                        "payload": {
                            "action": "SCHEDULE_EVENT",
                            "payload": {
                                "roomId": roomName,
                                "event": "START_PREHEAT"
                            }
                        }
                    }
                });
                scheduleOut.push({
                    "payload": {
                        "command": "add",
                        "name": `${roomName}_${scheduleId}_ENDPREHEAT_${startHour}_${startMinute}`,
                        "expression": `0 ${startMinute} ${startHour} * * ${preheatDays}`,
                        "payload": {
                            "action": "SCHEDULE_EVENT",
                            "payload": {
                                "roomId": roomName,
                                "event": "END_PREHEAT"
                            }
                        }
                    }
                });
            };
            
            scheduleOut.push({
                "payload": {
                    "command": "add",
                    "name": `${roomName}_${scheduleId}_start_${startHour}_${startMinute}`,
                    "expression": `0 ${startMinute} ${startHour} * * ${scheduleDays}`,
                    "payload": {
                        "action": "SCHEDULE_EVENT",
                        "payload": {
                            "roomId": roomName,
                            "event": "START_HEAT"
                        }
                    }
                }
            });
            
            scheduleOut.push({
                "payload": {
                    "command": "add",
                    "name": `${roomName}_${scheduleId}_end_${endHour}_${endMinute}`,
                    "expression": `0 ${endMinute} ${endHour} * * ${scheduleDays}`,
                    "payload": {
                        "action": "SCHEDULE_EVENT",
                        "payload": {
                            "roomId": roomName,
                            "event": "STOP_HEAT"
                        }
                    }

                }
            });
            scheduleId = scheduleId + 1;
        }
    }
}
function resetScheduler(){
    scheduleOut.push({
        "topic": "reset-all-dynamic"
    })
}
switch (ACTION) {
    case 'INIT':
        validateConfig(payload);
        for (const room of Object.values(payload.rooms)) {
            if (!room.state) {
                room.state = {
                    heating: 'off',
                    toggles: 0,
                    learned_overshoot: 0,
                    lastChange: now(),
                    window_open_since: null,
                    manual_override: null
                };
            }
        }
        flow.set(STORE_KEY, payload);
        updateLookup(payload);
        node.status({ fill: "green", shape: "dot", text: "Store Ready" });
        break;

    case 'UPDATE_ROOM_STATE':
        const store = flow.get(STORE_KEY);
        if (store && store.rooms[payload.roomId]) {
            const room = store.rooms[payload.roomId];
            if (room.state.heating !== payload.state.heating) {
                room.state.toggles++;
            }
            room.state = { ...room.state, ...payload.state, lastChange: now() };
            flow.set(STORE_KEY, store);
        }
        break;

    case 'EVENT_MESSAGE':
        // payload: { entityId, type, value }
        const storeEv = flow.get(STORE_KEY);
        const lookup = flow.get(ROOM_LOOKUP_KEY);
        if (!storeEv || !lookup) break;

        const roomId = lookup[payload.entityId];
        if (!roomId) break;

        const roomEv = storeEv.rooms[roomId];
        switch (payload.type) {
            case 'window':
                roomEv.state.window_open_since = payload.value === 'on' ? Date.now() : null;
                break;
            case 'manual_setpoint':
                roomEv.state.manual_override = payload.value;
                break;
            default:
                break;
        }
        flow.set(STORE_KEY, storeEv);
        break;
    case "RESCHEDULE":
        resetScheduler();
        createDailyCronJobs();
        break;
    case 'TICK':
        const config = flow.get(STORE_KEY);
        if (!config) return null;
        const poll = [];
        for (const [id, r] of Object.entries(config.rooms)) {
            poll.push({ type: 'temperature', roomId: id, entityId: r.temp_sensor });
            if (r.humidity_sensor !== null) {
                poll.push({ type: 'humidity', roomId: id, entityId: r.humidity_sensor });
            }
            poll.push({ type: 'manual_setpoint', roomId: id, entityId: r.heater_entity });
        }
        return [null, { payload: poll }];

    case 'DUMP_STORE':
        node.warn(flow.get(STORE_KEY));
        return null;
        break;
}

return [msg, scheduleOut];