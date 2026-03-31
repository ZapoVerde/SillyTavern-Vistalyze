/**
 * @file data/default-user/extensions/localyze/ui/workshop/listeners.js
 * @stamp {"utc":"2026-04-02T14:00:00.000Z"}
 * @architectural-role UI Event Listeners
 * @description
 * Centralizes all DOM event bindings for the Location Workshop modal.
 * Acts as the behavioral bridge between the UI Shell and Controller logic.
 *
 * @api-declaration
 * bindWorkshopEvents(handlers) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [JQuery DOM Events (read/write), maintenance.js, commit.js]
 */

import { state } from '../../state.js';
import { 
    regenField, 
    discoverySearch, 
    previewProposedImage, 
    deleteDraftLocation 
} from '../../logic/maintenance.js';

/**
 * Binds all listeners for the workshop.
 * @param {object} handlers Object containing { switchTab, renderLibrary, renderArchitect }
 */
export function bindWorkshopEvents(handlers) {
    const { switchTab, renderLibrary, renderArchitect } = handlers;
    const $overlay = $('#lz-workshop-overlay');

    // ─── Structural Control ───────────────────────────────────────────────
    
    $overlay.on('click', '.lz-tab-btn', function() { 
        switchTab($(this).data('tab')); 
    });

    $overlay.on('click', '#lz-workshop-close', () => { 
        $overlay.addClass('lz-hidden'); 
    });

    // ─── Library Tab Listeners ────────────────────────────────────────────
    
    $overlay.on('click', '.lz-lib-edit', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        state._activeWorkshopKey = key;
        state._proposedImageBlob = null;
        switchTab('architect');
    });

    $overlay.on('click', '.lz-lib-delete', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        if (confirm(`Delete location "${state._draftLocations[key].name}" from library?`)) {
            deleteDraftLocation(key);
            renderLibrary();
        }
    });

    $overlay.on('click', '.lz-lib-apply', async function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');
        await handleFinalizeWorkshop(key);
        $overlay.addClass('lz-hidden');
    });

    // ─── Architect Tab Listeners ──────────────────────────────────────────
    
    // Live Input Syncing
    $overlay.on('input', '#lz-arch-name, #lz-arch-definition, #lz-arch-visuals', function() {
        const key = state._activeWorkshopKey;
        if (!key || !state._draftLocations[key]) return;
        
        const fieldMap = { 
            'lz-arch-name': 'name', 
            'lz-arch-definition': 'description', 
            'lz-arch-visuals': 'imagePrompt' 
        };
        state._draftLocations[key][fieldMap[this.id]] = $(this).val();
    });

    // AI Refinement (Sparks)
    $overlay.on('click', '.lz-regen-spark', async function() {
        const field = $(this).data('field');
        const key = state._activeWorkshopKey;
        const $icon = $(this);

        $icon.addClass('fa-spin');
        try {
            await regenField(key, field);
            renderArchitect();
        } finally {
            $icon.removeClass('fa-spin');
        }
    });

    // Preview Generation
    $overlay.on('click', '#lz-arch-preview-btn', async function() {
        const key = state._activeWorkshopKey;
        $('#lz-preview-spinner').removeClass('lz-hidden');
        try {
            await previewProposedImage(key);
            renderArchitect();
        } finally {
            $('#lz-preview-spinner').addClass('lz-hidden');
        }
    });

    // Finalize
    $overlay.on('click', '#lz-arch-finalize', async function() {
        const key = state._activeWorkshopKey;
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');
        try {
            $(this).prop('disabled', true).text('Generating...');
            await handleFinalizeWorkshop(key);
            $overlay.addClass('lz-hidden');
        } finally {
            $(this).prop('disabled', false).text('Finalize & Apply');
        }
    });

    // ─── Explorer Tab Listeners ───────────────────────────────────────────
    
    $overlay.on('click', '#lz-explorer-go', async function() {
        const keywords = $('#lz-explorer-keywords').val();
        const $status = $('#lz-explorer-status');
        const $btn = $(this);

        $status.removeClass('lz-hidden');
        $btn.prop('disabled', true);
        
        try {
            const key = await discoverySearch(keywords);
            if (key) {
                state._proposedImageBlob = null;
                switchTab('architect');
                $('#lz-explorer-keywords').val('');
            }
        } finally {
            $status.addClass('lz-hidden');
            $btn.prop('disabled', false);
        }
    });
}