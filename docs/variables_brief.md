


Here is the architectural blueprint for implementing the **Atmospheric Variants (World State)** system. 

To keep the system robust, we will use a **Slugified Shorthand** for the filenames (e.g., `localyze_{sessionId}_{key}_morning_rain_tense.png`) rather than an opaque hash. This makes debugging, orphan review, and user management infinitely easier. The first generation for any new location will always be forced to a "Base" state (neutral lighting, clear weather).

Here is the file-by-file breakdown of the required logic changes, with zero code.

### 1. `defaults.js` (Constants)
*   **Atmosphere Lists:** Define three default arrays of canonical keywords: `TIME_OF_DAY` (e.g., Morning, Noon, Evening, Night), `WEATHER` (e.g., Clear, Cloudy, Rain, Storm, Snow), and `MOOD` (e.g., Neutral, Cheerful, Gloomy, Tense, Romantic).
*   **Edit Prompt Template:** Add a new default template specifically for the Pollinations Edit endpoint (e.g., *"Modify this scene to be {{time}}, with {{weather}} weather, evoking a {{mood}} atmosphere"*).
*   **Update Boolean Prompt:** Modify the fast-gate prompt to ask: *"Has the characters' physical location OR the time/weather/atmosphere changed?"*

### 2. `settings/data.js` (Settings State)
*   **Profile Binding:** Add the three keyword arrays (Time, Weather, Mood) and the new Edit Prompt Template to the `PROFILE_DEFAULTS`. 
*   *Why tied to profiles?* A sci-fi roleplay might need "Smog" and "Neon-lit", while a fantasy roleplay needs "Arcane Storm" and "Torchlit". Tying keywords to the profile gives the user perfect thematic control.

### 3. `settings/panel.js` (Settings UI)
*   **Keyword Editors:** Add three new input areas (comma-separated lists) to the profile settings tab, allowing the user to view and edit the allowed keywords for Time, Weather, and Mood.
*   **Edit Prompt Editor:** Add a "Edit Image Prompt" configuration row alongside the existing generation prompt.

### 4. `detector.js` (LLM Calls)
*   **Upgraded Classifier:** The Classifier prompt must be updated. Instead of just returning a location `key`, it must be fed the profile's allowed keyword lists. It will now extract and return a JSON object containing the matched `key`, plus the closest matching `time`, `weather`, and `mood`.

### 5. `state.js` & `reconstruction.js` (Runtime Data)
*   **State:** Add `currentAtmosphere` to track the active time, weather, and mood.
*   **Reconstruction:** Update the pure function so that when it reads a `scene` transition record from the chat DNA, it extracts both the location key *and* the atmosphere variables, rebuilding the exact World State upon page reload.

### 6. `io/dnaWriter.js` (Chat Writers)
*   **Expanded Scene Record:** Update the transition writer so that `time`, `weather`, and `mood` are saved into the `message.extra.localyze` JSON payload permanently.

### 7. `imageCache.js` (Image IO & API Calls)
*   **Variant Generator Function:** Create a new function specifically for the `/v1/images/edits` endpoint.
*   **Fetch Base:** The logic must first fetch the Base image (`localyze_{sessionId}_{key}_base.png`) directly from SillyTavern's local server.
*   **Multipart Upload:** It will construct a `FormData` payload containing the local Base image blob, the injected Edit Prompt, and the user's API key.
*   **Metadata Injection:** Before uploading the Pollinations result back to SillyTavern, we will write the atmosphere JSON directly into a `tEXt` chunk in the PNG binary.

### 8. `logic/pipeline.js` (The Orchestrator)
*   **The "Base First" Rule:** If the LLM detects a completely new location, the Describer is forced to describe it in a "neutral/base" state. The system generates the Base image first. 
*   **The Variant Branch:** If the LLM detects an atmospheric shift (or if a new location was just generated), the pipeline checks if the variant file (e.g., `..._night_rain_gloomy.png`) exists in the cache.
*   **Fallback:** If the variant exists, it applies it. If not, it triggers the `generateVariant` logic. If the Pollinations Edit API fails (e.g., missing API key), it gracefully falls back to displaying the Base image rather than leaving a blank screen.

### 9. `ui/editModal.js` (Location Editor)
*   **World State Controls:** Inside the modal where users edit the location's name and description, add three dropdowns for Time, Weather, and Mood (populated from the profile settings).
*   **Preview Variant:** Allow the user to preview not just the Base image, but test what the Atmospheric Variant will look like using the Edit API right there in the modal.

### 10. `ui/pickerModal.js` & `ui/toolbar.js` (Manual Override)
*   **Picker:** When a user manually selects a room from the list, provide dropdowns at the bottom of the modal to let them manually force the Time, Weather, and Mood of the room before clicking "Apply".
*   **Toolbar:** Update the Localyze extensions button to display tiny text or icons (e.g., "Tavern | Night | Rain") so the user can see the active World State at a glance.

---

### Potential Issues to Watch Out For:
1.  **Prompt Bleed:** If the Describer inherently writes "A dark, rainy tavern" for the Base description, the Pollinations Edit endpoint will struggle to turn it into a "Sunny Morning" variant later. We have to instruct the Describer LLM very firmly to describe the architecture *neutrally* and leave the lighting/weather out of the base description.
2.  **API Key Requirement:** Because the Edit endpoint is strictly authenticated, users without a Pollinations API key in their SillyTavern vault will only ever see the Base images. We need to handle this gracefully in the UI so they know why weather isn't changing.