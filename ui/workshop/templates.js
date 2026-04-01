/**
 * @file data/default-user/extensions/localyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-04-02T14:20:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Location Workshop HTML. 
 * Updated to support the flexbox chain defined in style.css to prevent
 * modal collapse and enable proper scrolling in the library list.
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
                    <h3 style="margin:0;">Location Workshop</h3>
                    <div style="font-size:0.85em; opacity:0.6;">Session: ${escapeHtml(sessionId)}</div>
                </div>
                <div class="lz-tab-bar">
                    <button class="lz-tab-btn menu_button" data-tab="library">Library</button>
                    <button class="lz-tab-btn menu_button" data-tab="architect">Architect</button>
                    <button class="lz-tab-btn menu_button" data-tab="explorer">Explorer</button>
                </div>
            </div>

            <div class="lz-workshop-body">
                <!-- Library Tab -->
                <div id="lz-tab-library" class="lz-tab-panel lz-hidden">
                    <p style="margin-top:0; opacity:0.7; font-size:0.9em; flex-shrink:0;">
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
                <button id="lz-workshop-close" class="menu_button">Close Workshop</button>
            </div>
        </div>
    </div>`;
}

/**
 * Generates the list of locations for the Library tab.
 */
export function getLibraryListHTML(drafts, currentKey) {
    if (drafts.length === 0) {
        return `
        <div style="text-align:center; padding:40px; opacity:0.5;">
            <i class="fa-solid fa-box-open" style="font-size:2em; margin-bottom:10px;"></i><br/>
            Library is empty. Use "Explorer" to discover new places.
        </div>`;
    }

    return drafts.map(([key, loc]) => {
        const isCurrent = currentKey === key;
        return `
        <div class="lz-library-item ${isCurrent ? 'lz-active-loc' : ''}" data-key="${escapeHtml(key)}">
            <div class="lz-lib-text">
                <strong style="color: ${isCurrent ? 'var(--SmartThemeQuoteColor)' : 'inherit'};">
                    ${isCurrent ? '<i class="fa-solid fa-location-dot"></i> ' : ''}${escapeHtml(loc.name)}
                </strong>
                <small>${escapeHtml(loc.description)}</small>
            </div>
            <div class="lz-lib-actions">
                <i class="fa-solid fa-location-arrow lz-lib-apply" title="Apply Location"></i>
                <i class="fa-solid fa-pen-to-square lz-lib-edit" title="Edit in Architect"></i>
                <i class="fa-solid fa-trash lz-lib-delete" title="Delete Location"></i>
            </div>
        </div>`;
    }).join('');
}

/**
 * Architect View: Grid Layout for editing.
 */
export function getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl, proposedLabel = 'Proposed') {
    return `
    <div class="lz-architect-grid">
        <div class="lz-architect-fields">
            <label>Location Name</label>
            <input type="text" id="lz-arch-name" class="text_pole" style="width:100%;" value="${escapeHtml(draft.name)}" />

            <label>Definition (Logic) <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="description" title="Regenerate logic from context"></i></label>
            <input type="text" id="lz-arch-definition" class="text_pole" style="width:100%;" value="${escapeHtml(draft.description)}" />

            <label>Visuals (Image Prompt) <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="imagePrompt" title="Regenerate prompt from definition"></i></label>
            <textarea id="lz-arch-visuals" class="text_pole" rows="6" style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(draft.imagePrompt)}</textarea>
            
            <div class="lz-architect-actions">
                <button id="lz-arch-preview-btn" class="menu_button">Thumbnail Preview</button>
                <button id="lz-arch-generate-full-btn" class="menu_button">Generate Full Image</button>
                <span id="lz-generate-full-spinner" class="lz-hidden"><i class="fa-solid fa-spinner fa-spin"></i></span>
            </div>
        </div>
        
        <div class="lz-preview-pane">
            <div class="lz-preview-box">
                <small>Current Background</small>
                <img id="lz-preview-before" src="${currentImgUrl}" alt="No current BG" style="display: ${currentImgUrl ? 'block' : 'none'};" />
            </div>
            <div class="lz-preview-box">
                <small>${escapeHtml(proposedLabel)}</small>
                <img id="lz-preview-after" src="${proposedImgUrl}" alt="No preview" style="display: ${proposedImgUrl ? 'block' : 'none'};" />
                <div id="lz-preview-spinner" class="lz-hidden">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                </div>
            </div>
        </div>
    </div>
    <div class="lz-workshop-footer" style="margin-top: auto;">
        <button id="lz-arch-finalize" class="menu_button menu_button_success" style="padding: 8px 24px;">Finalize & Apply</button>
    </div>`;
}

/**
 * Placeholder for when the Architect tab is empty.
 */
export function getArchitectEmptyHTML() {
    return `
    <div id="lz-arch-empty" style="text-align:center; padding:60px; opacity:0.5;">
        <i class="fa-solid fa-compass-drafting" style="font-size:3em; margin-bottom:15px;"></i><br/>
        Select a location from the Library or use the Explorer to start refining.
    </div>`;
}

/**
 * Explorer Tab Layout.
 */
export function getExplorerHTML() {
    return `
    <div style="margin-bottom:20px; flex-shrink:0;">
        <h4>Automated Discovery</h4>
        <p style="opacity:0.8;">Analyze the recent turns of the conversation to identify a new location. You can provide keywords to guide the AI's imagination.</p>
        <input type="text" id="lz-explorer-keywords" class="text_pole" placeholder="Optional keywords (e.g. 'A dark damp cave')..." style="width:100%;" />
    </div>
    <button id="lz-explorer-go" class="menu_button" style="width:100%; padding: 12px; flex-shrink:0;">Discover Location</button>
    <div id="lz-explorer-status" class="lz-hidden" style="margin-top:25px; text-align:center; opacity:0.7;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5em; margin-bottom:10px;"></i><br/>Analyzing roleplay context...
    </div>`;
}
