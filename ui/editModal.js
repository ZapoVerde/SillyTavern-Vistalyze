/**
 * @file data/default-user/extensions/localyze/ui/editModal.js
 * @stamp {"utc":"2026-04-03T10:45:00.000Z"}
 * @architectural-role Location Maintenance UI
 * @description
 * Modal for editing existing location metadata. 
 *
 * @updates
 * - Standardized Field Mapping: Uses 'description' and 'imagePrompt' to match the 
 *   rest of the engine and prevent data loss during manual edits.
 * - Integrated Preview: Allows users to see a 320x180 preview of their visual 
 *   prompt changes before committing.
 * - Cache-Busting Awareness: Encourages "Update Background Image" selection 
 *   when visual prompts are changed.
 *
 * @api-declaration
 * openEditModal(def) → Promise<{ key, name, description, imagePrompt, regenRequested } | null>
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
 * @param {object} def The current location definition.
 * @returns {Promise<object|null>} The updated fields or null if cancelled.
 */
export async function openEditModal(def) {
    const popupPromise = callPopup(
        `<h3>Edit Location: ${escapeHtml(def.name)}</h3>
        <p style="font-size:0.82em; opacity:0.6; margin-bottom:12px;">
            Key: <code>${escapeHtml(def.key)}</code> (ID is permanent)
        </p>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Location Name</label>
        <input type="text" id="lz-edit-name" class="text_pole" value="${escapeHtml(def.name)}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Definition (Logical Identity)</label>
        <input type="text" id="lz-edit-definition" class="text_pole" value="${escapeHtml(def.description)}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Visuals (Image Prompt)</label>
        <textarea id="lz-edit-visuals" class="text_pole" rows="4" style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(def.imagePrompt)}</textarea>

        <div style="margin-top:12px; display:flex; align-items:center; gap:10px;">
            <button class="menu_button" id="lz-edit-preview-btn">Regenerate Preview</button>
            <label class="checkbox_label" style="font-size:0.85em; cursor:pointer;" title="If checked, the background will be overwritten with a new generation on save.">
                <input type="checkbox" id="lz-edit-regen-check" />
                <span>Update Background Image</span>
            </label>
        </div>

        <div id="lz-edit-preview-container" style="display:none; margin-top:12px; border-top: 1px solid var(--SmartThemeBorderColor);">
            <p style="font-size:0.75em; opacity:0.5; margin:8px 0;">320x180 preview result:</p>
            <img id="lz-edit-preview-img" src="" alt="Preview" style="width:100%; border-radius:4px; aspect-ratio: 16/9; object-fit: cover;" />
        </div>`,
        'confirm',
    )

    // Handle preview generation using the visuals field
    $('#lz-edit-preview-btn').on('click', async function () {
        const visuals = $('#lz-edit-visuals').val().trim()
        if (!visuals) {
            if (window.toastr) window.toastr.warning('Visuals description is required.', 'Localyze')
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
            
            // UX optimization: If the user explicitly previews, they almost 
            // certainly want to regenerate the high-res file on save.
            $('#lz-edit-regen-check').prop('checked', true)
        } catch (err) {
            console.error('[Localyze:Edit] Preview failed:', err)
            if (window.toastr) window.toastr.error(err.message, 'Localyze Preview')
        } finally {
            btn.prop('disabled', false).text(originalText)
        }
    })

    const confirmed = await popupPromise

    if (!confirmed) return null

    const name = $('#lz-edit-name').val().trim()
    const description = $('#lz-edit-definition').val().trim()
    const visuals = $('#lz-edit-visuals').val().trim()

    if (!name || !description || !visuals) {
        if (window.toastr) window.toastr.warning('Name, Definition, and Visuals are required.', 'Localyze')
        return null
    }

    return {
        key: def.key, // ID is permanent
        name: name,
        description: description,
        imagePrompt: visuals,
        regenRequested: $('#lz-edit-regen-check').prop('checked')
    }
}