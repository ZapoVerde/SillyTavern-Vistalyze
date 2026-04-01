/**
 * @file data/default-user/extensions/localyze/ui/workshop/listeners.js
 * @stamp {"utc":"2026-04-02T15:00:00.000Z"}
 * @architectural-role UI Event Listeners
 * @description
 * Centralizes all DOM event bindings for the Location Workshop modal.
 * Acts as the behavioral bridge between the UI Shell and Controller logic.
 *
 * @updates
 * - Standardized field mapping to 'description' and 'imagePrompt'.
 * - Added explicit visibility handling for the flexbox body to prevent collapse.
 * - Optimized event delegation for dynamically rendered library items.
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
    generateFullPreview,
    deleteDraftLocation
} from '../../logic/maintenance.js';

/**
 * Binds all listeners for the workshop modal.
 * @param {object} handlers Object containing { switchTab, renderLibrary, renderArchitect }
 */
export function bindWorkshopEvents(handlers) {
    const { switchTab, renderLibrary, renderArchitect } = handlers;
    const $overlay = $('#lz-workshop-overlay');

    // ─── Structural Control ───────────────────────────────────────────────
    
    // Tab switching logic
    $overlay.on('click', '.lz-tab-btn', function() { 
        switchTab($(this).data('tab')); 
    });

    // Close button logic
    $overlay.on('click', '#lz-workshop-close', () => { 
        $overlay.addClass('lz-hidden'); 
    });

    // ─── Library Tab Listeners ────────────────────────────────────────────
    
    // Navigate from Library to Architect
    $overlay.on('click', '.lz-lib-edit', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        state._activeWorkshopKey = key;
        state._proposedImageBlob = null;
        switchTab('architect');
    });

    // Remove location from draft library
    $overlay.on('click', '.lz-lib-delete', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        const name = state._draftLocations[key]?.name || 'this location';
        
        if (confirm(`Remove "${name}" from the library?`)) {
            deleteDraftLocation(key);
            renderLibrary();
        }
    });

    // Immediate Apply from Library
    $overlay.on('click', '.lz-lib-apply', async function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');
        
        try {
            await handleFinalizeWorkshop(key);
            $overlay.addClass('lz-hidden');
        } catch (err) {
            console.error('[Localyze:Workshop] Apply failed:', err);
        }
    });

    // ─── Architect Tab Listeners ──────────────────────────────────────────
    
    // Live Input Syncing: Updates state._draftLocations as user types.
    // Editing the visuals prompt invalidates any existing proposed preview.
    $overlay.on('input', '#lz-arch-name, #lz-arch-definition, #lz-arch-visuals', function() {
        const key = state._activeWorkshopKey;
        if (!key || !state._draftLocations[key]) return;

        const fieldMap = {
            'lz-arch-name': 'name',
            'lz-arch-definition': 'description',
            'lz-arch-visuals': 'imagePrompt'
        };
        state._draftLocations[key][fieldMap[this.id]] = $(this).val();

        if (this.id === 'lz-arch-visuals') {
            state._proposedImageBlob = null;
            state._proposedFullBlob = null;
            $('#lz-preview-after').attr('src', '').hide();
        }
    });

    // AI Refinement (The "Sparks"): Triggers targeted LLM extraction
    $overlay.on('click', '.lz-regen-spark', async function() {
        const field = $(this).data('field');
        const key = state._activeWorkshopKey;
        const $icon = $(this);

        $icon.addClass('fa-spin');
        try {
            const success = await regenField(key, field);
            if (success) renderArchitect();
        } finally {
            $icon.removeClass('fa-spin');
        }
    });

    // Full-Resolution Preview: generates and uploads the full-res image.
    // Finalize & Apply will skip generation if this is still valid.
    $overlay.on('click', '#lz-arch-generate-full-btn', async function() {
        const key = state._activeWorkshopKey;
        const $btn = $(this);
        const $spinner = $('#lz-generate-full-spinner');

        $btn.prop('disabled', true);
        $spinner.removeClass('lz-hidden');
        try {
            await generateFullPreview(key);
            renderArchitect();
        } catch (err) {
            if (window.toastr) window.toastr.error('Full image generation failed: ' + err.message, 'Localyze');
        } finally {
            $btn.prop('disabled', false);
            $spinner.addClass('lz-hidden');
        }
    });

    // Thumbnail Preview (Dev Mode)
    $overlay.on('click', '#lz-arch-preview-btn', async function() {
        const key = state._activeWorkshopKey;
        const $spinner = $('#lz-preview-spinner');
        
        $spinner.removeClass('lz-hidden');
        try {
            await previewProposedImage(key);
            renderArchitect();
        } catch (err) {
            if (window.toastr) window.toastr.error('Preview failed: ' + err.message);
        } finally {
            $spinner.addClass('lz-hidden');
        }
    });

    // Finalize Draft: Generates full-res image, commits to DNA, applies scene.
    // Modal stays open until generation is confirmed on the server.
    $overlay.on('click', '#lz-arch-finalize', async function() {
        const key = state._activeWorkshopKey;
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');
        const $btn = $(this);

        $btn.prop('disabled', true).text('Generating...');
        try {
            await handleFinalizeWorkshop(key);
            $overlay.addClass('lz-hidden');
        } catch (err) {
            $btn.prop('disabled', false).text('Finalize & Apply');
            console.error('[Localyze:Workshop] Commit failed:', err);
            if (window.toastr) window.toastr.error('Generation failed: ' + err.message, 'Localyze');
        }
    });

    // ─── Explorer Tab Listeners ───────────────────────────────────────────
    
    // Discovery Logic: Analyzes context to find new locations
    $overlay.on('click', '#lz-explorer-go', async function() {
        const keywords = $('#lz-explorer-keywords').val();
        const $status = $('#lz-explorer-status');
        const $btn = $(this);

        $status.removeClass('lz-hidden');
        $btn.prop('disabled', true);
        
        try {
            const key = await discoverySearch(keywords);
            if (key) {
                // Success: Jump straight to Architect for refinement
                state._proposedImageBlob = null;
                switchTab('architect');
                $('#lz-explorer-keywords').val('');
            } else {
                if (window.toastr) window.toastr.warning('Could not discover a new location from current context.');
            }
        } catch (err) {
            console.error('[Localyze:Workshop] Discovery failed:', err);
        } finally {
            $status.addClass('lz-hidden');
            $btn.prop('disabled', false);
        }
    });
}