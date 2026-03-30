/**
 * @file data/default-user/extensions/localyze/session.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.1.0
 * @architectural-role Session Identity
 * @description
 * Manages the per-chat sessionId and initializes extension settings.
 * 
 * Version 1.1.0 Updates:
 * - Removed pollinationsKey from extension_settings (migrated to Secrets).
 * - Hardened ensureSettings to prevent accidental data loss during boot.
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
    DEFAULT_BOOLEAN_HISTORY,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_CLASSIFIER_HISTORY,
    DEFAULT_DESCRIBER_PROMPT,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_DEV_MODE,
} from './defaults.js'

/**
 * Ensures the extension settings object exists and contains all required keys.
 * Note: Sensitive API keys are no longer stored here.
 */
function ensureSettings() {
    if (!extension_settings.localyze) {
        extension_settings.localyze = {
            knownSessions: [],
            auditCache: {
                suspects: [],
                lastAudit: null,
                orphans: [],
            },
            booleanPrompt:        DEFAULT_BOOLEAN_PROMPT,
            booleanProfileId:     null,
            booleanHistory:       DEFAULT_BOOLEAN_HISTORY,
            classifierPrompt:     DEFAULT_CLASSIFIER_PROMPT,
            classifierProfileId:  null,
            classifierHistory:    DEFAULT_CLASSIFIER_HISTORY,
            describerPrompt:      DEFAULT_DESCRIBER_PROMPT,
            describerProfileId:   null,
            imageModel:          DEFAULT_IMAGE_MODEL,
            imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
            devMode:             DEFAULT_DEV_MODE,
        }
        return
    }

    const s = extension_settings.localyze
    
    // Backfill any missing structural keys
    if (!Array.isArray(s.knownSessions)) s.knownSessions = []
    if (!s.auditCache) s.auditCache = { suspects: [], lastAudit: null, orphans: [] }
    
    // Backfill prompts and configs
    if (s.booleanPrompt        === undefined) s.booleanPrompt        = DEFAULT_BOOLEAN_PROMPT
    if (s.booleanProfileId     === undefined) s.booleanProfileId     = null
    if (s.booleanHistory       === undefined) s.booleanHistory       = DEFAULT_BOOLEAN_HISTORY
    if (s.classifierPrompt     === undefined) s.classifierPrompt     = DEFAULT_CLASSIFIER_PROMPT
    if (s.classifierProfileId  === undefined) s.classifierProfileId  = null
    if (s.classifierHistory    === undefined) s.classifierHistory    = DEFAULT_CLASSIFIER_HISTORY
    if (s.describerPrompt      === undefined) s.describerPrompt      = DEFAULT_DESCRIBER_PROMPT
    if (s.describerProfileId   === undefined) s.describerProfileId   = null
    if (s.imageModel          === undefined) s.imageModel          = DEFAULT_IMAGE_MODEL
    if (s.imagePromptTemplate === undefined) s.imagePromptTemplate = DEFAULT_IMAGE_PROMPT_TEMPLATE
    if (s.devMode             === undefined) s.devMode             = DEFAULT_DEV_MODE

    // Clean up legacy keys from previous versions to ensure purity
    delete s.pollinationsKey
    delete s.pollinationsSecretKey
}

function generateSessionId() {
    return Math.random().toString(36).slice(2, 10)
}

/**
 * Initializes the current chat session.
 * Generates a sessionId if missing and registers it for orphan detection.
 */
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