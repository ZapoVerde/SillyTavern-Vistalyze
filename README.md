# Localyze

A SillyTavern extension that automatically detects location changes in roleplay chat, maintains a per-chat location library, generates background images via the Pollinations API, and sets the ST background accordingly.

## Features

- Automatic location detection on every AI message (boolean gate → classifier → describer)
- Per-chat location library stored in the chat log itself — fork-safe and self-healing
- Background image generation via Pollinations (free, no key required)
- Optional personal Pollinations token for higher rate limits
- Per-call LLM prompt editing and connection profile selection
- Background fade transitions
- Orphan image detection and cleanup

## Installation

1. Place the `localyze` folder in `SillyTavern/data/default-user/extensions/`
2. Enable the extension in ST's Extensions panel
3. Reload the page

Requires the **Connection Manager** extension for per-call connection profiles (optional — falls back to the active chat API if unavailable).

## How It Works

### Detection Pipeline

On every AI message, Localyze runs a three-step pipeline:

1. **Boolean** — asks the LLM whether the location has changed. If No, the pipeline stops (cheap fast gate).
2. **Classifier** — asks the LLM which known location key matches the message. If a known location is matched, the background is set and a scene record is written.
3. **Describer** — if no known location matches (or the library is empty), the LLM extracts `name`, `key`, `description`, and `imagePrompt` as JSON. A confirmation modal lets the user accept or dismiss the new location before it is added to the library.

### Chat Log as Database

Location definitions and scene transitions are stored directly in `message.extra.localyze` on the relevant chat messages — not in external files or settings. This means:

- **Fork-safe**: each chat branch carries its own complete history
- **Self-healing**: reconstruction is a pure forward pass over the chat log; no external state to get out of sync
- **Two record types**:
  - `location_def` — written when a new location is approved; contains `name`, `key`, `description`, `imagePrompt`
  - `scene` — written on each location transition; contains `location`, `image`, `bg_declined`

### Background Management

Backgrounds are stored in ST's backgrounds folder with the naming convention `localyze_{sessionId}_{key}.png`. On boot, Localyze:

1. Fetches the full background file list in a single request
2. Queues silent background regeneration for any missing files
3. Restores the last known background for the chat

A **session ID** (short UUID) is generated once per chat and stored in `chat_metadata`. It namespaces all generated files to the chat, enabling orphan detection across chats.

### Two-Write Pattern

When a location transition requires a new image to be generated, Localyze:

1. Writes the scene record immediately with `image: null` (so the transition is captured even if generation fails)
2. Starts generation asynchronously in the background
3. Patches the scene record with the filename when generation completes

## Configuration

Open ST's Extensions panel and scroll to the **Localyze** section.

### Connection Profiles

Each of the three LLM calls (Boolean, Classifier, Describer) has its own **Connection** dropdown. Select a connection profile from the Connection Manager to route that call to a specific API/model. Leave blank to use the chat's active API.

Use cheaper/faster models for Boolean and Classifier, and a more capable model for Describer.

### Prompt Editing

Each call also has an **Edit Prompt** button that opens a full-screen editor. Prompts use `{{placeholders}}`:

| Call       | Placeholders                          |
|------------|---------------------------------------|
| Boolean    | `{{current_location}}`, `{{message}}` |
| Classifier | `{{key_list}}`, `{{message}}`         |
| Describer  | `{{context}}`                         |

Click **Reset to Default** inside the editor to restore the built-in prompt.

### Pollinations Token

An optional personal Pollinations user token can be saved under the **Pollinations User Token** field. This token is stored in ST's encrypted secrets system and never written to extension settings. It unlocks higher rate limits on the Pollinations image API.

## Toolbar

A **Localyze** button in the extensions toolbar opens the **Location Picker** — a searchable list of all known locations for the current chat. Clicking a location manually applies it, triggering the same background-set pipeline as automatic detection.

An **Orphan Images** button runs detection for generated background files that are no longer associated with any known chat session. Orphaned files can be reviewed and deleted in bulk.

## Architecture Notes

```
index.js          — orchestrator; owns boot sequence and per-turn pipeline
state.js          — single runtime state object; only module that mutates it
session.js        — sessionId management and settings initialisation
reconstruction.js — pure function; derives state from chat log
detector.js       — three LLM calls; no state mutation
library.js        — writes location_def records to chat
imageCache.js     — Pollinations fetch and ST background upload
background.js     — sets/clears #bg1 with fade transition
orphanDetector.js — fast diff and full audit for orphaned files
settings/panel.js — settings UI injected into #extensions_settings
ui/toolbar.js     — toolbar button and orphan badge
ui/pickerModal.js — manual location picker
ui/addModal.js    — new location review/edit modal
ui/orphanModal.js — orphan file review and delete modal
defaults.js       — default prompts and constants
style.css         — fade transitions and modal styles
```

All LLM calls use `generateQuietPrompt` (or `ConnectionManagerRequestService.sendRequest` when a profile is selected) with `removeReasoning: true`. The extension has no network calls beyond the Pollinations image API and standard ST internal endpoints.
