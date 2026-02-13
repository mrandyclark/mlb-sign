# Requirements – MLB LED Sign

This document defines the functional and non-functional requirements for the MLB LED Sign project. It is intended to guide implementation and serve as a reference for future revisions or additional units.

---

## Project Scope

The system is a Raspberry Pi–driven LED matrix sign that displays MLB standings. The initial implementation targets a single LED matrix panel and a desk-scale prototype.

---

## Functional Requirements

### Data Ingestion

- The system shall retrieve MLB standings data from an external API.
- The data source shall provide, at minimum:
  - Team name
  - Division
  - Wins
  - Losses
  - Division rank or sortable fields to derive rank
- The system shall support refreshing data at least once per day.
- API errors or downtime shall not crash the system.

### Data Processing

- The system shall group teams by division.
- The system shall sort teams within each division by rank.
- The system shall format standings as:
  - Division rank
  - Team identifier (name or abbreviation)
  - Win–loss record

### Display Output

- The system shall render standings to a 64×32 RGB LED matrix.
- Text shall be rendered as white pixels on a black background.
- The display shall be readable from approximately 10–20 feet.
- The system shall support displaying:
  - A single division at a time, or
  - Rotating through multiple divisions
- Rotation timing shall be configurable.

### Display Behavior

- The system shall support a configurable brightness level.
- The system shall avoid sudden full-brightness changes on startup.
- The system shall continue displaying the most recent valid data if the API is unavailable.

### Scheduling

- The system shall support scheduled display on/off times.
- Outside scheduled hours, the display shall be blank or powered down.
- Scheduling shall be based on the system timezone.

### Wi-Fi Provisioning

- On first boot (or when no known Wi-Fi network is available), the system shall broadcast a local Wi-Fi hotspot.
- The hotspot shall serve a captive portal web page for entering Wi-Fi credentials.
- After credentials are submitted, the system shall connect to the configured network and disable the hotspot.
- The system shall store credentials persistently so they survive reboots.
- If the configured network becomes unavailable, the system shall re-enable the hotspot for reconfiguration.

---

## Non-Functional Requirements

### Reliability

- The system shall recover gracefully from power loss.
- The system shall start automatically on boot.
- The system shall not require manual intervention after initial setup.

### Performance

- Rendering must complete fast enough to avoid visible flicker.
- API requests shall not block display rendering.

### Maintainability

- Code shall be modular and readable.
- Configuration values (API endpoints, refresh intervals, brightness, schedule) shall not be hard-coded.
- The system shall be easy to update remotely via SSH.

### Portability

- The codebase shall run on Raspberry Pi Zero 2 W.
- The same codebase shall support multiple units with minimal configuration changes.

---

## Configuration Requirements

The system shall support configuration for:

- API endpoint and credentials (if required)
- Refresh interval
- Display brightness
- Rotation interval
- On/off schedule
- Timezone awareness

Configuration shall be externalized (config file or environment variables).

---

## Out of Scope (Initial Version)

- User input or buttons
- Touchscreen support
- Audio output
- Multi-panel LED walls
- Animations beyond simple transitions
- Bluetooth-based Wi-Fi provisioning (captive portal used instead)

---

## Future Enhancements (Not Required)

- Multiple sports support
- Playoff indicators
- Team logos or icons
- Web-based configuration UI
- Remote monitoring or alerts

### Display Types (Planned)

The API should return a `displayType` field to control what the sign renders. This makes the system extensible throughout the season.

| Display Type | Description |
|--------------|-------------|
| `leaderboard` | Division standings (current implementation) |
| `score` | Live game scoreboard (innings, score, outs, runners) |
| `daysUntil` | Countdown to Spring Training, Opening Day, playoffs, etc. |
| `offseason` | Off-season message or final standings |
| `allStar` | All-Star break info |

The API should also return a `refreshHintSeconds` value so the Pi knows how often to poll:
- `leaderboard` → 3600s (hourly)
- `score` → 30-60s (live game)
- `daysUntil` → 86400s (daily)

**Implementation notes:**
- Add `DisplayType` enum and payload interfaces to `types.ts`
- Add dispatcher/switch logic in `index.ts` based on `displayType`
- Add render methods to `Renderer` for each display type
- Handle unknown display types gracefully (fallback to leaderboard)

### Auto-Update on Boot (Planned)

The Pi should automatically pull the latest code from GitHub on startup to enable remote deployments without SSH access.

**Implementation notes:**
- Add a systemd service or startup script that runs before the main app
- Script: `cd /home/pi/mlb-sign && git pull && npm run build`
- Consider a daily cron job as backup for long-running instances
- Log update results for debugging

---

## Acceptance Criteria (V1)

- [ ] The LED matrix displays correct MLB standings for at least one division.
- [ ] Data updates automatically without manual intervention.
- [ ] The system runs unattended for multiple days.
- [ ] Power cycling does not require reconfiguration.
- [ ] Documentation is sufficient to reproduce the build.