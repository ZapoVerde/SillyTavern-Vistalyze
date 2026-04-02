/**
 * @file data/default-user/extensions/localyze/settings/panel.js
 * @stamp {"utc":"2026-04-03T17:30:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * The primary entry point for the Localyze settings UI. 
 *
 * @updates
 * - Migration: Replaced all direct setting mutations with updateActiveSetting, 
 *   updateMetaSetting, and switchProfile setters.
 * - Standardized Flow: UI events now trigger data updates through protected gatekeepers.
 *
 * @api-declaration
 * injectSettingsPanel() — Main entry point for extension settings init.
 *
 * @contract
 *   assertions:
 *     purity: UI Orchestrator
 *     state_ownership: [none]
 *     external_io: [#extensions_settings DOM, settings/data.js]
 */

import { getRequestHeaders } from '../../../../../script.js';
import { runFullAudit } from '../orphanDetector.js';
import { openOrphanModal } from '../ui/orphanModal.js';
import { ConnectionManagerRequestService } from '../../../shared.js';
import { 
    getSettings, 
    getMetaSettings, 
    initSettings, 
    updateActiveSetting, 
    updateMetaSetting, 
    switchProfile 
} from './data.js';
import { 
    DEFAULT_BOOLEAN_PROMPT, 
    DEFAULT_CLASSIFIER_PROMPT, 
    DEFAULT_DESCRIBER_PROMPT, 
    DEFAULT_DISCOVERY_PROMPT,
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
        { selector: '#lz-profile-discovery',  key: 'discoveryProfileId'  },
    ];

    for (const { selector, key } of pairs) {
        try {
            ConnectionManagerRequestService.handleDropdown(
                selector,
                s[key] ?? '',
                (profile) => {
                    // Protected Update: Set connection profile ID
                    updateActiveSetting(key, profile?.id ?? null);
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
    $('#lz-parallax-enabled').prop('checked', meta.parallaxEnabled ?? false);
    
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
        discoveryPrompt:     DEFAULT_DISCOVERY_PROMPT,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    };
    const promptTitles = {
        booleanPrompt:       'Step 1 — Has Location Changed?',
        classifierPrompt:    'Step 2 — Which Location?',
        describerPrompt:     'Step 3 — Describe New Location',
        discoveryPrompt:     'Step 4 — Targeted Discovery',
        imagePromptTemplate: 'Image Prompt Template',
    };
    const promptVariables = {
        booleanPrompt:       ['current_location', 'history', 'message'],
        classifierPrompt:    ['key_list', 'filtered_list', 'history', 'message'],
        describerPrompt:     ['context'],
        discoveryPrompt:     ['keywords', 'context'],
        imagePromptTemplate: ['image_prompt', 'name', 'description'],
    };

    $('#lz-settings').on('change', '#lz-profile-select', function() {
        const newName = $(this).val();
        if (!meta.profiles[newName]) return;
        
        // Protected Update: Switch profile via Setter API
        switchProfile(newName);
        refreshPanel();
    });

    $('#lz-settings').on('click', '#lz-profile-save',   () => handleProfileSave(meta));
    $('#lz-settings').on('click', '#lz-profile-add',    () => handleProfileAdd(meta, refreshPanel));
    $('#lz-settings').on('click', '#lz-profile-rename', () => handleProfileRename(meta, refreshPanel));
    $('#lz-settings').on('click', '#lz-profile-delete', () => handleProfileDelete(meta, refreshPanel));

    $('#lz-settings').on('click', '.lz-open-prompt', async function () {
        const key = $(this).data('prompt-key');
        const updated = await openPromptModal(key, promptTitles[key], promptDefaults[key], promptVariables[key] ?? []);
        if (updated) updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('input', '.lz-history-input', function () {
        const key = $(this).data('history-key');
        const val = Math.max(0, parseInt($(this).val()) || 0);
        
        // Protected Update: Update numeric setting
        updateActiveSetting(key, val);
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('click', '#lz-pollinations-save', () => {
        savePollinationsKey($('#lz-pollinations-key').val());
        $('#lz-pollinations-key').val('');
    });

    $('#lz-settings').on('click', '#lz-pollinations-check', () => testPollinationsConnection());

    $('#lz-settings').on('change', '#lz-image-model', function () {
        const val = $(this).val() || DEFAULT_IMAGE_MODEL;
        
        // Protected Update: Update active model
        updateActiveSetting('imageModel', val);
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-dev-mode', function () {
        const val = $(this).prop('checked');
        
        // Protected Update: Update boolean flag
        updateActiveSetting('devMode', val);
        updateDirtyIndicator(meta);
    });

    $('#lz-settings').on('change', '#lz-parallax-enabled', function () {
        const val = $(this).prop('checked');

        // Protected Update: Update global feature flag
        updateMetaSetting('parallaxEnabled', val);
    });

    $('#lz-settings').on('click', '#lz-audit-btn', async function () {
        const $btn = $(this);
        const originalHtml = $btn.html();

        try {
            $btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Auditing...');

            const res = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            });
            const data = await res.json();
            const images = data.images ?? [];

            const orphans = await runFullAudit(images);

            updateMetaSetting('auditCache', {
                lastAudit: new Date().toISOString(),
                orphans,
                suspects: orphans,
            });

            if (orphans.length > 0) {
                openOrphanModal(orphans);
            } else {
                if (window.toastr) window.toastr.success('No orphaned images found.', 'Localyze');
            }
        } catch (err) {
            console.error('[Localyze] Audit failed:', err);
            if (window.toastr) window.toastr.error('Audit failed. See console for details.', 'Localyze');
        } finally {
            $btn.html(originalHtml);
        }
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