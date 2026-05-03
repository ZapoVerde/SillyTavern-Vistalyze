/**
 * @file data/default-user/extensions/vistalyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-05-03T15:45:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Location Workshop HTML. 
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @updates
 * - Added "Select Existing" button to the Architect tab to trigger the ST background hijack.
 * - Updated getArchitectGridHTML to include the hijack trigger.
 *
 * @api-declaration
 * getBaseWorkshopHTML(sessionId) -> string
 * getLibraryListHTML(drafts, currentKey) -> string
 * getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl) -> string
 * getArchitectEmptyHTML() -> string
 * getExplorerHTML() -> string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */

import { escapeHtml } from '../../utils/history.js';

/**
 * Main skeleton of the Workshop Modal.
 * Uses classes defined in style.css for structural flexbox support.
 */
export function getBaseWorkshopHTML(sessionId) {
    return `
    <div id="lz-workshop-overlay" class="lz-overlay lz-hidden">
        <div id="lz-workshop-modal" class="lz-modal">
            
            <div class="lz-workshop-header">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0;" data-i18n="vistalyze.workshop.title">Location Workshop</h3>
                    <div style="font-size:0.85em; opacity:0.6;"><span data-i18n="vistalyze.workshop.label_session">Session:</span> ${escapeHtml(sessionId)}</div>
                </div>
                <div class="lz-tab-bar">
                    <button class="lz-tab-btn menu_button" data-tab="library" data-i18n="vistalyze.workshop.tab_library">Library</button>
                    <button class="lz-tab-btn menu_button" data-tab="architect" data-i18n="vistalyze.workshop.tab_architect">Architect</button>
                    <button class="lz-tab-btn menu_button" data-tab="explorer" data-i18n="vistalyze.workshop.tab_explorer">Explorer</button>
                </div>
            </div>

            <div class="lz-workshop-body">
                <!-- Library Tab -->
                <div id="lz-tab-library" class="lz-tab-panel lz-hidden">
                    <p style="margin-top:0; opacity:0.7; font-size:0.9em; flex-shrink:0;" data-i18n="vistalyze.workshop.library_hint">
                        Browse discovered locations and select one to apply to the current scene.
                    </p>
                    <div class="lz-library-list">
                        <!-- Items injected here by renderLibrary() -->
                    </div>
                </div>

                <!-- Architect Tab -->
                <div id="lz-tab-architect" class="lz-tab-panel lz-hidden">
                    <!-- Content injected here by renderArchitect() -->
                </div>

                <!-- Explorer Tab -->
                <div id="lz-tab-explorer" class="lz-tab-panel lz-hidden">
                    ${getExplorerHTML()}
                </div>
            </div>

            <div class="lz-workshop-controls">
                <button id="lz-workshop-close" class="menu_button" data-i18n="vistalyze.workshop.btn_cancel">Cancel</button>
                <button id="lz-arch-finalize" class="menu_button menu_button_success" data-i18n="vistalyze.workshop.btn_finalize">Apply and Finalize</button>
            </div>
        </div>
    </div>`;
}

/**
 * Generates the list of locations for the Library tab.
 * @param {Array} drafts Entries from _draftLocations.
 * @param {string|null} currentKey The currently active location key.
 * @param {Set<string>} fileIndex Known background filenames on server.
 * @param {string|null} sessionId Current session ID for filename construction.
 */
export function getLibraryListHTML(drafts, currentKey, fileIndex = new Set(), sessionId = null) {
    if (drafts.length === 0) {
        return `
        <div style="text-align:center; padding:40px; opacity:0.5;">
            <i class="fa-solid fa-box-open" style="font-size:2em; margin-bottom:10px;"></i><br/>
            <span data-i18n="vistalyze.workshop.library_empty">Library is empty. Use "Explorer" to discover new places.</span>
        </div>`;
    }

    return drafts.map(([key, loc]) => {
        const isCurrent = currentKey === key;
        const isCustom = !!loc.customBg;
        const filename = loc.customBg || (sessionId ? `vistalyze_${sessionId}_${key}.png` : null);
        // customBg files are native ST backgrounds and never appear in the Vistalyze-scoped
        // fileIndex, so bypass that check and trust the filename directly.
        const hasImage = filename && (isCustom || fileIndex.has(filename));
        const thumbUrl = hasImage ? `backgrounds/${encodeURIComponent(filename)}?v=${Date.now()}` : null;

        const thumbHTML = thumbUrl
            ? `<img src="${thumbUrl}" alt="" />`
            : `<i class="fa-solid fa-image lz-thumb-placeholder"></i>`;

        return `
        <div class="lz-library-item ${isCurrent ? 'lz-active-loc' : ''}" data-key="${escapeHtml(key)}">
            <div class="lz-lib-thumb" data-filename="${escapeHtml(filename || '')}" title="View background">
                ${thumbHTML}
            </div>
            <div class="lz-lib-text" style="cursor:pointer;" title="Apply location">
                <strong style="color: ${isCurrent ? 'var(--SmartThemeQuoteColor)' : 'inherit'};">
                    ${isCurrent ? '<i class="fa-solid fa-location-dot"></i> ' : ''}${escapeHtml(loc.name)}
                </strong>
                <small>${escapeHtml(loc.description)}</small>
            </div>
            <div class="lz-lib-actions">
                <i class="fa-solid fa-folder-open lz-lib-pick-bg" style="font-size:1.2em;" data-i18n="[title]vistalyze.workshop.pick_bg_title" title="Select existing background"></i>
                <i class="fa-solid fa-pen-to-square lz-lib-edit" style="font-size:1.2em;" data-i18n="[title]vistalyze.workshop.edit_title" title="Edit in Architect"></i>
                <i class="fa-solid fa-trash lz-lib-delete" style="font-size:1.2em;" data-i18n="[title]vistalyze.workshop.delete_title" title="Delete Location"></i>
            </div>
        </div>`;
    }).join('');
}

