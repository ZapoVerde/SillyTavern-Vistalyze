/**
 * @file session.js
 * @stamp {"utc":"2026-04-02T17:30:00.000Z"}
 * @architectural-role Session Identity
 * @description
 * Manages the per-chat sessionId and initializes extension settings using 
 * the profile-aware data layer. This ensures every chat has a unique 
 * identifier for background file organization.
 * 
 * @updates:
 * - Delegated settings initialization and migration to settings/data.js.
 * - Switched to getMetaSettings() for session registration in knownSessions.
 * - Hardened chat_metadata access to prevent errors on empty metadata.
 *
 * @api-declaration
 * initSession() — idempotent; reads or generates sessionId, registers it.
 *
 * @contract
 *   assertions:
 *     purity: stateful/IO
 *     state_ownership: [state.sessionId]
 *     external_io: [chat_metadata.localyze (read/write),
 *       getMetaSettings().knownSessions (write),
 *       saveMetadataDebounced(), saveSettingsDebounced()]
 */

import { chat_metadata, saveSettingsDebounced } from '../../../../script.js'
import { saveMetadataDebounced } from '../../../extensions.js'
import { state } from './state.js'
import { initSettings, getMetaSettings } from './settings/data.js'

/**
 * Generates an 8-character random alphanumeric string for session identification.
 * @returns {string}
 */
function generateSessionId() {
    return Math.random().toString(36).slice(2, 10)
}

/**
 * Initializes the current chat session.
 * Generates a sessionId if missing and registers it for orphan detection.
 * This is called by the bootstrapper on every CHAT_CHANGED.
 */
export function initSession() {
    // 1. Initialize the profile-based settings structure
    // This handles migrations from old flat-key versions if necessary.
    initSettings()

    // 2. Handle sessionId generation/persistence
    // The sessionId is stored in chat_metadata (the specific .jsonl file) 
    // to ensure the link between a chat and its backgrounds survives renames.
    if (!chat_metadata.localyze) {
        chat_metadata.localyze = {};
    }

    if (!chat_metadata.localyze.sessionId) {
        const sessionId = generateSessionId();
        console.log(`[Localyze:Session] New chat detected. Assigning SessionID: ${sessionId}`);
        chat_metadata.localyze.sessionId = sessionId;
        saveMetadataDebounced();
    }

    // Sync runtime state
    state.sessionId = chat_metadata.localyze.sessionId;

    // 3. Register the session in the global (meta) knownSessions registry
    // This registry is used by the Orphan Detector to know which background 
    // files are still "owned" by active chats.
    const root = getMetaSettings();
    if (!root.knownSessions.includes(state.sessionId)) {
        console.debug(`[Localyze:Session] Registering session ${state.sessionId} in knownSessions.`);
        root.knownSessions.push(state.sessionId);
        saveSettingsDebounced();
    }
}