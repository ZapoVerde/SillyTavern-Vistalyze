/**
 * @file data/default-user/extensions/localyze/ui/editModal.js
 * @stamp {"utc":"2025-05-15T13:00:00.000Z"}
 * @architectural-role Location Maintenance UI
 * @description
 * Modal for editing existing location metadata.
 * 
 * @updates
 * - Renamed labels to "Definition" and "Visuals" for functional clarity.
 * - Separated Definition (Step 2 Logic) from Visuals (Image Generation).
 * - Updated internal mapping to ensure edits persist correctly to the DNA chain.
 * 
 * @api-declaration
 * openEditModal(def) → Promise<{ name, description, imagePrompt, regenRequested } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob]
 */

import { callPopup } from '../../../../../script.js'
import { fetchPreviewBlob } from '../imageCache.js'
import { escapeHtml } from '../utils/history.js'

/**
 * Opens the edit modal for a specific location.
 * @param {object} def The current location definition from state.locations.
 * @returns {Promise<object|null>} The updated fields or null if cancelled.
 */
export async function openEditModal(def) {
    const popupPromise = callPopup(
        `<h3>Edit Location: ${escapeHtml(def.name)}</h3>
        <p style="font-size:0.82em; opacity:0.6; margin-bottom:12px;">
            Key: <code>${escapeHtml(def.key)}</code> (ID is permanent)
        </p>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Display Name</label>
        <input type="text" id="lz-edit-name" class="text_pole" value="${escapeHtml(def.name)}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Definition (Identity / Function)</label>
        <input type="text" id="lz-edit-definition" class="text_pole" value="${escapeHtml(def.description)}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Visuals (Image Generation Details)</label>
        <textarea id="lz-edit-visuals" class="text_pole" rows="4" style="width:100%; font-size:0.9em;">${escapeHtml(def.imagePrompt)}</textarea>

        <div style="margin-top:12px; display:flex; align-items:center; gap:10px;">
            <button class="menu_button" id="lz-edit-preview-btn">Regenerate Preview</button>
            <label class="checkbox_label" style="font-size:0.85em; cursor:pointer;" title="If checked, a new background file will be generated and saved on finish.">
                <input type="checkbox" id="lz-edit-regen-check" />
                <span>Update Background Image</span>
            </label>
        </div>

        <div id="lz-edit-preview-container" style="display:none; margin-top:12px; border-top: 1px solid var(--SmartThemeBorderColor);">
            <p style="font-size:0.75em; opacity:0.5; margin:8px 0;">New generation result (320x180):</p>
            <img id="lz-edit-preview-img" src="" alt="Preview" style="width:100%; border-radius:4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" />
        </div>`,
        'confirm',
    )

    // Handle preview generation using the visuals field
    $('#lz-edit-preview-btn').on('click', async function () {
        const visuals = $('#lz-edit-visuals').val().trim()
        if (!visuals) {
            toastr.warning('Visuals cannot be empty.', 'Localyze')
            return
        }

        const btn = $(this)
        const originalText = btn.text()
        btn.prop('disabled', true).text('Generating...')
        
        try {
            console.debug('[Localyze:Edit] Requesting preview for updated visuals.')
            const objectUrl = await fetchPreviewBlob(visuals)
            $('#lz-edit-preview-container').show()
            $('#lz-edit-preview-img').attr('src', objectUrl)
            // If the user previews, they likely want to regenerate the real file too
            $('#lz-edit-regen-check').prop('checked', true)
        } catch (err) {
            console.error('[Localyze:Edit] Preview failed:', err)
            toastr.error(err.message, 'Localyze Preview')
        } finally {
            btn.prop('disabled', false).text(originalText)
        }
    })

    const confirmed = await popupPromise

    if (!confirmed) return null

    const name = $('#lz-edit-name').val().trim()
    const definition = $('#lz-edit-definition').val().trim()
    const visuals = $('#lz-edit-visuals').val().trim()

    if (!name || !definition || !visuals) {
        toastr.warning('Name, Definition, and Visuals are required to save changes.', 'Localyze')
        return null
    }

    return {
        key: def.key, // Keep key the same to patch the DNA chain
        name: name,
        description: definition,
        imagePrompt: visuals,
        regenRequested: $('#lz-edit-regen-check').prop('checked')
    }
}