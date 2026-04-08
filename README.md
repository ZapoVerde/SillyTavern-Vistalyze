# Localyze

A SillyTavern extension that automatically detects location changes in roleplay chat, maintains a per-chat location library, generates background images via the Pollinations API, and sets the ST background accordingly.

## Features

- **"Falling Water" Detection Pipeline:** Automatic location detection on every AI message (Boolean gate → Classifier → Describer) to minimize LLM costs.
- **The Location Workshop:** A unified 3-tab interface (Library, Architect, Explorer) for managing, editing, and discovering locations.
- **Targeted Discovery:** Guide the AI to create specific locations using manual keywords.
- **Per-Message Integration:** Interactive location badges injected onto every AI message for retroactive location tagging and quick editing.
- **Localyze Settings Profiles:** Save, load, and manage your specific prompt setups and extension configurations internally.
- **Parallax Backgrounds:** Optional device-tilt and mouse-responsive horizontal panning for wide background images.
- **Chat Log as Database:** Location definitions and scene transitions are stored in the chat log itself using a non-destructive array pattern — completely fork-safe and self-healing.
- **Background Image Generation:** Integration with Pollinations API for scene visualization. **(Note: A Pollinations API key is required)**.
- **Orphan Cleanup:** Safe, manual auditing and deletion of generated images no longer tied to active chats.

## Installation & Setup

1. Place the `localyze` folder in `SillyTavern/data/default-user/extensions/`
2. Enable the extension in ST's Extensions panel.
3. Open `SillyTavern/config.yaml` in your server folder and ensure `allowKeysExposure: true` is set (this allows extensions to securely read your API keys).
4. Restart your SillyTavern server and reload the page.

## How It Works

### The Location Workshop & Manual Tools
Clicking the **Localyze** button in the ST extensions toolbar opens the **Location Workshop**, which consists of three tabs:
1. **Library:** Browse known locations, apply them to the current scene, or jump to edit them.
2. **Architect:** Manually edit location names, logical definitions, and visual prompts. Features targeted AI regeneration for specific fields and 320x180 low-cost thumbnail previews.
3. **Explorer (Targeted Discovery):** Run the extraction AI manually against the recent chat context, optionally providing keywords (e.g., "A dark tavern") to guide the generation.

### Per-Message Badges
Every AI message features a small Location Pill in its action bar. 
- **Clicking the Pill** opens the **Location Picker**, allowing you to retroactively change the location of the scene at that specific point in the chat history.
- **Clicking the Edit Icon** opens the Architect tab directly for that specific location.

### Automatic Detection Pipeline
On every AI message, Localyze runs a cascading pipeline:
1. **Boolean (Gate):** Asks the LLM if the location has changed. If No, the pipeline stops (cheap, fast).
2. **Classifier:** Injects a dynamic Markov-graph of your historical movements. Asks the LLM which known location key matches the message.
3. **Describer:** If no known location matches, extracts the `name`, `definition`, and `imagePrompt` as JSON. An Add Modal lets you preview the visual prompt before committing the new location to your library.

### Chat Log as Database (Array Pattern)
Location definitions and scene transitions are stored directly in `message.extra.localyze` on the relevant chat messages. 
- We use an **Array Pattern**, allowing a single message to hold both a `location_def` (the dictionary definition) and a `scene` transition record simultaneously without overwriting data.
- **Self-healing:** If you reload, Localyze reconstructs the entire spatial history via a pure forward-pass over the chat log. No external JSON files to get corrupted or desynced.

### The Two-Write Pattern
When a location transition requires a new image:
1. **Write 1:** The scene record is written immediately with `image: null` (capturing narrative intent).
2. **Async Gen:** Generation starts in the background.
3. **Write 2:** The scene record is patched with the resulting filename.
If generation fails (or you close the browser), Localyze detects the `null` image on next boot and queues a silent background regeneration.

## Configuration

Open ST's Extensions panel and scroll to the **Localyze** section.

### Profiles
- **Localyze Profiles:** Save and switch between complete configurations of your custom prompts, histories, and model selections.
- **Connection Profiles:** Each LLM call (Boolean, Classifier, Describer, Discovery) has a dropdown to select a Connection Manager profile. Leave blank to use your active chat API.

### Prompt Editing & Variables
Click **Edit Prompt** next to any step to customize it. Available placeholders:

| Call | Available Variables |
| :--- | :--- |
| **Boolean** | `{{current_location}}`, `{{history}}`, `{{message}}` |
| **Classifier** | `{{current_location}}`, `{{key_list}}`, `{{filtered_list}}`, `{{history}}`, `{{message}}`, `{{spatial_transitions}}`, `{{spatial_discovery_count}}` |
| **Describer** | `{{context}}` |
| **Discovery** | `{{keywords}}`, `{{context}}` |
| **Image Template** | `{{image_prompt}}`, `{{name}}`, `{{description}}` |

### Image Generation & Vault
- **API Vault:** A Pollinations API key is **required** to generate backgrounds. Securely save your token to ST's encrypted secret vault via the input field in the Localyze settings panel.
- **Parallax Backgrounds:** Enable this at the top of the settings to allow horizontal panning on wide backgrounds (tracks mouse on desktop, requests device-tilt permission on mobile).

## Architecture Notes

Localyze is strictly structured using a Gatekeeper/Stateful Owner pattern.

```text
├── index.js          — Event orchestrator; entry point
├── state.js          — Stateful Owner: Single source of truth for runtime state
├── reconstruction.js — Pure function: Derives state purely from the chat log
├── logic/            — Narrative and UI logic controllers
│   ├── pipeline.js   — Auto-detection "Falling Water" orchestrator
│   ├── maintenance.js— Workshop and Discovery controller
│   ├── commit.js     — Applies two-write pattern for draft/scene finalization
│   └── bootstrapper.js- Initial DNA reconstruction and self-healing queue
├── io/
│   └── dnaWriter.js  — IO Executor: Writes Array-pattern data to chat objects
├── settings/         — Data management for profiles and configuration
├── ui/               — Visual components
│   ├── workshopModal.js — Main 3-tab Workshop UI orchestrator
│   ├── messageBadge.js  — Per-message DOM injector
│   ├── parallax.js      — High-performance rAF panning logic
│   └── ...
├── detector.js       — LLM parsing and API dispatch
├── imageCache.js     — Pollinations API IO
└── background.js     — Safely applies background images using lock mechanisms