/**
 * Calculates the number of textarea rows needed to display text without scrolling.
 * @param {string} text The textarea content.
 * @param {number} charsPerRow Estimated characters per row.
 * @param {number} minRows Minimum rows to show.
 */
function calcRows(text, charsPerRow = 65, minRows = 2) {
    if (!text) return minRows;
    const lines = text.split('\n');
    const total = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / charsPerRow)), 0);
    return Math.max(minRows, total);
}

/**
 * Architect View: Vertical layout — text fields stacked, then images side-by-side.
 */
export function getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl, proposedLabel = 'Proposed') {
    const defRows = calcRows(draft.description, 65, 2);
    const visRows = calcRows(draft.imagePrompt, 65, 4);
    const isManual = !!draft.customBg;

    return `
    <div class="lz-architect-fields">
        <label data-i18n="vistalyze.workshop.label_name">Location Name</label>
        <input type="text" id="lz-arch-name" class="text_pole" style="width:100%;" value="${escapeHtml(draft.name)}" />

        <label><span data-i18n="vistalyze.workshop.label_definition">Definition (Logic)</span> <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="description" data-i18n="[title]vistalyze.workshop.regen_logic_title" title="Regenerate logic from context"></i></label>
        <textarea id="lz-arch-definition" class="text_pole" rows="${defRows}" style="width:100%; resize:vertical;">${escapeHtml(draft.description)}</textarea>

        <div style="display:flex; align-items:center; justify-content:space-between; margin: 12px 0 4px;">
            <label data-i18n="vistalyze.workshop.label_visuals">Visuals (Image Prompt)</label>
            <div style="display:flex; gap:4px;">
                ${isManual ? `<button class="menu_button" id="lz-arch-clear-bg-btn" style="font-size:0.75em; padding: 2px 8px;" title="${escapeHtml(draft.customBg)}">
                    <i class="fa-solid fa-xmark"></i> <span data-i18n="vistalyze.workshop.btn_clear_bg">Clear: ${escapeHtml(draft.customBg)}</span>
                </button>` : ''}
                <button class="menu_button" id="lz-arch-hijack-btn" style="font-size:0.75em; padding: 2px 8px;">
                    <i class="fa-solid fa-folder-open"></i> <span data-i18n="vistalyze.workshop.btn_hijack">Select Existing</span>
                </button>
            </div>
        </div>
        <textarea id="lz-arch-visuals" class="text_pole" rows="${visRows}"
                  ${isManual ? 'disabled' : ''}
                  style="width:100%; resize:vertical; font-family:monospace; font-size:0.9em; opacity: ${isManual ? '0.5' : '1'};">
            ${escapeHtml(draft.imagePrompt)}
        </textarea>

        <div class="lz-architect-actions">
            <button id="lz-arch-preview-btn" class="menu_button" ${isManual ? 'disabled' : ''} data-i18n="vistalyze.workshop.btn_preview">Thumbnail Preview</button>
            <span id="lz-preview-spinner" class="lz-hidden"><i class="fa-solid fa-spinner fa-spin"></i></span>
        </div>
    </div>

    <div class="lz-preview-pane">
        <div class="lz-preview-box">
            <small data-i18n="vistalyze.workshop.label_current_bg">Current Background</small>
            <img id="lz-preview-before" src="${currentImgUrl}" alt="No current BG" style="display: ${currentImgUrl ? 'block' : 'none'};" />
        </div>
        <div class="lz-preview-box">
            <small>${escapeHtml(proposedLabel)}</small>
            <img id="lz-preview-after" src="${proposedImgUrl}" alt="No preview" style="display: ${proposedImgUrl ? 'block' : 'none'};" />
        </div>
    </div>`;
}

/**
 * Placeholder for when the Architect tab is empty.
 */
export function getArchitectEmptyHTML() {
    return `
    <div id="lz-arch-empty" style="text-align:center; padding:60px; opacity:0.5;">
        <i class="fa-solid fa-compass-drafting" style="font-size:3em; margin-bottom:15px;"></i><br/>
        <span data-i18n="vistalyze.workshop.architect_empty">Select a location from the Library or use the Explorer to start refining.</span>
    </div>`;
}

/**
 * Explorer Tab Layout.
 */
export function getExplorerHTML() {
    return `
    <div style="margin-bottom:20px; flex-shrink:0;">
        <h4 data-i18n="vistalyze.workshop.explorer_title">Automated Discovery</h4>
        <p style="opacity:0.8;" data-i18n="vistalyze.workshop.explorer_hint">Analyze the recent turns of the conversation to identify a new location. You can provide keywords to guide the AI's imagination.</p>
        <input type="text" id="lz-explorer-keywords" class="text_pole" data-i18n="[placeholder]vistalyze.workshop.explorer_placeholder" placeholder="Optional keywords (e.g. 'A dark damp cave')..." style="width:100%;" />
    </div>
    <button id="lz-explorer-go" class="menu_button" style="width:100%; padding: 12px; flex-shrink:0;" data-i18n="vistalyze.workshop.btn_discover">Discover Location</button>
    <div id="lz-explorer-status" class="lz-hidden" style="margin-top:25px; text-align:center; opacity:0.7;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5em; margin-bottom:10px;"></i><br/><span data-i18n="vistalyze.workshop.explorer_status">Analyzing roleplay context...</span>
    </div>`;
}