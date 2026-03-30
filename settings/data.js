/**
 * @file data/default-user/extensions/localyze/settings/data.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.2.0
 * @architectural-role Stateful Owner (Settings)
 * @description
 * Manages the Localyze settings lifecycle. Implements a profile-based system 
 * (profiles, currentProfileName, activeState) with a one-time migration 
 * path from legacy flat settings.
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
 *     external_io: [none]
 */

import { extension_settings } from '../../../extensions.js';
import {
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_BOOLEAN_HISTORY,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_CLASSIFIER_HISTORY,
    DEFAULT_DESCRIBER_PROMPT,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_DEV_MODE,
} from '../defaults.js';

const EXT_NAME = 'localyze';

/**
 * Blueprint for profile-level settings.
 * Any key added here will be included in every profile.
 */
export const PROFILE_DEFAULTS = Object.freeze({
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
});

/**
 * Returns the active configuration for the current session.
 * All engine components should read from here.
 */
export function getSettings() {
    return extension_settings[EXT_NAME].activeState;
}

/**
 * Returns the root settings object. 
 * Used for global (meta) keys like knownSessions and auditCache.
 */
export function getMetaSettings() {
    return extension_settings[EXT_NAME];
}

/**
 * Initializes the settings structure.
 * Performs a one-time migration from flat root keys to the profiles dictionary.
 */
export function initSettings() {
    // 1. Ensure the root object exists
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    const root = extension_settings[EXT_NAME];

    // 2. Structural Initialization & Migration
    if (!root.profiles) {
        console.log('[Localyze] Initializing profile-based settings structure...');

        // Harvest legacy flat keys from root if they exist
        const legacyConfig = {};
        for (const key of Object.keys(PROFILE_DEFAULTS)) {
            if (Object.prototype.hasOwnProperty.call(root, key)) {
                legacyConfig[key] = root[key];
                delete root[key]; // Clean up root
            }
        }

        // Create the initial "Default" profile using legacy values or defaults
        const defaultProfile = Object.assign({}, PROFILE_DEFAULTS, legacyConfig);

        root.profiles = {
            'Default': defaultProfile,
        };
        root.currentProfileName = 'Default';
        root.activeState = structuredClone(defaultProfile);
    } else {
        // Structure already exists; ensure activeState has all current default keys
        root.activeState = Object.assign({}, PROFILE_DEFAULTS, root.activeState);
    }

    // 3. Global (Meta) Key Initialization
    if (!Array.isArray(root.knownSessions)) {
        root.knownSessions = [];
    }
    if (!root.auditCache) {
        root.auditCache = {
            suspects: [],
            lastAudit: null,
            orphans: [],
        };
    }

    // 4. Security Cleanup (Legacy keys from previous versions)
    delete root.pollinationsKey;
    delete root.pollinationsSecretKey;
    delete root.localyze_pollinations_key;
}
