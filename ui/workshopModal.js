/**
 * @file data/default-user/extensions/localyze/ui/workshopModal.js
 * @stamp {"utc":"2026-04-01T20:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role UI Orchestrator / Workshop View
 * @description
 * Implements the Location Workshop UI. Replaces the fragmented Picker, Add, 
 * and Edit modals with a unified tabbed interface.
 *
 * Logic:
 * 1. LIBRARY: Browsing and selecting from the draft location dictionary.
 * 2. ARCHITECT: Refining metadata (Definition/Visuals) with live previews.
 * 3. EXPLORER: Automated discovery of new locations from context.
 *
 * @api-declaration
 * openWorkshop(tabName) — Opens the workshop modal and activates the specified tab.
 * injectWorkshop() — Injects the workshop overlay into the DOM (called once).
 *
 * @contract
 *   assertions:
 *     purity: Stateful UI Orchestrator
 *     state_ownership: [DOM visibility, Active Tab State]
 *     external_io: [maintenance.js, commit.js, DOM Manipulation]
 */

import { state } from '../state.js';
import { escapeHtml } from '../utils/history.js';
import { 
    regenField, 
    discoverySearch, 
    previewProposedImage, 
    deleteDraftLocation 
} from '../logic/maintenance.js';

/**
 * Injects the Workshop HTML into the SillyTavern DOM.
 * Idempotent; call once at extension init.
 */
export function injectWorkshop() {
    if ($('#lz-workshop-overlay').length) return;

    const html = `
    <div id="lz-workshop-overlay" class="lz-overlay lz-hidden">
        <div id="lz-workshop-modal" class="lz-modal">
            <div class="lz-workshop-header">
                <h3>Location Workshop</h3>
                <div class="lz-tab-bar">
                    <button class="lz-tab-btn" data-tab="library">Library</button>
                    <button class="lz-tab-btn" data-tab="architect">Architect</button>
                    <button class="lz-tab-btn" data-tab="explorer">Explorer</button>
                </div>
            </div>

            <!-- Tab 1: Library -->
            <div id="lz-tab-library" class="lz-tab-panel lz-hidden">
                <div class="lz-library-list"></div>
            </div>

            <!-- Tab 2: Architect -->
            <div id="lz-tab-architect" class="lz-tab-panel lz-hidden">
                <div class="lz-architect-grid">
                    <div class="lz-architect-fields">
                        <label>Location Name</label>
                        <input type="text" id="lz-arch-name" class="text_pole" />

                        <label>Definition (Logic) <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="description" title="Regenerate logic from context"></i></label>
                        <input type="text" id="lz-arch-definition" class="text_pole" />

                        <label>Visuals (Image Prompt) <i class="fa-solid fa-wand-sparkles lz-regen-spark" data-field="imagePrompt" title="Regenerate prompt from definition"></i></label>
                        <textarea id="lz-arch-visuals" class="text_pole" rows="3"></textarea>
                        
                        <div class="lz-architect-actions">
                            <button id="lz-arch-preview-btn" class="menu_button">Regenerate Preview</button>
                        </div>
                    </div>
                    
                    <div class="lz-architect-preview">
                        <div class="lz-preview-pane">
                            <div class="lz-preview-box">
                                <small>Current Background</small>
                                <img id="lz-preview-before" src="" alt="No current BG" />
                            </div>
                            <div class="lz-preview-box">
                                <small>Proposed (Dev Mode)</small>
                                <img id="lz-preview-after" src="" alt="No preview" />
                                <div id="lz-preview-spinner" class="lz-hidden"><i class="fa-solid fa-spinner fa-spin"></i></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="lz-workshop-footer">
                    <button id="lz-arch-finalize" class="menu_button menu_button_success">Finalize & Apply</button>
                </div>
            </div>

            <!-- Tab 3: Explorer -->
            <div id="lz-tab-explorer" class="lz-tab-panel lz-hidden">
                <p>Discover a new location from the current roleplay context.</p>
                <input type="text" id="lz-explorer-keywords" class="text_pole" placeholder="Optional keywords (e.g. 'A dark damp cave')..." />
                <button id="lz-explorer-go" class="menu_button">Discover Location</button>
                <div id="lz-explorer-status" class="lz-hidden" style="margin-top:10px; opacity:0.7;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Analyzing context...
                </div>
            </div>

            <div class="lz-workshop-controls">
                <button id="lz-workshop-close" class="menu_button">Close</button>
            </div>
        </div>
    </div>`;

    $('body').append(html);
    bindEvents();
}

/**
 * Renders the Library list based on _draftLocations.
 */
function renderLibrary() {
    const $list = $('.lz-library-list').empty();
    const drafts = Object.entries(state._draftLocations);

    if (drafts.length === 0) {
        $list.append('<p style="text-align:center; padding:20px; opacity:0.5;">Library is empty.</p>');
        return;
    }

    drafts.forEach(([key, loc]) => {
        const isCurrent = state.currentLocation === key;
        const $item = $(`
            <div class="lz-library-item ${isCurrent ? 'lz-active-loc' : ''}" data-key="${escapeHtml(key)}">
                <div class="lz-lib-text">
                    <strong>${escapeHtml(loc.name)}</strong>
                    <small>${escapeHtml(loc.description)}</small>
                </div>
                <div class="lz-lib-actions">
                    <i class="fa-solid fa-location-arrow lz-lib-apply" title="Apply Location"></i>
                    <i class="fa-solid fa-pen-to-square lz-lib-edit" title="Edit in Architect"></i>
                    <i class="fa-solid fa-trash lz-lib-delete" title="Delete Location"></i>
                </div>
            </div>
        `);
        $list.append($item);
    });
}

