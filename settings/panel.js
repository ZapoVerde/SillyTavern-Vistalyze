/**
 * @file data/default-user/extensions/localyze/settings/panel.js
 * @stamp {"utc":"2026-04-01T14:05:00.000Z"}
 * @version 1.4.1
 * @architectural-role UI Orchestrator
 * @description
 * The primary entry point for the Localyze settings UI. 
 *
 * Version 1.4.1 Updates:
 * - Removed manual detection button logic (relocating to Picker Modal).
 * - Simplified injectSettingsPanel signature.
 *
 * @api-declaration
 * injectSettingsPanel() — Main entry point for extension settings init.
 *
 * @contract
 *   assertions:
 *     purity: UI Orchestrator
 *     state_ownership: [none]
 *     external_io: [#extensions_settings DOM, saveSettingsDebounced]
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { ConnectionManagerRequestService } from '../../../shared.js';
import { getSettings, getMetaSettings, initSettings } from './data.js';
import { 
    DEFAULT_BOOLEAN_PROMPT, 
    DEFAULT_CLASSIFIER_PROMPT, 
    DEFAULT_DESCRIBER_PROMPT, 
    DEFAULT_IMAGE_PROMPT_TEMPLATE, 
    DEFAULT_IMAGE_MODEL, 
    POLLINATIONS_MODELS 
} from '../defaults.js';

import { buildPanelHTML } from '../ui/settings/templates.js';
import { openPromptModal } from '../ui/settings/promptModal.js';
import { 
    updateKeyStatusIndicator, 
    savePollinationsKey, 
    testPollinationsConnection 
} from '../ui/settings/vault.js';
import { 
    updateDirtyIndicator, 
    refreshProfileDropdown, 
    handleProfileSave, 
    handleProfileAdd, 
    handleProfileRename, 
    handleProfileDelete 
} from '../ui/settings/profileController.js';

// ─── Connection Dropdowns ──────────────────────────────────────────────────

function initDropdowns() {
    const s = getSettings();
    const pairs = [
        { selector: '#lz-profile-boolean',    key: 'booleanProfileId'    },
        { selector: '#lz-profile-classifier', key: 'classifierProfileId' },
        { selector: '#lz-profile-describer',  key: 'describerProfileId'  },
    ];

    for (const { selector, key } of pairs) {
        try {
            ConnectionManagerRequestService.handleDropdown(
                selector,
                s[key] ?? '',
                (profile) => {
                    s[key] = profile?.id ?? null;
                    saveSettingsDebounced();
                    updateDirtyIndicator(getMetaSettings());
                },
            );
        } catch (err) {
            console.warn(`[Localyze] Connection Manager failed for ${selector}:`, err);
            $(selector).closest('.lz-profile-row').hide();
        }
    }
}

// ─── UI Population ──────────────────────────────────────────────────────────

function populateInputs() {
    const s = getSettings();
    const meta = getMetaSettings();

    $('#lz-settings').find('.lz-history-input').each(function () {
        const key = $(this).data('history-key');
        $(this).val(s[key] ?? 0);
    });

    $('#lz-image-model').val(s.imageModel ?? DEFAULT_IMAGE_MODEL);
    $('#lz-dev-mode').prop('checked', s.devMode ?? false);
    
    $('#lz-pollinations-status').text('');
    updateKeyStatusIndicator();
    refreshProfileDropdown(meta);
}

function refreshPanel() {
    initDropdowns();
    populateInputs();
}

// ─── Event Bindings ─────────────────────────────────────────────────────────

function bindHandlers() {
    const meta = getMetaSettings();
    const promptDefaults = {
        booleanPrompt:       DEFAULT_BOOLEAN_PROMPT,
        classifierPrompt:    DEFAULT_CLASSIFIER_PROMPT,
        describerPrompt:     DEFAULT_DESCRIBER_PROMPT,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    };
    const promptTitles = {
        booleanPrompt:       'Step 1 — Has Location Changed?',
        classifierPrompt:    'Step 2 — Which Location?',
        describerPrompt:     'Step 3 — Describe New Location',
        imagePromptTemplate: 'Image Prompt Template',
    };

    $('#lz-settings').on('change', '#lz-profile-select', function() {
        const newName = $(this).val();
        if (!meta.profiles[newName]) return;
        meta.currentProfileName = newName;
        meta.activeState = structuredClone(meta.profiles[newName]);
        saveSettingsDebounced();
        refreshPanel();
    });

    $('#lz-settings').on('click', '#lz-profile-save',   () => handleProfileSave(meta));
    $('#lz-settings').on('click', '#lz-profile-add',    () => handleProfileAdd(meta, refreshPanel));
    $('#lz-settings').on('click', '#lz-profile-rename', () => handleProfileRename(meta, refreshPanel));
    $('#lz-settings').on('click', '#lz-profile-delete', () => handleProfileDelete(meta, refreshPanel));

    $('#lz-settings').on('click', '.lz-open-prompt', async function () {
        const key = $(this).data('prompt-key');
        const updated = await openPromptModal(key, promptTitles[key], promptDefaults[key]);
        if (updated) updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('input', '.lz-history-input', function () {
        const key = $(this).data('history-key');
        getSettings()[key] = Math.max(0, parseInt($(this).val()) || 0);
        saveSettingsDebounced();
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('click', '#lz-pollinations-save', () => {
        savePollinationsKey($('#lz-pollinations-key').val());
        $('#lz-pollinations-key').val('');
    });

    $('#lz-settings').on('click', '#lz-pollinations-check', () => testPollinationsConnection());

    $('#lz-settings').on('change', '#lz-image-model', function () {
        getSettings().imageModel = $(this).val() || DEFAULT_IMAGE_MODEL;
        saveSettingsDebounced();
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-dev-mode', function () {
        getSettings().devMode = $(this).prop('checked');
        saveSettingsDebounced();
        updateDirtyIndicator(meta);
    });
}

// ─── Entry Point ────────────────────────────────────────────────────────────

export function injectSettingsPanel() {
    if ($('#lz-settings').length) return;

    initSettings();

    const $parent = $('#extensions_settings');
    if (!$parent.length) return;

    const meta = getMetaSettings();
    $parent.append(buildPanelHTML(meta, POLLINATIONS_MODELS));
    
    bindHandlers();
    refreshPanel();
}