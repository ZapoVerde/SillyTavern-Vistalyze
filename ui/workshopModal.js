/**
 * @file data/default-user/extensions/localyze/ui/workshopModal.js
 * @stamp {"utc":"2026-04-04T13:40:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * High-level coordinator for the Location Workshop. 
 * Includes translation-ready wrappers for dynamic UI labels.
 *
 * @updates
 * - Standardized Cache Busting: Updated renderArchitect to use the 'v=' timestamp parameter.
 * - This ensures that if a background is overwritten (same filename, new content), the preview updates instantly.
 * - Synchronized tab active classes with style.css (.lz-active).
 * - Integrated translation-ready translate wrappers for dynamic labels.
 *
 * @api-declaration
 * renderLibrary()   — updates the Library tab content.
 * renderArchitect() — updates the Architect tab content.
 * switchTab(name)   — toggles visibility and triggers re-renders.
 * injectWorkshop()  — initializes the modal shell and bindings.
 * openWorkshop(tab) — primary entry point to display the modal.
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Shell
 *     state_ownership: []
 *     external_io: [JQuery DOM (write), templates.js, listeners.js, i18n]
 */

import { translate } from '../../../../i18n.js';
import { state, setWorkshopKey } from '../state.js';
import { 
    getBaseWorkshopHTML, 
    getLibraryListHTML, 
    getArchitectGridHTML, 
    getArchitectEmptyHTML 
} from './workshop/templates.js';
import { bindWorkshopEvents } from './workshop/listeners.js';

/**
 * Renders the Library list based on _draftLocations.
 * Injects HTML into the .lz-library-list container.
 */
export function renderLibrary() {
    const drafts = Object.entries(state._draftLocations);
    const html = getLibraryListHTML(drafts, state.currentLocation);
    $('.lz-library-list').html(html);
}

/**
 * Renders the Architect tab for the current active workshop key.
 * Handles the display of current background vs. proposed preview.
 */
export async function renderArchitect() {
    // Default to the current active scene location if no workshop key is explicitly set.
    if (!state._activeWorkshopKey && state.currentLocation && state._draftLocations[state.currentLocation]) {
        setWorkshopKey(state.currentLocation);
    }

    const key = state._activeWorkshopKey;
    const draft = state._draftLocations[key];
    const $container = $('#lz-tab-architect');

    if (!draft) {
        $container.html(getArchitectEmptyHTML());
        return;
    }

    const filename = `localyze_${state.sessionId}_${key}.png`;
    
    // Cache-busting: Use a timestamp to force the browser to ignore its cache.
    // This is vital because we use static filenames (overwriting the file on server).
    const currentImgUrl = state.fileIndex.has(filename) 
        ? `backgrounds/${encodeURIComponent(filename)}?v=${Date.now()}` 
        : '';
        
    let proposedImgUrl = '';
    let proposedLabel = translate('Proposed');

    if (state._proposedFullBlob) {
        proposedImgUrl = state._proposedFullBlob;
        proposedLabel = translate('Full Resolution');
    } else if (state._proposedImageBlob) {
        proposedImgUrl = state._proposedImageBlob;
        proposedLabel = translate('Thumbnail Preview');
    }

    $container.html(getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl, proposedLabel));
}

/**
 * Switches the active tab and triggers the appropriate render logic.
 * Ensures the flexbox chain is preserved by correctly toggling .lz-hidden.
 * @param {string} tabName The ID suffix of the tab (library, architect, explorer)
 */
export function switchTab(tabName) {
    // 1. Update Button States
    $('.lz-tab-btn').removeClass('lz-active');
    $(`.lz-tab-btn[data-tab="${tabName}"]`).addClass('lz-active');
    
    // 2. Toggle Panel Visibility
    // Removing lz-hidden allows .lz-tab-panel's display:flex to take over
    $('.lz-tab-panel').addClass('lz-hidden');
    $(`#lz-tab-${tabName}`).removeClass('lz-hidden');

    // 3. Trigger Renderers
    if (tabName === 'library') renderLibrary();
    if (tabName === 'architect') renderArchitect();
}

/**
 * Entry point to inject the workshop and bind its listeners.
 * Idempotent check prevents multiple injections.
 */
export function injectWorkshop() {
    if ($('#lz-workshop-overlay').length) return;
    
    $('body').append(getBaseWorkshopHTML(state.sessionId));
    
    bindWorkshopEvents({
        switchTab,
        renderLibrary,
        renderArchitect
    });
}

/**
 * Primary entry point to display the Workshop modal.
 * Ensures the shell is injected before showing.
 * @param {string} tab Initial tab to display.
 */
export function openWorkshop(tab = 'library') {
    injectWorkshop();
    $('#lz-workshop-overlay').removeClass('lz-hidden');
    switchTab(tab);
}