/**
 * @file data/default-user/extensions/localyze/ui/addModal.js
 * @stamp {"utc":"2026-04-04T12:40:00.000Z"}
 * @architectural-role New Location Review UI
 * @description
 * Modal for reviewing, editing, and approving a new location definition.
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @updates
 * - Standardized Field Mapping: Uses 'description' and 'imagePrompt' to ensure
 *   data consistency with logic/commit.js and logic/pipeline.js.
 * - Standardized Labels: Renamed UI labels to "Definition" and "Visuals".
 * - Preview Support: Correctly utilizes the 'visuals' textarea for fetchPreviewBlob.
 * - Integrated translation-ready t and translate wrappers for user-facing strings.
 *
 * @api-declaration
 * openAddModal(def) → Promise<{ name, key, description, imagePrompt } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob, i18n]
 */
import { callPopup } from '../../../../../script.js'
import { t, translate } from '../../../../i18n.js'
import { fetchPreviewBlob } from '../imageCache.js'
import { escapeHtml, slugify } from '../utils/history.js'
import { error } from '../utils/logger.js'

/**
 * Opens the "Add Location" modal.
 * @param {object} def Initial definition from the AI detector.
 */
export async function openAddModal(def) {
    const popupPromise = callPopup(
        `<h3 data-i18n="localyze.add_modal.title">Add Location to Library</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="localyze.add_modal.label_name">Location Name</label>
        <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="localyze.add_modal.label_key">Key (Unique ID)</label>
        <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" readonly style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="localyze.add_modal.label_definition">Definition (Logical Identity)</label>
        <input type="text" id="lz-add-definition" class="text_pole" value="${escapeHtml(def.description ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="localyze.add_modal.label_visuals">Visuals (Image Prompt)</label>
        <textarea id="lz-add-visuals" class="text_pole" rows="3" style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(def.imagePrompt ?? '')}</textarea>

        <div style="margin-top:10px;">
            <button class="menu_button" id="lz-add-preview-btn" data-i18n="localyze.add_modal.btn_preview">Generate Preview</button>
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
            if (window.toastr) window.toastr.warning(t`Enter visuals description first.`, 'Localyze'); 
            return; 
        }
        
        const btn = $(this)
        const status = $('#lz-preview-status')
        btn.prop('disabled', true).text(translate('Fetching...'))
        status.text('')
        
        try {
            const objectUrl = await fetchPreviewBlob(visuals)
            $('#lz-preview-container').show()
            $('#lz-preview-img').attr('src', objectUrl)
            status.text(translate('320×180 preview ready'))
        } catch (err) {
            error('Preview', 'failed:', err)
            status.text(t`Failed: ${err.message}`)
            if (window.toastr) window.toastr.warning(err.message, 'Localyze Preview')
        } finally {
            btn.prop('disabled', false).text(translate('Generate Preview'))
        }
    })

    const confirmed = await popupPromise

    if (!confirmed) return null

    const name = $('#lz-add-name').val().trim()
    const key  = $('#lz-add-key').val().trim()
    
    if (!name || !key) {
        if (window.toastr) window.toastr.warning(t`Name and Key are required.`, 'Localyze')
        return null
    }

    return {
        name,
        key,
        description: $('#lz-add-definition').val().trim(),
        imagePrompt: $('#lz-add-visuals').val().trim(),
    }
}