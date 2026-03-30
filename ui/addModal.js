/**
 * @file data/default-user/extensions/localyze/ui/addModal.js
 * @stamp {"utc":"2026-04-01T12:15:00.000Z"}
 * @version 1.1.0
 * @architectural-role New Location Review UI
 * @description
 * Modal for reviewing, editing, and approving a new location definition.
 * 
 * Version 1.1.0 Updates:
 * - Uses programmatic slugify() for deterministic key generation.
 * - Displays 'essence' (semantic) and 'atmosphere' (visual) separately.
 * - Key field is auto-updated based on Name but remains visible for transparency.
 *
 * @api-declaration
 * openAddModal(def) → Promise<{ name, key, description, imagePrompt } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob]
 */
import { callPopup } from '../../../../../script.js'
import { fetchPreviewBlob } from '../imageCache.js'
import { escapeHtml, slugify } from '../utils/history.js'

export async function openAddModal(def) {
    const popupPromise = callPopup(
        `<h3>Add Location to Library</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Name</label>
        <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key (Automated Slug)</label>
        <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" readonly style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Essence (What is this place?)</label>
        <input type="text" id="lz-add-essence" class="text_pole" value="${escapeHtml(def.description ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Atmosphere (Visual Image Prompt)</label>
        <textarea id="lz-add-atmosphere" class="text_pole" rows="3" style="width:100%;">${escapeHtml(def.imagePrompt ?? '')}</textarea>

        <div style="margin-top:10px;">
            <button class="menu_button" id="lz-add-preview-btn">Generate Preview</button>
            <span id="lz-preview-status" style="font-size:0.82em;opacity:0.65;margin-left:8px;"></span>
        </div>
        <div id="lz-preview-container" style="display:none;margin-top:8px;">
            <img id="lz-preview-img" src="" alt="Preview" style="width:100%;border-radius:4px;" />
        </div>`,
        'confirm',
    )

    // Bind slugification handler: name -> key
    $('#lz-add-name').on('input', function () {
        $('#lz-add-key').val(slugify(this.value))
    })

    // Bind preview handler using the 'atmosphere' field
    $('#lz-add-preview-btn').on('click', async function () {
        const atmosphere = $('#lz-add-atmosphere').val().trim()
        if (!atmosphere) { toastr.warning('Enter an atmosphere description first.', 'Localyze'); return }
        const btn = $(this)
        const status = $('#lz-preview-status')
        btn.prop('disabled', true).text('Fetching...')
        status.text('')
        
        try {
            const objectUrl = await fetchPreviewBlob(atmosphere)
            $('#lz-preview-container').show()
            $('#lz-preview-img').attr('src', objectUrl)
            status.text('320×180 preview')
        } catch (err) {
            console.error('[Localyze:Preview] failed:', err)
            status.text(`Failed: ${err.message}`)
            toastr.warning(err.message, 'Localyze Preview')
        } finally {
            btn.prop('disabled', false).text('Generate Preview')
        }
    })

    const confirmed = await popupPromise

    if (!confirmed) return null

    const name = $('#lz-add-name').val().trim()
    const key  = $('#lz-add-key').val().trim()
    if (!name || !key) {
        toastr.warning('Name and Key are required.', 'Localyze')
        return null
    }

    return {
        name,
        key,
        description: $('#lz-add-essence').val().trim(),
        imagePrompt: $('#lz-add-atmosphere').val().trim(),
    }
}