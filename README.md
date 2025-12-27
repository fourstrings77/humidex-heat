# Heating Control System

A sophisticated Node-RED flow for intelligent heating automation in Home Assistant, featuring adaptive learning, Humidex-based comfort control, and multi-room scheduling.

## 🌟 Features

- **Dual Sensor Modes**: Supports both external temperature/humidity sensors (Humidex calculation) and classic thermostat-only operation
- **Adaptive Learning**: Automatically learns temperature overshoot patterns to optimize heating cycles
- **Smart Scheduling**: Per-room time-based schedules with weekday/weekend defaults
- **Window Detection**: Automatic heating shutdown with grace period when windows are opened
- **Manual Override Detection**: Respects manual thermostat adjustments while maintaining automation
- **MQTT State Publishing**: Real-time heating status for external monitoring and dashboards
- **Centralized State Management**: Single Source of Truth architecture for reliable operation

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Node Descriptions](#node-descriptions)
- [How It Works](#how-it-works)
- [Contributing](#contributing)
- [License](#license)

## 🏗️ Architecture Overview

This flow follows a **centralized state management** pattern with the Store API node serving as the **Single Source of Truth (SSOT)**. All state changes flow through this central store, ensuring consistency and reliability.

```
┌─────────────────────────────────────────────────────────────┐
│                        Store API (SSOT)                      │
│  - Holds all room configurations and states                  │
│  - Manages lookup tables for entity-to-room mapping         │
│  - Ensures atomic state updates                              │
└─────────────────────────────────────────────────────────────┘
                              ↕
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
   [Sensors]            [Controller]           [Events]
   - Temp/Humidity      - Heating Logic        - Windows
   - Window State       - Schedule Eval        - Manual Overrides
   - Manual Setpoint    - Adaptive Learning
```

### Key Architectural Principles

1. **Centralized State**: All room data lives in `flow.get('heating_store')`
2. **Action-Based Updates**: State changes use explicit actions (INIT, UPDATE_ROOM_STATE, TICK, etc.)
3. **Entity-Room Lookup**: Fast reverse mapping from sensor entities to room IDs
4. **Immutable Updates**: State objects are cloned before modification
5. **Single Responsibility**: Each node has one clear purpose

## 📦 Installation

### Prerequisites

- Node-RED instance
- Home Assistant with WebSocket API access
- `node-red-contrib-home-assistant-websocket` palette installed
- MQTT broker (optional, for state publishing)

### Steps

1. Import the flow JSON into Node-RED
2. Configure your Home Assistant server in the config node
3. Update the MQTT broker settings (or remove MQTT nodes if not needed)
4. Modify the initial configuration in the "Config & Init" inject node
5. Deploy and monitor the debug output

## ⚙️ Configuration

### Initial Configuration Structure

The system is configured via the "Config & Init" inject node with the following structure:

```javascript
{
  "default_schedules": {
    "weekday": {
      "humidex_target": 17,
      "humidex_hysteresis": 1
    },
    "weekend": {
      "humidex_target": 18,
      "humidex_hysteresis": 1
    }
  },
  "rooms": {
    "room_name": {
      "adaptive_learning": true,
      "schedules": [
        {
          "start": "06:00",
          "end": "08:00",
          "days": [0,1,2,3,4,5,6],  // 0=Sunday, 6=Saturday
          "humidex_target": 21,
          "humidex_hysteresis": 1
        }
      ],
      "heater_entity": "climate.thermostat_id",
      "temp_sensor": "sensor.temperature_id",      // null for classic mode
      "humidity_sensor": "sensor.humidity_id",     // null for classic mode
      "window_sensor": "binary_sensor.window_id"
    }
  }
}
```

### Room Configuration Options

- **adaptive_learning**: Enable/disable learning of temperature overshoot
- **schedules**: Array of time-based temperature targets
- **heater_entity**: Home Assistant climate entity ID
- **temp_sensor**: External temperature sensor (set to `null` for thermostat-only mode)
- **humidity_sensor**: External humidity sensor (set to `null` for thermostat-only mode)
- **window_sensor**: Binary sensor for window contact

## 🔍 Node Descriptions

### 1. Config & Init
**Type**: Inject  
**Purpose**: Initializes the store with room configurations on deploy  
**Output**: Sends configuration to Store API with action "INIT"

### 2. Store API
**Type**: Function  
**Purpose**: Central state management - the Single Source of Truth  
**Actions**:
- `INIT`: Initialize store with configuration
- `UPDATE_ROOM_STATE`: Update specific room state
- `EVENT_MESSAGE`: Process external events (window, manual override)
- `TICK`: Generate polling requests for all sensors
- `DUMP_STORE`: Debug output of entire store

**Key Features**:
- Maintains `heating_store` in flow context
- Builds `room_by_heater` lookup table for entity-to-room mapping
- Tracks state changes with timestamps
- Atomic state updates

### 3. Message Dispatcher
**Type**: Function  
**Purpose**: Routes polling messages to appropriate sensor nodes  
**Outputs**: [temperature, humidity, window, manual_setpoint]

### 4. Poll Nodes (Temp/Hum/Window/Manual)
**Type**: api-current-state  
**Purpose**: Query current state from Home Assistant entities  
**Configuration**: Uses `{{entityId}}` template from incoming message

### 5. Smart Normalizer
**Type**: Function  
**Purpose**: Normalizes sensor data and aggregates room state  
**Logic**:
- Converts window states to boolean
- Parses numeric sensor values
- Updates store with latest readings
- Emits complete room state when temp + humidity available

### 6. Heating Controller
**Type**: Function  
**Purpose**: Core decision logic for heating control  
**Features**:

#### Sensor Handling
- **Humidex Mode**: Calculates thermal comfort from temp + humidity
- **Classic Mode**: Uses thermostat's internal temperature only

#### Schedule Evaluation
- Checks current time against room schedules
- Falls back to weekday/weekend defaults
- Supports overnight schedules (e.g., 21:00-02:00)

#### Manual Override Detection
- Detects when user manually changes thermostat
- Exempts control commands (30°C = heat, 5°C = off)
- Overrides schedule with manual setpoint if deviation > hysteresis + 0.5

#### Window Logic
- Grace period: 2 minutes before shutting off heat
- Tracks window open duration
- Maintains heating during brief openings

#### Adaptive Learning
- Adjusts stop threshold based on learned overshoot
- Prevents temperature overshooting target
- Applies exponential moving average (90% old, 10% new)

**Output**:
```javascript
{
  roomId: "room_name",
  heater_entity: "climate.entity",
  value: 19.5,              // Current Humidex or temperature
  target: 21,               // Target temperature
  nextState: "heat|off",
  currentState: "heat|off",
  changed: true|false,
  reason: "heating_to_21",
  manual_override: false,
  adaptive: true,
  has_external_sensors: true,
  ts: 1234567890
}
```

### 7. Output Dispatcher
**Type**: Function  
**Purpose**: Routes controller output to appropriate handlers  
**Outputs**:
1. **Home Assistant**: Commands to change thermostat state (only if changed)
2. **Store Update**: Persists new state to SSOT
3. **Learning**: Feeds overshoot tracker
4. **MQTT**: Publishes state for external monitoring

### 8. Overshoot Tracker
**Type**: Function  
**Purpose**: Adaptive learning algorithm  
**Algorithm**:
1. Records temperature when heating stops
2. Tracks peak temperature after stop
3. Calculates overshoot (peak - stop_value)
4. Updates learned offset with EMA: `new = (old × 0.9) + (overshoot × 0.1)`
5. Caps overshoot at 3.0°C to ignore anomalies

### 9. Set HA
**Type**: api-call-service  
**Purpose**: Executes heating commands on thermostats  
**Actions**:
- `climate.set_temperature`: Heat mode with temp=30°C
- `climate.set_hvac_mode`: Off mode

### 10. Tick
**Type**: Inject  
**Purpose**: Triggers polling cycle every 5 minutes  
**Interval**: 300 seconds

### 11. Event Nodes (Window State, Heating State)
**Type**: server-state-changed  
**Purpose**: Real-time event handling for immediate response  
**Monitored Events**:
- Window contact changes
- Manual thermostat adjustments

### 12. Event Messenger
**Type**: Function  
**Purpose**: Processes real-time events and updates store  
**Handles**:
- Window open/close with grace period logic
- Manual override detection
- Immediate state updates

## 🔧 How It Works

### Startup Sequence

1. **Initialization**: Config & Init injects configuration → Store API creates initial state
2. **Lookup Table**: Store API builds entity-to-room mapping
3. **First Tick**: Tick node triggers first sensor poll after 5 minutes

### Normal Operation Cycle (Every 5 Minutes)

```
Tick → Store API (TICK) → Message Dispatcher → Poll Nodes
  ↓
Smart Normalizer → Heating Controller → Output Dispatcher
  ↓                                            ↓
Store Update                              Home Assistant Commands
  ↓                                            ↓
Overshoot Tracker                         MQTT Publish
```

### Event-Driven Updates

```
Window Opens → Event Messenger → Store API (UPDATE_ROOM_STATE)
    ↓
Triggers new controller evaluation → Heating turns off after grace period
```

### Humidex Calculation

When external sensors are available, the system calculates thermal comfort using the Humidex formula:

```javascript
dewPoint = temp - ((100 - humidity) / 5)
e = 6.112 × 10^((7.5 × dewPoint) / (237.7 + dewPoint))
humidex = temp + 0.5555 × (e - 10)
```

This provides a more accurate measure of perceived temperature than simple thermostats.

### Adaptive Learning Example

```
Target: 21°C, Hysteresis: 1°C

Cycle 1:
- Heat stops at 22°C (target + hysteresis)
- Temperature peaks at 23.5°C
- Overshoot: 1.5°C
- Learned offset: 0.15°C (1.5 × 0.1)

Cycle 2:
- Heat stops at 20.85°C (21 - 0.15)
- Temperature peaks at 22.0°C
- Overshoot: 1.15°C
- Learned offset: 0.25°C ((0.15 × 0.9) + (1.15 × 0.1))

Over time, the system converges to optimal stop point.
```

## 🤝 Contributing

We welcome contributions! This project follows a strict architectural pattern that should be preserved:

### Architectural Guidelines for Contributors

1. **Respect the SSOT**: All state changes MUST go through the Store API node
2. **Use Action-Based Updates**: Define clear action types for state modifications
3. **Maintain Immutability**: Clone state objects before modifying
4. **Single Responsibility**: Each node should have one clear purpose
5. **Avoid Direct State Access**: Use the lookup table for entity-to-room mapping

### Contribution Areas

We're particularly interested in:

- 🐛 **Bug Fixes**: Found an edge case? Submit a fix!
- 📊 **Enhanced Learning**: Better algorithms for adaptive behavior
- 🎨 **Dashboard Integrations**: Pre-built Lovelace cards or Grafana dashboards
- 🌍 **Internationalization**: Multi-language support
- 📱 **Notifications**: Integration with notification services
- 🔋 **Energy Tracking**: Cost calculation and energy usage statistics
- 🏠 **Multi-Zone Optimization**: Smart zone coordination
- 📖 **Documentation**: Clarifications, examples, troubleshooting guides

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the architectural guidelines above
4. Test your changes thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request with:
   - Clear description of changes
   - Explanation of how it preserves the SSOT pattern
   - Test results or screenshots

### Code Style

- Use clear, descriptive variable names
- Comment complex logic
- Keep functions focused and concise
- Follow existing formatting patterns

## 🐛 Troubleshooting

### Common Issues

**Heating doesn't respond**
- Check Store API status indicator (should be green)
- Use "Dump" inject to verify store contents
- Verify entity IDs match Home Assistant

**Temperature oscillates**
- Increase `humidex_hysteresis` value
- Check if adaptive learning needs more cycles
- Verify sensor placement (away from heat sources)

**Manual overrides ignored**
- Check if deviation is > hysteresis + 0.5
- Verify thermostat reports temperature changes
- Review Event Messenger debug output

**Window grace period too short/long**
- Adjust `WINDOW_GRACE_MS` in Heating Controller (default: 120000ms = 2 minutes)

## 📄 License

This project is open source and available for personal and commercial use. Please attribute the original authors when sharing or modifying.

---

**Built with ❤️ for the Home Assistant community**

*Star this repo if you find it useful! Pull requests welcome!*

