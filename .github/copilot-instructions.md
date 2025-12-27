# AI Coding Guidelines for Humidex-Heat

## Architecture Overview
This is a Node-RED flow for intelligent heating automation in Home Assistant. It uses a **centralized state management** pattern with `flow.get('heating_store')` as the Single Source of Truth (SSOT). All state changes flow through action-based updates (INIT, UPDATE_ROOM_STATE, EVENT_MESSAGE, TICK, etc.).

Key components:
- **Store API**: Inline in `humidex-heat.json`, manages state and lookup tables
- **Message Dispatcher**: Inline in `humidex-heat.json`, routes polling messages to sensor nodes
- **Smart Normalizer**: Inline in `humidex-heat.json`, normalizes sensor data and aggregates room state
- **Heating Controller**: Inline in `humidex-heat.json`, core decision logic with Humidex calculations
- **Output Dispatcher**: Inline in `humidex-heat.json`, routes controller output to handlers
- **Overshoot Tracker**: Inline in `humidex-heat.json`, adaptive learning algorithm
- **Event Messenger**: Inline in `humidex-heat.json`, processes real-time events
- **Store Adapter**: Inline in `humidex-heat.json`, event message processing
- **Flow JSON** (`humidex-heat.json`): Complete Node-RED flow definition with all logic inline

## Key Patterns
- **Action-Based Updates**: Always use explicit actions for state changes, never direct mutation
- **Immutable State**: Clone objects before modification: `room.state = { ...room.state, ...payload.state }`
- **Entity-Room Lookup**: Use `flow.get('room_by_heater')` for reverse mapping from HA entities to room IDs
- **Humidex Calculation**: When external sensors available, use: `temp + 0.5555 * (e - 10)` where `e = 6.112 * 10^((7.5 * dewPoint) / (237.7 + dewPoint))`
- **Adaptive Learning**: Exponential moving average for overshoot: `new = (old × 0.9) + (overshoot × 0.1)`

## Developer Workflows
- **Setup**: Import `humidex-heat.json` into Node-RED, configure HA WebSocket connection, update MQTT settings if needed
- **Configuration**: Modify the "Config & Init" inject node payload with room definitions and schedules
- **Debugging**: Use "Dump" inject to inspect store state, monitor debug outputs, check node status indicators
- **Testing**: Deploy flow, monitor HA entity changes, verify heating commands via MQTT or HA logs
- **Scheduling**: Rooms support time-based schedules with weekday/weekend defaults; preheat offsets for adaptive learning

## Conventions
- **State Keys**: `heating_store` for main config, `room_by_heater` for entity lookup
- **Time Handling**: Use `Date.now()` for timestamps, ISO strings for logging
- **Sensor Modes**: Dual support - Humidex (temp+humidity) or classic (thermostat-only)
- **Window Logic**: 2-minute grace period before shutdown, tracked via `window_open_since`
- **Manual Overrides**: Detected when setpoint deviation > hysteresis + 0.5°C

## Important Files
- `README.md`: Comprehensive documentation with architecture, node descriptions, and troubleshooting
- `nodes/heating-controller.js`: Editing convenience file for Heating Controller logic (pasted inline into flow)
- `nodes/store-api-node.js`: Editing convenience file for Store API logic (pasted inline into flow)
- `nodes/store-adapter.js`: Editing convenience file for Store Adapter logic (pasted inline into flow)
- `nodes/message-dispatcher.js`: Editing convenience file for Message Dispatcher logic (pasted inline into flow)
- `nodes/smart-normalizer.js`: Editing convenience file for Smart Normalizer logic (pasted inline into flow)
- `nodes/output-dispatcher.js`: Editing convenience file for Output Dispatcher logic (pasted inline into flow)
- `nodes/overshoot-tracker.js`: Editing convenience file for Overshoot Tracker logic (pasted inline into flow)
- `nodes/event-messenger.js`: Editing convenience file for Event Messenger logic (pasted inline into flow)
- `humidex-heat.json`: Flow definition with all function node code inline

## External Dependencies
- Home Assistant with WebSocket API access
- `node-red-contrib-home-assistant-websocket` palette
- MQTT broker (optional for state publishing)

Focus on preserving the SSOT pattern and action-based architecture when making changes.</content>
<parameter name="filePath">c:\Users\haged\projects\humidex-heat\.github\copilot-instructions.md