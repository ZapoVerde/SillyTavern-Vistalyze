/**
 * @file data/default-user/extensions/vistalyze/ui/addModal.js
 * @stamp {"utc":"2026-05-03T15:10:00.000Z"}
 * @architectural-role New Location Review UI
 * @description
 * Modal for reviewing, editing, and approving a new location definition.
 * Includes data-i18n attributes for native SillyTavern translation support.
 *
 * @updates
 * - Integrated Hijack Pattern: Added "Select Existing Background" button.
 * - Added support for customBg property to bypass AI generation if a manual 
 *   file is picked from the ST gallery.
 *
 * @api-declaration
 * openAddModal(def) → Promise<{ name, key, description, imagePrompt, customBg } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [callPopup, fetchPreviewBlob, pickNativeBackground, i18n]
 */
import { callPopup } from '../../../../../script.js'
import { t, translate } from '../../../../i18n.js'
import { fetchPreviewBlob } from '../imageCache.js'
import { pickNativeBackground } from './bgHijacker.js'
import { escapeHtml, slugify } from '../utils/history.js'
import { error } from '../utils/logger.js'

/**
 * Opens the "Add Location" modal.
 * @param {object} def Initial definition from the AI detector.
 */
export async function openAddModal(def) {
    const popupPromise = callPopup(
        `<h3 data-i18n="vistalyze.add_modal.title">Add Location to Library</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_name">Location Name</label>
        <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_key">Key (Unique ID)</label>
        <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" readonly style="width:100%; opacity:0.6; cursor:not-allowed;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_definition">Definition (Logical Identity)</label>
        <input type="text" id="lz-add-definition" class="text_pole" value="${escapeHtml(def.description ?? '')}" style="width:100%;" />

        <div style="display:flex; align-items:center; justify-content:space-between; margin: 12px 0 4px;">
            <label style="font-size:0.88em;opacity:0.75;" data-i18n="vistalyze.add_modal.label_visuals">Visuals (Image Prompt)</label>
            <button class="menu_button" id="lz-add-hijack-btn" style="font-size:0.75em; padding: 2px 8px;">
                <i class="fa-solid fa-folder-open"></i> ${translate('Select Existing')}
            </button>
        </div>
        <textarea id="lz-add-visuals" class="text_pole" rows="3" style="width:100%; font-family:monospace; font-size:0.9em;">${escapeHtml(def.imagePrompt ?? '')}</textarea>
        <input type="hidden" id="lz-add-custom-bg" value="" />

        <div style="margin-top:10px;">
            <button class="menu_button" id="lz-add-preview-btn" data-i18n="vistalyze.add_modal.btn_preview">Generate Preview</button>
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

    // Bind hijack handler
    $('#lz-add-hijack-btn').on('click', async function () {
        const filename = await pickNativeBackground();
        if (filename) {
            $('#lz-add-custom-bg').val(filename);
            $('#lz-add-visuals').val('').prop('disabled', true).css('opacity', 0.5);
            $('#lz-preview-container').show();
            $('#lz-preview-img').attr('src', `backgrounds/${encodeURIComponent(filename)}`);
            $('#lz-preview-status').text(translate('Manual background selected'));
            $('#lz-add-preview-btn').prop('disabled', true);
        }
    });

    // Bind preview handler using the 'visuals' field
    $('#lz-add-preview-btn').on('click', async function () {
        const visuals = $('#lz-add-visuals').val().trim()
        if (!visuals) { 
            if (window.toastr) window.toastr.warning(t`Enter visuals description first.`, 'Vistalyze'); 
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
            if (window.toastr) window.toastr.warning(err.message, 'Vistalyze Preview')
        } finally {
            btn.prop('disabled', false).text(translate('Generate Preview'))
        }
    })

    const confirmed = await popupPromise

    if (!confirmed) return null

    const name = $('#lz-add-name').val().trim()
    const key  = $('#lz-add-key').val().trim()
    
    if (!name || !key) {
        if (window.toastr) window.toastr.warning(t`Name and Key are required.`, 'Vistalyze')
        return null
    }

    return {
        name,
        key,
        description: $('#lz-add-definition').val().trim(),
        imagePrompt: $('#lz-add-visuals').val().trim(),
        customBg: $('#lz-add-custom-bg').val().trim() || null
    }
}