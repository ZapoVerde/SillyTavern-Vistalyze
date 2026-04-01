


Here is the updated plan incorporating both the "Describer History" setting and the "Manual Invoke" button. This plan strictly adheres to the LLZ architecture, ensuring UI, logic, and pure text manipulation remain separated.

### 1. Data Layer & Settings (`defaults.js` & `settings/data.js`)
*   **Action**: Add a `DEFAULT_DESCRIBER_HISTORY` constant (defaulting to 3) in `defaults.js`.
*   **Action**: Add the `describerHistory` key to `PROFILE_DEFAULTS` inside `settings/data.js`.
*   **Why**: This registers the new setting in the profile schema so it saves and loads automatically.

### 2. Pure Logic (`utils/history.js`)
*   **Action**: Create a pure function `buildDescriberContext(chat, messageId, numPairs)`.
*   **Responsibility**: Unlike the existing boolean/classifier history (which splits the prompt into "Previous turns" and "Latest message"), the describer needs a continuous transcript ending with the current message. This function will calculate the start index based on `numPairs`, slice the `chat` array up to and including the `messageId`, and format it into a clean `Name: Message` block.

### 3. Update the Automated Pipeline (`logic/pipeline.js`)
*   **Action**: In `handleUnknownLocation()`, replace the hardcoded `Math.max(0, chat.length - 6)` logic.
*   **Action**: Read `s.describerHistory` from settings and pass it, along with the chat and `messageId`, into the new `buildDescriberContext()`.

### 4. Implement Manual Override Logic (`logic/maintenance.js`)
*   **Action**: Create and export `handleManualDescriber()`.
*   **Responsibility**: Act as the orchestrator for the manual button.
*   **Logic Flow**:
    1. Check if the chat is empty. If so, yield. Get the last message ID.
    2. Read `describerHistory`, `describerPrompt`, and `describerProfileId` from settings.
    3. Call `buildDescriberContext()`.
    4. Call `detectDescriber()` (IO Executor). If it fails/returns null, toast a warning and exit.
    5. Open `addModal` for user review.
    6. If approved, execute the **Two-Write Pattern**: write `location_def`, write `scene` transition, trigger async `imageCache.generate()`, and update `state.js`/background on completion.

### 5. Update the UI (`settings/panel.js`)
*   **Action**: Modify the `buildCallRow` for Step 3 to pass the `'describerHistory'` string. Because of how your HTML builder is structured, passing this string will automatically generate the number input and wire it to state.
*   **Action**: Add a new button (e.g., `<button id="lz-manual-detect">Force Detect Location</button>`) inside or directly below the Describer row.
*   **Action**: Change `injectSettingsPanel(onManualDetect)` to accept a callback. Bind the new button to it, adding UI feedback (e.g., changing text to "Detecting...", disabling while the promise resolves) to prevent spam clicks.

### 6. Orchestration Wiring (`index.js`)
*   **Action**: Import `handleManualDescriber` from `logic/maintenance.js`.
*   **Action**: Pass `handleManualDescriber` to `injectSettingsPanel()` during the initialization block. 

Does this structure look good to proceed?