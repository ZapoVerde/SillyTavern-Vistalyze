/**
 * @file data/default-user/extensions/localyze/ui/workshopModal.js
 * @stamp {"utc":"2026-04-02T14:00:00.000Z"}
 * @architectural-role UI Orchestrator
 * @description
 * High-level coordinator for the Location Workshop. Manages state-to-view 
 * transitions and orchestrates re-renders using pure templates and 
 * decoupled listeners.
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
 *     external_io: [JQuery DOM (write), templates.js, listeners.js]
 */

import { state } from '../state.js';
import { 
    getBaseWorkshopHTML, 
    getLibraryListHTML, 
    getArchitectGridHTML, 
    getArchitectEmptyHTML 
} from './workshop/templates.js';
import { bindWorkshopEvents } from './workshop/listeners.js';

/**
 * Renders the Library list based on _draftLocations.
 */
export function renderLibrary() {
    const drafts = Object.entries(state._draftLocations);
    const html = getLibraryListHTML(drafts, state.currentLocation);
    $('.lz-library-list').html(html);
}

/**
 * Renders the Architect tab for the current active workshop key.
 */
export async function renderArchitect() {
    const key = state._activeWorkshopKey;
    const draft = state._draftLocations[key];
    const $container = $('#lz-tab-architect');

    if (!draft) {
        $container.html(getArchitectEmptyHTML());
        return;
    }

    const filename = `localyze_${state.sessionId}_${key}.png`;
    const currentImgUrl = state.fileIndex.has(filename) 
        ? `backgrounds/${encodeURIComponent(filename)}?t=${Date.now()}` 
        : '';
    const proposedImgUrl = state._proposedImageBlob ?? '';

    $container.html(getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl));
}

/**
 * Switches the active tab and triggers the appropriate render logic.
 * @param {string} tabName 
 */
export function switchTab(tabName) {
    $('.lz-tab-btn').removeClass('menu_button_success').addClass('menu_button');
    $(`.lz-tab-btn[data-tab="${tabName}"]`).removeClass('menu_button').addClass('menu_button_success');
    
    $('.lz-tab-panel').addClass('lz-hidden');
    $(`#lz-tab-${tabName}`).removeClass('lz-hidden');

    if (tabName === 'library') renderLibrary();
    if (tabName === 'architect') renderArchitect();
}

/**
 * Entry point to inject the workshop and bind its listeners.
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
 * @param {string} tab Initial tab to display.
 */
export function openWorkshop(tab = 'library') {
    injectWorkshop();
    $('#lz-workshop-overlay').removeClass('lz-hidden');
    switchTab(tab);
}