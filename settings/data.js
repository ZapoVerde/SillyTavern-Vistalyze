/**
 * @file data/default-user/extensions/localyze/settings/data.js
 * @stamp {"utc":"2026-04-01T21:00:00.000Z"}
 * @version 1.2.2
 * @architectural-role Stateful Owner (Settings)
 * @description
 * Manages the Localyze settings lifecycle. Implements a profile-based system 
 * (profiles, currentProfileName, activeState).
 * 
 * Version 1.2.2 Updates:
 * - Added CRITICAL saveSettingsDebounced() call in initSettings to "lock in"
 *   profile creation/migration and prevent data loss on reload.
 *
 * @api-declaration
 * getSettings()     — returns the activeState object for the current profile.
 * getMetaSettings() — returns the root extension settings object (global keys).
 * initSettings()    — initializes the structure and handles migration.
 *
 * @contract
 *   assertions:
 *     purity: mutates
 *     state_ownership: [extension_settings.localyze]
 *     external_io: [saveSettingsDebounced]
 */

import { extension_settings, saveSettingsDebounced } from '../../../../extensions.js';
import {
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_BOOLEAN_HISTORY,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_CLASSIFIER_HISTORY,
    DEFAULT_DESCRIBER_PROMPT,
    DEFAULT_DESCRIBER_HISTORY,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_DEV_MODE,
} from '../defaults.js';

const EXT_NAME = 'localyze';

export const PROFILE_DEFAULTS = Object.freeze({
    booleanPrompt:        DEFAULT_BOOLEAN_PROMPT,
    booleanProfileId:     null,
    booleanHistory:       DEFAULT_BOOLEAN_HISTORY,
    classifierPrompt:     DEFAULT_CLASSIFIER_PROMPT,
    classifierProfileId:  null,
    classifierHistory:    DEFAULT_CLASSIFIER_HISTORY,
    describerPrompt:      DEFAULT_DESCRIBER_PROMPT,
    describerProfileId:   null,
    describerHistory:     DEFAULT_DESCRIBER_HISTORY,
    imageModel:          DEFAULT_IMAGE_MODEL,
    imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    devMode:             DEFAULT_DEV_MODE,
});

export function getSettings() {
    return extension_settings[EXT_NAME].activeState;
}

export function getMetaSettings() {
    return extension_settings[EXT_NAME];
}

export function initSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    const root = extension_settings[EXT_NAME];

    if (!root.profiles) {
        console.log('[Localyze] Creating fresh profile-based settings structure...');

        const legacyConfig = {};
        for (const key of Object.keys(PROFILE_DEFAULTS)) {
            if (Object.prototype.hasOwnProperty.call(root, key)) {
                legacyConfig[key] = root[key];
                delete root[key];
            }
        }

        const defaultProfile = Object.assign({}, PROFILE_DEFAULTS, legacyConfig);

        root.profiles = {
            'Default': defaultProfile,
        };
        root.currentProfileName = 'Default';
        root.activeState = structuredClone(defaultProfile);

        // PERSISTENCE LOCK: Immediately save the newly created structure to the server.
        // This prevents the "Fresh Install" state from being re-triggered on next reload.
        saveSettingsDebounced(); 
    } else {
        root.activeState = Object.assign({}, PROFILE_DEFAULTS, root.activeState);
    }

    if (!Array.isArray(root.knownSessions)) {
        root.knownSessions = [];
    }
    if (!root.auditCache) {
        root.auditCache = { suspects: [], lastAudit: null, orphans: [] };
    }

    // Security Cleanup
    delete root.pollinationsKey;
    delete root.pollinationsSecretKey;
    delete root.localyze_pollinations_key;
}