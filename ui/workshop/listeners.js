/**
 * @file data/default-user/extensions/localyze/ui/workshop/listeners.js
 * @stamp {"utc":"2026-04-03T16:45:00.000Z"}
 * @architectural-role UI Event Listeners
 * @description
 * Centralizes all DOM event bindings for the Location Workshop modal.
 *
 * @updates
 * - Migration: Replaced direct state mutations with setWorkshopKey, 
 *   setProposedBlob, and updateDraftField setters.
 * - Optimized Syncing: UI input now flows through state.js gatekeepers.
 *
 * @api-declaration
 * bindWorkshopEvents(handlers) -> void
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [JQuery DOM Events (read/write), maintenance.js, commit.js]
 */

import { state, setWorkshopKey, setProposedBlob, updateDraftField } from '../../state.js';
import {
    regenField,
    discoverySearch,
    previewProposedImage,
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
        
        // Protected Update: Activate for editing and clear stale previews
        setWorkshopKey(key);
        setProposedBlob('thumbnail', null);
        setProposedBlob('full', null);
        
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
    $overlay.on('input', '#lz-arch-name, #lz-arch-definition, #lz-arch-visuals', function() {
        const key = state._activeWorkshopKey;
        if (!key || !state._draftLocations[key]) return;

        const fieldMap = {
            'lz-arch-name': 'name',
            'lz-arch-definition': 'description',
            'lz-arch-visuals': 'imagePrompt'
        };

        // Protected Update: Synced field value.
        // updateDraftField handles the nulling of blobs if imagePrompt changes.
        updateDraftField(key, fieldMap[this.id], $(this).val());

        if (this.id === 'lz-arch-visuals') {
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

    // Thumbnail Preview
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
    $overlay.on('click', '#lz-arch-finalize', async function() {
        const key = state._activeWorkshopKey;
        if (!key) {
            if (window.toastr) window.toastr.warning('Select a location in the Architect tab first.', 'Localyze');
            return;
        }
        const { handleFinalizeWorkshop } = await import('../../logic/commit.js');
        const $btn = $(this);

        $btn.prop('disabled', true).text('Generating...');
        try {
            await handleFinalizeWorkshop(key);
            $btn.prop('disabled', false).text('Apply and Finalize');
            $overlay.addClass('lz-hidden');
        } catch (err) {
            $btn.prop('disabled', false).text('Apply and Finalize');
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
                // Success: Discovery logic handles key setting.
                // Reset previews for the new discovery.
                setProposedBlob('thumbnail', null);
                setProposedBlob('full', null);
                
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