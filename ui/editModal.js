/**
 * @file data/default-user/extensions/localyze/ui/editModal.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Location Maintenance UI
 * @description
 * Modal for editing existing location metadata (name and description).
 * 
 * In the Localyze "DNA Chain" architecture, an edit is expressed by writing
 * a new location_def record to the chat with the same 'key'. The forward-pass
 * reconstruction logic ensures the most recent definition for a key wins.
 * 
 * This UI allows users to:
 * 1. Change the display Name (the label shown in UI).
 * 2. Update the Description (the primary source for image prompts).
 * 3. Request an image regeneration based on the new description.
 * 
 * @api-declaration
 * openEditModal(def) → Promise<{ name, description, regenRequested } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob]
 */

import { callPopup } from '../../../../../script.js'
import { fetchPreviewBlob } from '../imageCache.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Description / Image Prompt</label>
        <textarea id="lz-edit-description" class="text_pole" rows="5" style="width:100%; font-size:0.9em;">${escapeHtml(def.description)}</textarea>

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

    // Handle preview generation
    $('#lz-edit-preview-btn').on('click', async function () {
        const desc = $('#lz-edit-description').val().trim()
        if (!desc) {
            toastr.warning('Description cannot be empty.', 'Localyze')
            return
        }

        const btn = $(this)
        const originalText = btn.text()
        btn.prop('disabled', true).text('Generating...')
        
        try {
            console.debug('[Localyze:Edit] Requesting preview for updated description.')
            const objectUrl = await fetchPreviewBlob(desc)
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
    const description = $('#lz-edit-description').val().trim()

    if (!name || !description) {
        toastr.warning('Name and Description are required to save changes.', 'Localyze')
        return null
    }

    return {
        key: def.key, // Keep key the same to patch the DNA chain
        name: name,
        description: description,
        imagePrompt: description, // Default to description as prompt
        regenRequested: $('#lz-edit-regen-check').prop('checked')
    }
}