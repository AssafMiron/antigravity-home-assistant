---
name: ha-notifications
description: >-
  Configure notification channels (Telegram, Mobile App, Persistent Notifications),
  send instant alerts, or build actionable push notifications with minimal token usage.
  Activate this skill when the user asks to send a Telegram message or setup notification alerts.
---

# Home Assistant Notifications Skill (Telegram & Mobile App)

This skill provides ready-to-use patterns for sending messages and configuring notification integrations (Telegram Bot, Mobile App Companion) directly.

## Golden Rules
1. **Never guess notification service targets**: Check available notify services with `ha-api services notify`.
2. **Use pre-packaged action recipes**: Do not hallucinate Telegram payload structures.

---

## 1. Direct Message Sending (Single-Turn CLI Test)

### Send Telegram Message
```bash
# Basic Telegram message:
ha-api call notify.telegram '{"message": "Hello from Home Assistant!", "title": "HA Alert"}'

# Telegram message to a specific chat_id:
ha-api call notify.telegram '{"message": "Alert: Front door opened!", "data": {"chat_id": 123456789}}'
```

### Send Mobile App Push Notification
```bash
# Push to default companion app:
ha-api call notify.notify '{"message": "Garage door has been open for 15 minutes", "title": "Security Alert"}'
```

---

## 2. Setting Up Telegram Integration in YAML
When setting up Telegram for the first time, add this to `/homeassistant/configuration.yaml`:

```yaml
telegram_bot:
  - platform: polling
    api_key: !secret telegram_bot_token
    allowed_chat_ids:
      - !secret telegram_chat_id

notify:
  - name: telegram
    platform: telegram
    chat_id: !secret telegram_chat_id
```

Add the tokens securely in `/homeassistant/secrets.yaml`:
```yaml
telegram_bot_token: "YOUR_TELEGRAM_BOT_API_KEY"
telegram_chat_id: 123456789
```

---

## 3. Automation Notification Recipes

### Recipe A: Motion/Door Alert via Telegram
```yaml
- id: "notify_door_opened_telegram"
  alias: "Notify Door Opened (Telegram)"
  description: "Sends Telegram alert when front door opens while away"
  mode: single
  triggers:
    - trigger: state
      entity_id: binary_sensor.front_door
      from: "off"
      to: "on"
  conditions:
    - condition: state
      entity_id: zone.home
      state: "0"
  actions:
    - action: notify.telegram
      data:
        title: "🚨 Security Alert"
        message: "Front door was opened at {{ now().strftime('%H:%M:%S') }}!"
```

### Recipe B: Actionable Push Notification with Action Buttons
```yaml
- id: "notify_garage_open_actionable"
  alias: "Notify Garage Open (Actionable)"
  description: "Asks user if they want to close the garage door"
  mode: single
  triggers:
    - trigger: state
      entity_id: cover.garage_door
      to: "open"
      for:
        minutes: 10
  actions:
    - action: notify.notify
      data:
        title: "Garage Door Still Open"
        message: "Garage door has been open for 10 minutes. Close it?"
        data:
          actions:
            - action: "CLOSE_GARAGE"
              title: "Close Door"
            - action: "IGNORE"
              title: "Leave Open"
```

### Recipe C: Telegram Photo Snapshot from Camera
```yaml
actions:
  - action: notify.telegram
    data:
      title: "📸 Front Porch Motion"
      message: "Motion detected on front porch"
      data:
        photo:
          - url: "http://127.0.0.1:8123/api/camera_proxy/camera.front_porch"
            caption: "Front Porch Snapshot"
```

