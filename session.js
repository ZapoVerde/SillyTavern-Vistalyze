/**
 * @file session.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.2.0
 * @architectural-role Session Identity
 * @description
 * Manages the per-chat sessionId and initializes extension settings using 
 * the profile-aware data layer.
 * 
 * Version 1.2.0 Updates:
 * - Delegated settings initialization and migration to settings/data.js.
 * - Switched to getMetaSettings() for session registration in knownSessions.
 * - Removed legacy default constants and redundant schema logic.
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

function generateSessionId() {
    return Math.random().toString(36).slice(2, 10)
}

/**
 * Initializes the current chat session.
 * Generates a sessionId if missing and registers it for orphan detection.
 */
export function initSession() {
    // 1. Initialize the profile-based settings structure (and run migration if needed)
    initSettings()

    // 2. Handle sessionId generation/persistence
    if (!chat_metadata.localyze?.sessionId) {
        const sessionId = generateSessionId()
        chat_metadata.localyze = { sessionId }
        saveMetadataDebounced()
    }

    state.sessionId = chat_metadata.localyze.sessionId

    // 3. Register the session in the global (meta) knownSessions registry
    // This uses the root meta-settings object to ensure it is shared across profiles.
    const root = getMetaSettings()
    if (!root.knownSessions.includes(state.sessionId)) {
        root.knownSessions.push(state.sessionId)
        saveSettingsDebounced()
    }
}