/**
 * Renders the Architect tab for the current active workshop key.
 */
async function renderArchitect() {
    const key = state._activeWorkshopKey;
    const draft = state._draftLocations[key];

    if (!draft) {
        $('.lz-architect-grid').addClass('lz-hidden');
        $('.lz-workshop-footer').addClass('lz-hidden');
        $('#lz-tab-architect').prepend('<p id="lz-arch-empty" style="text-align:center; padding:40px; opacity:0.5;">Select a location from Library or Explorer to edit.</p>');
        return;
    }

    $('#lz-arch-empty').remove();
    $('.lz-architect-grid').removeClass('lz-hidden');
    $('.lz-workshop-footer').removeClass('lz-hidden');

    $('#lz-arch-name').val(draft.name);
    $('#lz-arch-definition').val(draft.description);
    $('#lz-arch-visuals').val(draft.imagePrompt);

    // Update Preview Before
    if (state.currentImage) {
        $('#lz-preview-before').attr('src', `backgrounds/${encodeURIComponent(state.currentImage)}`).show();
    } else {
        $('#lz-preview-before').hide();
    }

    // Update Preview After
    if (state._proposedImageBlob) {
        $('#lz-preview-after').attr('src', state._proposedImageBlob).show();
    } else {
        $('#lz-preview-after').hide();
    }
}

/**
 * Switches the active tab in the Workshop.
 * @param {string} tabName 'library' | 'architect' | 'explorer'
 */
export function switchTab(tabName) {
    $('.lz-tab-btn').removeClass('lz-active');
    $(`.lz-tab-btn[data-tab="${tabName}"]`).addClass('lz-active');
    $('.lz-tab-panel').addClass('lz-hidden');
    $(`#lz-tab-${tabName}`).removeClass('lz-hidden');

    if (tabName === 'library') renderLibrary();
    if (tabName === 'architect') renderArchitect();
}

/**
 * Primary entry point to show the workshop.
 * @param {string} tab Optional tab to open to.
 */
export function openWorkshop(tab = 'library') {
    injectWorkshop();
    $('#lz-workshop-overlay').removeClass('lz-hidden');
    switchTab(tab);
}

/**
 * Event Bindings for the Workshop UI.
 */
function bindEvents() {
    // Tab switching
    $('.lz-tab-btn').on('click', function() {
        switchTab($(this).data('tab'));
    });

    // Close
    $('#lz-workshop-close').on('click', () => {
        $('#lz-workshop-overlay').addClass('lz-hidden');
    });

    // Library: Edit
    $('.lz-library-list').on('click', '.lz-lib-edit', function(e) {
        e.stopPropagation();
        state._activeWorkshopKey = $(this).closest('.lz-library-item').data('key');
        switchTab('architect');
    });

    // Library: Delete
    $('.lz-library-list').on('click', '.lz-lib-delete', function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        if (confirm(`Delete location "${state._draftLocations[key].name}" from library?`)) {
            deleteDraftLocation(key);
            renderLibrary();
        }
    });

    // Library: Apply (Finalize)
    $('.lz-library-list').on('click', '.lz-lib-apply', async function(e) {
        e.stopPropagation();
        const key = $(this).closest('.lz-library-item').data('key');
        const { handleFinalizeWorkshop } = await import('../logic/commit.js');
        await handleFinalizeWorkshop(key);
        $('#lz-workshop-overlay').addClass('lz-hidden');
    });

    // Architect: Inputs Sync to Draft
    $('#lz-arch-name, #lz-arch-definition, #lz-arch-visuals').on('input', function() {
        const key = state._activeWorkshopKey;
        if (!key || !state._draftLocations[key]) return;
        
        const field = $(this).attr('id').replace('lz-arch-', '').replace('definition', 'description').replace('visuals', 'imagePrompt');
        state._draftLocations[key][field] = $(this).val();
    });

    // Architect: Targeted Regen (Spark icons)
    $('.lz-regen-spark').on('click', async function() {
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

    // Architect: Preview Generation
    $('#lz-arch-preview-btn').on('click', async function() {
        const key = state._activeWorkshopKey;
        $('#lz-preview-spinner').removeClass('lz-hidden');
        try {
            await previewProposedImage(key);
            renderArchitect();
        } finally {
            $('#lz-preview-spinner').addClass('lz-hidden');
        }
    });

    // Architect: Finalize
    $('#lz-arch-finalize').on('click', async function() {
        const key = state._activeWorkshopKey;
        const { handleFinalizeWorkshop } = await import('../logic/commit.js');
        try {
            $(this).prop('disabled', true).text('Generating High-Res...');
            await handleFinalizeWorkshop(key);
            $('#lz-workshop-overlay').addClass('lz-hidden');
        } finally {
            $(this).prop('disabled', false).text('Finalize & Apply');
        }
    });

    // Explorer: Discover
    $('#lz-explorer-go').on('click', async function() {
        const keywords = $('#lz-explorer-keywords').val();
        $('#lz-explorer-status').removeClass('lz-hidden');
        $(this).prop('disabled', true);
        
        try {
            const key = await discoverySearch(keywords);
            if (key) {
                switchTab('architect');
                $('#lz-explorer-keywords').val('');
            } else {
                alert('No location detected. Try being more specific or checking context.');
            }
        } finally {
            $('#lz-explorer-status').addClass('lz-hidden');
            $(this).prop('disabled', false);
        }
    });
}