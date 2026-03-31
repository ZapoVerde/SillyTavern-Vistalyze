/**
 * @file data/default-user/extensions/localyze/ui/workshop/templates.js
 * @stamp {"utc":"2026-04-02T14:00:00.000Z"}
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Location Workshop HTML. 
 * Decouples the "Look and Feel" from logic and state.
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
 */
export function getBaseWorkshopHTML(sessionId) {
    return `
    <div id="lz-workshop-overlay" class="lz-overlay lz-hidden" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 3000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85);">
        <div id="lz-workshop-modal" class="lz-modal" style="background: var(--mainColor); border: 1px solid var(--SmartThemeBorderColor); color: var(--unselectedWhite); width: 85%; max-width: 900px; height: 80vh; display: flex; flex-direction: column; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
            
            <div class="lz-workshop-header" style="padding: 15px; background: rgba(0,0,0,0.3); border-bottom: 1px solid var(--SmartThemeBorderColor);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0;">Location Workshop</h3>
                    <div style="font-size:0.85em; opacity:0.6;">Session: ${escapeHtml(sessionId)}</div>
                </div>
                <div class="lz-tab-bar" style="display: flex; gap: 8px;">
                    <button class="lz-tab-btn menu_button" data-tab="library" style="padding: 6px 16px;">Library</button>
                    <button class="lz-tab-btn menu_button" data-tab="architect" style="padding: 6px 16px;">Architect</button>
                    <button class="lz-tab-btn menu_button" data-tab="explorer" style="padding: 6px 16px;">Explorer</button>
                </div>
            </div>

            <div class="lz-workshop-body" style="flex: 1; overflow: hidden; position: relative; padding: 20px;">
                <div id="lz-tab-library" class="lz-tab-panel lz-hidden" style="height: 100%; display: flex; flex-direction: column;">
                    <p style="margin-top:0; opacity:0.7; font-size:0.9em;">Browse your discovered locations and select one to apply to the current scene.</p>
                    <div class="lz-library-list" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 4px; padding: 10px; border: 1px solid var(--SmartThemeBorderColor);"></div>
                </div>

                <div id="lz-tab-architect" class="lz-tab-panel lz-hidden" style="height: 100%; overflow-y: auto;">
                    <!-- Architect Content Injected Here -->
                </div>

                <div id="lz-tab-explorer" class="lz-tab-panel lz-hidden">
                    ${getExplorerHTML()}
                </div>
            </div>

            <div class="lz-workshop-controls" style="padding: 15px; background: rgba(0,0,0,0.2); border-top: 1px solid var(--SmartThemeBorderColor); display: flex; justify-content: flex-end;">
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
        <div class="lz-library-item ${isCurrent ? 'lz-active-loc' : ''}" data-key="${escapeHtml(key)}" 
             style="background: ${isCurrent ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}; 
                    border: 1px solid ${isCurrent ? 'var(--SmartThemeQuoteColor)' : 'rgba(255,255,255,0.1)'}; 
                    margin-bottom:8px; border-radius:6px; padding:12px; display:flex; align-items:center; justify-content:space-between; transition: background 0.2s;">
            <div class="lz-lib-text" style="flex:1; margin-right:15px;">
                <strong style="display:block; font-size:1.1em; color: ${isCurrent ? 'var(--SmartThemeQuoteColor)' : 'inherit'};">
                    ${isCurrent ? '<i class="fa-solid fa-location-dot"></i> ' : ''}${escapeHtml(loc.name)}
                </strong>
                <small style="opacity:0.6; font-size:0.85em; display:block; margin-top:4px;">${escapeHtml(loc.description)}</small>
            </div>
            <div class="lz-lib-actions" style="display:flex; gap:16px; font-size:1.2em; opacity:0.8;">
                <i class="fa-solid fa-location-arrow lz-lib-apply" title="Apply Location" style="cursor:pointer; color: var(--SmartThemeQuoteColor);"></i>
                <i class="fa-solid fa-pen-to-square lz-lib-edit" title="Edit in Architect" style="cursor:pointer;"></i>
                <i class="fa-solid fa-trash lz-lib-delete" title="Delete Location" style="cursor:pointer; color: var(--SmartThemeErrorColor);"></i>
            </div>
        </div>`;
    }).join('');
}

