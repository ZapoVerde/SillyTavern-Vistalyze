/**
 * @file data/default-user/extensions/localyze/ui/addModal.js
 * @stamp {"utc":"2026-04-03T11:30:00.000Z"}
 * @architectural-role New Location Review UI
 * @description
 * Modal for reviewing, editing, and approving a new location definition.
 * Updated to match standardized field names (description, imagePrompt)
 * and labels used throughout the engine.
 *
 * @updates
 * - Standardized Field Mapping: Uses 'description' and 'imagePrompt' to ensure
 *   data consistency with logic/commit.js and logic/pipeline.js.
 * - Standardized Labels: Renamed UI labels to "Definition" and "Visuals".
 * - Preview Support: Correctly utilizes the 'visuals' textarea for fetchPreviewBlob.
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

/**
 * Opens the "Add Location" modal.
 * @param {object} def Initial definition from the AI detector.
 */
export async function openAddModal(def) {
    const popupPromise = callPopup(
        `<h3>Add Location to Library</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Location Name</label>
        <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key (Unique ID)</label>
        <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" readonly style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Definition (Logical Identity)</label>
        <input type="text" id="lz-add-definition" class="text_pole" value="${escapeHtml(def.description ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Visuals (Image Prompt)</label>
        <textarea id="lz-add-visuals" class="text_pole" rows="3" style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(def.imagePrompt ?? '')}</textarea>

        <div style="margin-top:10px;">
            <button class="menu_button" id="lz-add-preview-btn">Generate Preview</button>
            <span id="lz-preview-status" style="font-size:0.82em;opacity:0.65;margin-left:8px;"></span>
        </div>
        <div id="lz-preview-container" style="display:none;margin-top:8px;">
            <img id="lz-preview-img" src="" alt="Preview" style="width:100%;border-radius:4px; aspect-ratio: 16/9; object-fit: cover;" />
        </div>`,
        'confirm',
    )

    // Bind slugification handler: name -> key
    $('#lz-add-name').on('input', function () {
        $('#lz-add-key').val(slugify(this.value))
    })

    // Bind preview handler using the 'visuals' field
    $('#lz-add-preview-btn').on('click', async function () {
        const visuals = $('#lz-add-visuals').val().trim()
        if (!visuals) { 
            if (window.toastr) window.toastr.warning('Enter visuals description first.', 'Localyze'); 
            return; 
        }
        
        const btn = $(this)
        const status = $('#lz-preview-status')
        btn.prop('disabled', true).text('Fetching...')
        status.text('')
        
        try {
            const objectUrl = await fetchPreviewBlob(visuals)
            $('#lz-preview-container').show()
            $('#lz-preview-img').attr('src', objectUrl)
            status.text('320×180 preview ready')
        } catch (err) {
            console.error('[Localyze:Preview] failed:', err)
            status.text(`Failed: ${err.message}`)
            if (window.toastr) window.toastr.warning(err.message, 'Localyze Preview')
        } finally {
            btn.prop('disabled', false).text('Generate Preview')
        }
    })

    const confirmed = await popupPromise

    if (!confirmed) return null

    const name = $('#lz-add-name').val().trim()
    const key  = $('#lz-add-key').val().trim()
    
    if (!name || !key) {
        if (window.toastr) window.toastr.warning('Name and Key are required.', 'Localyze')
        return null
    }

    return {
        name,
        key,
        description: $('#lz-add-definition').val().trim(),
        imagePrompt: $('#lz-add-visuals').val().trim(),
    }
}