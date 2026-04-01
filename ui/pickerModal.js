/**
 * @file data/default-user/extensions/localyze/ui/pickerModal.js
 * @stamp {"utc":"2026-04-03T11:00:00.000Z"}
 * @architectural-role Manual Override UI
 * @description
 * Searchable location picker modal. Refactored to eliminate redundant 
 * IO logic and leverage the centralized Workshop Commit pipeline.
 * 
 * @updates
 * - Removed local IO functions (writeSceneRecord, applyLocation).
 * - Integrated with logic/commit.js: Now uses handleFinalizeWorkshop to 
 *   ensure cache-busting and DNA consistency.
 * - Integrated with logic/maintenance.js: Syncs draft state before opening 
 *   to ensure the picker operates on the latest library data.
 *
 * @api-declaration
 * openPickerModal(onEditCallback, onManualDetectCallback) — opens the picker.
 *
 * @contract
 *   assertions:
 *     purity: UI / Orchestrator
 *     state_ownership: [state.currentLocation]
 *     external_io: [callPopup, maintenance.syncDraftState, commit.handleFinalizeWorkshop]
 */

import { callPopup } from '../../../../../script.js';
import { state } from '../state.js';
import { escapeHtml } from '../utils/history.js';
import { syncDraftState } from '../logic/maintenance.js';
import { handleFinalizeWorkshop } from '../logic/commit.js';

/**
 * Opens the location picker.
 * @param {Function} onEdit Callback function(key) triggered when the edit icon is clicked.
 * @param {Function} onManualDetect Callback triggered when the "Force Detect" button is clicked.
 */
export async function openPickerModal(onEdit, onManualDetect) {
    // Ensure the workshop draft state is synchronized with the live library 
    // before we allow selection. This ensures handleFinalizeWorkshop has 
    // access to the definitions it needs.
    syncDraftState();

    const locationEntries = Object.entries(state.locations);
    const listHtml = locationEntries.length > 0 
        ? locationEntries
            .map(([key, loc]) => `
                <div class="lz-picker-item" data-key="${escapeHtml(key)}" 
                     style="display:flex; align-items:center; justify-content:space-between; padding:8px; cursor:pointer; border-bottom:1px solid var(--SmartThemeBorderColor); border-radius:4px;">
                    <div class="lz-picker-label" style="flex:1; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-location-dot" style="opacity:0.5; font-size:0.8em;"></i>
                        <span>${escapeHtml(loc.name)}</span>
                    </div>
                    <div class="lz-picker-actions" style="display:flex; gap:12px;">
                        <i class="fa-solid fa-pen-to-square lz-edit-trigger" data-key="${escapeHtml(key)}" 
                           title="Edit Location" style="opacity:0.6; padding:4px;"></i>
                    </div>
                </div>
            `).join('')
        : '<p style="text-align:center; opacity:0.5; padding:20px;">Library is empty.</p>';

    const popupPromise = callPopup(
        `<h3>Location Library</h3>
        <input type="text" id="lz-picker-search" class="text_pole" placeholder="Search locations..." style="width:100%; margin-bottom:10px;" />
        <div id="lz-picker-list" style="max-height:300px; overflow-y:auto; background:rgba(0,0,0,0.2); border-radius:4px; padding:4px;">
            ${listHtml}
        </div>
        
        <div style="margin-top:16px; border-top:1px solid var(--SmartThemeBorderColor); padding-top:12px;">
            <button id="lz-picker-manual" class="menu_button" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Force Detect New Location</span>
            </button>
            <p style="font-size:0.75em; opacity:0.5; margin-top:6px; text-align:center;">
                Analyze the current context to discover a new location automatically.
            </p>
        </div>`,
        'confirm',
    );

    // Selection state
    let selectedKey = state.currentLocation;

    function updateSelectionUI() {
        $('.lz-picker-item').css('background', 'transparent');
        if (selectedKey) {
            $(`.lz-picker-item[data-key="${CSS.escape(selectedKey)}"]`).css('background', 'var(--SmartThemeQuoteColor)');
        }
    }

    // Bind item clicks
    $('#lz-picker-list').on('click', '.lz-picker-item', function() {
        selectedKey = $(this).data('key');
        updateSelectionUI();
    });

    // Bind edit clicks
    $('#lz-picker-list').on('click', '.lz-edit-trigger', function(e) {
        e.stopPropagation();
        const key = $(this).data('key');
        $('#dialog_overlay .menu_button:last').click(); // Close picker
        if (typeof onEdit === 'function') onEdit(key);
    });

    // Bind Force Detect click
    $('#lz-picker-manual').on('click', async function() {
        $('#dialog_overlay .menu_button:last').click(); // Close picker
        if (typeof onManualDetect === 'function') {
            await onManualDetect();
        }
    });

    // Search filter
    $('#lz-picker-search').on('input', function () {
        const query = this.value.toLowerCase();
        $('.lz-picker-item').each(function () {
            const text = $(this).find('.lz-picker-label span').text().toLowerCase();
            const key = $(this).data('key').toLowerCase();
            $(this).toggle(text.includes(query) || key.includes(query));
        });
    });

    // Initial UI state
    setTimeout(updateSelectionUI, 10);

    const confirmed = await popupPromise;

    if (confirmed && selectedKey) {
        try {
            // Use the centralized workshop commit logic.
            // This handles DNA writing, cache-busting setBg, and generation if missing.
            await handleFinalizeWorkshop(selectedKey);
        } catch (err) {
            console.error('[Localyze:Picker] Failed to apply selection:', err);
        }
    }
}