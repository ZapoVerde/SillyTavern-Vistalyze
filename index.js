/**
 * @file data/default-user/extensions/localyze/index.js
 * @stamp {"utc":"2026-04-01T18:00:00.000Z"}
 * @version 1.0.37
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * SillyTavern Location Engine (Localyze) — extension entry point and session
 * orchestrator. This module coordinates the lifecycle of the "Falling Water"
 * detection pipeline, UI injection, and state management.
 *
 * This version adopts the CNZ Async Initialization Pattern to prevent settings
 * data loss. It ensures the SillyTavern environment and extension_settings 
 * object are fully settled before attempting to bootstrap the location library.
 *
 * @core-principles
 * 1. ASYNC INIT: initialization is gated behind an async init() call to prevent
 *    race conditions with the ST settings loader.
 * 2. EVENT ROUTING: index.js performs no business logic; it routes host events 
 *    (MESSAGE_RECEIVED, CHAT_CHANGED) to the appropriate logic modules.
 * 3. STAGED STATE: Supports the transition toward a unified "Workshop" modal 
 *    by centralizing the boot and reset sequences.
 *
 * @api-declaration
 * handleMessageReceived(messageId) — routes new AI messages to the pipeline.
 * handleChatChanged()              — resets state and reboots on chat switch.
 * init()                           — the primary async initialization sequence.
 *
 * @contract
 *   assertions:
 *     purity: Event Orchestration
 *     state_ownership: [none]
 *     external_io: [eventSource (subscribe), UI Injections, Bootstrapper]
 */

import { eventSource, event_types } from '../../../../script.js';
import { resetState } from './state.js';
import { initSettings } from './settings/data.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline.js';
import { handleEditLocation, handleManualDescriber } from './logic/maintenance.js';
import { injectToolbar } from './ui/toolbar.js';
import { injectSettingsPanel } from './settings/panel.js';

/**
 * Pipeline Dispatcher.
 * Triggered whenever a new AI message is received.
 * @param {number} messageId 
 */
function handleMessageReceived(messageId) {
    runPipeline(messageId).catch(err => {
        console.error('[Localyze] Pipeline execution failed:', err);
    });
}

/**
 * Session Lifecycle Manager.
 * Resets runtime state and initiates the boot sequence (DNA reconstruction)
 * whenever the active chat changes.
 */
function handleChatChanged() {
    console.debug('[Localyze] Chat changed. Resetting session state...');
    resetState();
    runBoot().catch(err => {
        console.error('[Localyze] Bootstrapper failed during chat change:', err);
    });
}

/**
 * Extension Entry Point.
 * Orchestrates the startup sequence. Using an async function here ensures
 * that we can await critical data readiness if necessary, though primarily
 * it provides a clean, sequential initialization block.
 */
async function init() {
    console.log('[Localyze] Initialization sequence started...');

    try {
        // 1. Data Layer - Bootstrap settings and handle potential migrations.
        // This must run before UI injection.
        initSettings();
        console.debug('[Localyze] Settings initialized.');

        // 2. UI Layer - Inject persistent elements into the ST DOM.
        // handleEditLocation and handleManualDescriber are passed as delegates
        // for the toolbar and picker actions.
        injectToolbar(handleEditLocation, handleManualDescriber);
        injectSettingsPanel();
        console.debug('[Localyze] UI elements injected.');

        // 3. Host Events - Bind core SillyTavern lifecycle events.
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        console.debug('[Localyze] Host event listeners registered.');

        // 4. Initial Boot - Perform the first reconstruction for the active chat.
        await runBoot();
        console.log('[Localyze] Initial boot sequence complete. Extension ready.');

    } catch (err) {
        console.error('[Localyze] CRITICAL FAILURE during initialization:', err);
    }
}

// ─── Execution ───────────────────────────────────────────────────────────────

// Trigger the initialization sequence. 
// No logic should exist outside this call to maintain environment safety.
init().catch(err => {
    console.error('[Localyze] Top-level initialization rejection:', err);
});