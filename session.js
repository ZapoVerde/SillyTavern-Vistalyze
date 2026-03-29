/**
 * @file data/default-user/extensions/localyze/session.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Session Identity
 * @description
 * Manages the per-chat sessionId: reads it from chat_metadata.localyze,
 * generates one if absent, and registers it in extension_settings.localyze
 * .knownSessions for orphan detection. Called once per boot sequence.
 *
 * SessionId is a short random slug (8 chars) generated once per chat lifetime
 * and never regenerated. It namespaces generated background filenames so files
 * from different chats cannot collide, and ties each file back to its source
 * chat for orphan detection.
 *
 * @api-declaration
 * initSession() — idempotent; reads or generates sessionId, registers it
 *
 * @contract
 *   assertions:
 *     purity: stateful/IO
 *     state_ownership: [state.sessionId]
 *     external_io: [chat_metadata.localyze (read/write),
 *       extension_settings.localyze.knownSessions (write),
 *       saveMetadataDebounced(), saveSettingsDebounced()]
 */
import { chat_metadata, saveSettingsDebounced } from '../../../../script.js'
import { extension_settings, saveMetadataDebounced } from '../../../extensions.js'
import { state } from './state.js'
import {
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_DESCRIBER_PROMPT,
} from './defaults.js'

function ensureSettings() {
    if (!extension_settings.localyze) {
        extension_settings.localyze = {
            knownSessions: [],
            auditCache: {
                suspects: [],
                lastAudit: null,
                orphans: [],
            },
            booleanPrompt:       DEFAULT_BOOLEAN_PROMPT,
            booleanProfileId:    null,
            classifierPrompt:    DEFAULT_CLASSIFIER_PROMPT,
            classifierProfileId: null,
            describerPrompt:     DEFAULT_DESCRIBER_PROMPT,
            describerProfileId:  null,
        }
        return
    }
    // Backfill any missing keys added in later versions
    const s = extension_settings.localyze
    if (s.booleanPrompt    === undefined) s.booleanPrompt    = DEFAULT_BOOLEAN_PROMPT
    if (s.booleanProfileId === undefined) s.booleanProfileId = null
    if (s.classifierPrompt    === undefined) s.classifierPrompt    = DEFAULT_CLASSIFIER_PROMPT
    if (s.classifierProfileId === undefined) s.classifierProfileId = null
    if (s.describerPrompt    === undefined) s.describerPrompt    = DEFAULT_DESCRIBER_PROMPT
    if (s.describerProfileId === undefined) s.describerProfileId = null
}

function generateSessionId() {
    return Math.random().toString(36).slice(2, 10)
}

export function initSession() {
    ensureSettings()

    if (!chat_metadata.localyze?.sessionId) {
        const sessionId = generateSessionId()
        chat_metadata.localyze = { sessionId }
        saveMetadataDebounced()
    }

    state.sessionId = chat_metadata.localyze.sessionId

    if (!extension_settings.localyze.knownSessions.includes(state.sessionId)) {
        extension_settings.localyze.knownSessions.push(state.sessionId)
        saveSettingsDebounced()
    }
}
