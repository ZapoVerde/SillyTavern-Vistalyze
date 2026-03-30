/**
 * @file data/default-user/extensions/localyze/index.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.26
 * @architectural-role Entry Point / Event Router
 * @description
 * The primary entry point for the Localyze extension. This module is 
 * responsible for binding host application events to the internal 
 * orchestrators and initializing UI components.
 * 
 * Updates:
 * - Added explicit initSettings() call to guarantee data structure availability 
 *   before any UI injection or async booting begins.
 *
 * @api-declaration
 * Entry points (event-bound):
 *   handleMessageReceived(messageId) -> Pipeline Dispatcher
 *   handleChatChanged() -> Bootstrapper Dispatcher
 *
 * @contract
 *   assertions:
 *     purity: Event Routing / Orchestration
 *     state_ownership: [none]
 *     external_io: [eventSource (subscribe), UI Injections]
 */

import { eventSource, event_types } from '../../../../script.js';
import { resetState } from './state.js';
import { initSettings } from './settings/data.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline.js';
import { handleEditLocation } from './logic/maintenance.js';
import { injectToolbar } from './ui/toolbar.js';
import { injectSettingsPanel } from './settings/panel.js';

/**
 * Reacts to new AI messages by triggering the detection pipeline.
 * Errors are caught and logged here to prevent bubbling into the host's 
 * event emitter, but execution is fire-and-forget.
 * 
 * @param {number} messageId 
 */
function handleMessageReceived(messageId) {
    runPipeline(messageId).catch(err => {
        console.error('[Localyze] Pipeline error:', err);
    });
}

/**
 * Resets runtime state and initiates the boot sequence when the 
 * active chat session changes.
 */
function handleChatChanged() {
    resetState();
    runBoot().catch(err => {
        console.error('[Localyze] Boot error during chat change:', err);
    });
}

// ─── Initialization ──────────────────────────────────────────────────

console.debug('[Localyze] Initializing Extension...');

/**
 * Ensure settings structure is initialized immediately.
 * This prevents race conditions where UI elements attempt to read
 * state (like booleanHistory) before the data object is created.
 */
initSettings();

/**
 * Injects the UI elements into the SillyTavern interface.
 * The toolbar is injected with the maintenance callback to allow 
 * manual editing from the Location Picker.
 */
injectToolbar(handleEditLocation);
injectSettingsPanel();

/**
 * Bind core SillyTavern events to Localyze dispatchers.
 */
eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);

/**
 * Trigger an initial boot for the currently loaded chat.
 */
runBoot().catch(err => {
    console.error('[Localyze] Initial boot error:', err);
});

console.debug('[Localyze] Extension Loaded and Ready.');