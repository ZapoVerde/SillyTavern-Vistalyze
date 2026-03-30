/**
 * @file data/default-user/extensions/localyze/index.js
 * @stamp {"utc":"2026-04-01T14:20:00.000Z"}
 * @version 1.0.28
 * @architectural-role Entry Point / Event Router
 * @description
 * The primary entry point for the Localyze extension. Responsible for 
 * binding host application events and initializing UI components.
 * 
 * Updates:
 * - Relocated handleManualDescriber routing from settings panel to toolbar.
 * - Updated UI injection signatures to reflect deconstructed architecture.
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
import { handleEditLocation, handleManualDescriber } from './logic/maintenance.js';
import { injectToolbar } from './ui/toolbar.js';
import { injectSettingsPanel } from './settings/panel.js';

/**
 * Reacts to new AI messages by triggering the detection pipeline.
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
 * Ensure settings structure is initialized immediately to prevent
 * race conditions in UI population.
 */
initSettings();

/**
 * Injects UI elements.
 * handleEditLocation: used for the pencil icon in Picker.
 * handleManualDescriber: used for the "Force Detect" button in Picker.
 */
injectToolbar(handleEditLocation, handleManualDescriber);
injectSettingsPanel();

/**
 * Bind core SillyTavern events.
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