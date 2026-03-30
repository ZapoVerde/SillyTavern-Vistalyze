/**
 * @file session.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.1.2
 * @architectural-role Session Identity
 * @description
 * Manages the per-chat sessionId and initializes extension settings.
 * 
 * Version 1.1.2 Updates:
 * - Removed all legacy key storage from extension_settings (migrated to ST Vault).
 * - Standardized Preamble and relative paths.
 * - Hardened ensureSettings to prevent data leakage in settings.json.
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
 * Note: Sensitive API keys are strictly forbidden here and moved to the Vault.
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

    // CRITICAL: Clean up legacy keys from settings.json to ensure security.
    // Keys now live exclusively in ST's encrypted secrets.json vault.
    delete s.pollinationsKey
    delete s.pollinationsSecretKey
    delete s.localyze_pollinations_key
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