/**
 * @file data/default-user/extensions/localyze/session.js
 * @stamp {"utc":"2026-04-03T15:20:00.000Z"}
 * @architectural-role Session Identity
 * @description
 * Manages the per-chat sessionId and initializes extension settings.
 * 
 * @updates
 * - Migration: Replaced direct mutation of state.sessionId with setSessionId().
 * - Standardized access to meta settings via getMetaSettings().
 *
 * @api-declaration
 * initSession() — Idempotent; reads or generates sessionId, registers it.
 *
 * @contract
 *   assertions:
 *     purity: Stateful/IO
 *     state_ownership: [state.sessionId (via setter)]
 *     external_io: [chat_metadata.localyze (read/write),
 *       getMetaSettings().knownSessions (write),
 *       saveMetadataDebounced(), saveSettingsDebounced()]
 */

import { chat_metadata, saveSettingsDebounced } from '../../../../script.js'
import { saveMetadataDebounced } from '../../../extensions.js'
import { state, setSessionId } from './state.js'
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
    // 1. Initialize settings structure
    initSettings()

    // 2. Handle sessionId generation/persistence
    // The sessionId is stored in chat_metadata (the specific .jsonl file) 
    if (!chat_metadata.localyze) {
        chat_metadata.localyze = {};
    }

    if (!chat_metadata.localyze.sessionId) {
        const sessionId = generateSessionId();
        console.log(`[Localyze:Session] New chat detected. Assigning SessionID: ${sessionId}`);
        chat_metadata.localyze.sessionId = sessionId;
        saveMetadataDebounced();
    }

    // Sync runtime state using the Setter API (Stateful Owner Principle)
    setSessionId(chat_metadata.localyze.sessionId);

    // 3. Register the session in the global (meta) knownSessions registry
    const root = getMetaSettings();
    if (!root.knownSessions.includes(state.sessionId)) {
        console.debug(`[Localyze:Session] Registering session ${state.sessionId} in knownSessions.`);
        
        // Update the array and persist via the meta setting route
        const updatedSessions = [...root.knownSessions, state.sessionId];
        root.knownSessions = updatedSessions;
        
        saveSettingsDebounced();
    }
}