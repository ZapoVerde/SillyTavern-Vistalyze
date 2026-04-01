/**
 * @file data/default-user/extensions/localyze/index.js
 * @stamp {"utc":"2026-04-02T17:00:00.000Z"}
 * @version 1.0.45
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * SillyTavern Location Engine (Localyze) — extension entry point.
 * 
 * @updates
 * - Removed initial runBoot() call if no chat is active to prevent "Abort" log.
 * - Confirmed zero i18n hooks to minimize translation overhead.
 * - Standardized event registration sequence.
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
import { getContext } from '../../../extensions.js';
import { resetState } from './state.js';
import { initSettings } from './settings/data.js';
import { runBoot } from './logic/bootstrapper.js';
import { runPipeline } from './logic/pipeline.js';
import { handleOpenLibrary, handleEditLocation, handleManualDescriber } from './logic/maintenance.js';
import { injectToolbar } from './ui/toolbar.js';
import { injectSettingsPanel } from './settings/panel.js';

/**
 * Pipeline Dispatcher.
 * Triggered whenever a new AI message is received.
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
    console.debug('[Localyze] Chat changed event detected.');
    resetState();
    runBoot().catch(err => {
        console.error('[Localyze] Bootstrapper failed during chat change:', err);
    });
}

/**
 * Extension Entry Point.
 * Orchestrates the startup sequence.
 * 
 * NOTE: i18n (Internationalization) is explicitly disabled/ignored to 
 * reduce overhead during development.
 */
async function init() {
    console.log('[Localyze] Extension initializing...');

    try {
        // 1. Data Layer - Bootstrap settings.
        initSettings();

        // 2. UI Layer - Inject persistent elements into the ST DOM.
        injectToolbar(handleOpenLibrary, handleEditLocation, handleManualDescriber);
        injectSettingsPanel();

        // 3. Host Events - Bind core SillyTavern lifecycle events.
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        console.debug('[Localyze] Listeners active.');

        // 4. Conditional Initial Boot
        // We only trigger runBoot if a chatId is already present (e.g. extension hot-reload).
        // On a fresh ST load, we wait for the CHAT_CHANGED event to trigger the engine.
        const context = getContext();
        if (context && context.chatId) {
            console.debug('[Localyze] Active chat detected on init. Running boot sequence...');
            await runBoot();
        } else {
            console.log('[Localyze] Standing by for chat selection.');
        }

    } catch (err) {
        console.error('[Localyze] CRITICAL FAILURE during initialization:', err);
    }
}

// ─── Execution ───────────────────────────────────────────────────────────────

init().catch(err => {
    console.error('[Localyze] Top-level initialization rejection:', err);
});