/**
 * Architect View: Grid Layout for editing.
 */
export function getArchitectGridHTML(draft, currentImgUrl, proposedImgUrl) {
    return `
    <div class="lz-architect-grid" style="display: grid; grid-template-columns: 1fr 320px; gap: 20px;">
        <div class="lz-architect-fields">
            <label style="display:block; margin-bottom:5px; font-size:0.9em;">Location Name</label>
            <input type="text" id="lz-arch-name" class="text_pole" style="width:100%; margin-bottom:15px;" value="${escapeHtml(draft.name)}" />

            <label style="display:block; margin-bottom:5px; font-size:0.9em;">Definition (Logic) <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="description" title="Regenerate logic from context" style="cursor:pointer; margin-left:5px; opacity:0.6;"></i></label>
            <input type="text" id="lz-arch-definition" class="text_pole" style="width:100%; margin-bottom:15px;" value="${escapeHtml(draft.description)}" />

            <label style="display:block; margin-bottom:5px; font-size:0.9em;">Visuals (Image Prompt) <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="imagePrompt" title="Regenerate prompt from definition" style="cursor:pointer; margin-left:5px; opacity:0.6;"></i></label>
            <textarea id="lz-arch-visuals" class="text_pole" rows="4" style="width:100%; margin-bottom:15px; font-family:monospace; font-size:0.9em;">${escapeHtml(draft.imagePrompt)}</textarea>
            
            <div class="lz-architect-actions">
                <button id="lz-arch-preview-btn" class="menu_button">Regenerate Preview</button>
            </div>
        </div>
        
        <div class="lz-architect-preview" style="display: flex; flex-direction: column; gap: 15px;">
            <div class="lz-preview-box" style="background: #000; border: 1px solid var(--SmartThemeBorderColor); border-radius:4px; padding:5px; text-align:center;">
                <small style="display:block; margin-bottom:4px; opacity:0.5;">Current Background</small>
                <img id="lz-preview-before" src="${currentImgUrl}" alt="No current BG" style="width:100%; border-radius:2px; min-height:100px; object-fit:cover; display: ${currentImgUrl ? 'block' : 'none'};" />
            </div>
            <div class="lz-preview-box" style="background: #000; border: 1px solid var(--SmartThemeBorderColor); border-radius:4px; padding:5px; text-align:center; position:relative;">
                <small style="display:block; margin-bottom:4px; opacity:0.5;">Proposed (Dev Mode)</small>
                <img id="lz-preview-after" src="${proposedImgUrl}" alt="No preview" style="width:100%; border-radius:2px; min-height:100px; object-fit:cover; display: ${proposedImgUrl ? 'block' : 'none'};" />
                <div id="lz-preview-spinner" class="lz-hidden" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:2em; opacity:0.8;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        </div>
    </div>
    <div class="lz-workshop-footer" style="margin-top:20px; padding-top:20px; border-top: 1px solid var(--SmartThemeBorderColor); display:flex; justify-content:flex-end;">
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
    <div style="margin-bottom:20px;">
        <h4>Automated Discovery</h4>
        <p style="opacity:0.8;">Analyze the recent turns of the conversation to identify a new location. You can provide keywords to guide the AI's imagination.</p>
        <input type="text" id="lz-explorer-keywords" class="text_pole" placeholder="Optional keywords (e.g. 'A dark damp cave')..." style="width:100%;" />
    </div>
    <button id="lz-explorer-go" class="menu_button" style="width:100%; padding: 12px;">Discover Location</button>
    <div id="lz-explorer-status" class="lz-hidden" style="margin-top:25px; text-align:center; opacity:0.7;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5em; margin-bottom:10px;"></i><br/>Analyzing roleplay context...
    </div>`;
}