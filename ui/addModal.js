/**
 * @file data/default-user/extensions/localyze/ui/addModal.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role New Location Review UI
 * @description
 * Modal for reviewing, editing, and approving a new location definition
 * before it is written to the chat DNA chain. Pre-filled by the Describer
 * LLM output. The user can edit all fields before approving.
 *
 * Key is auto-slugified from the name field as the user types. The
 * "Generate Preview" button sets an <img> src to the Pollinations URL
 * directly — the browser fetches and renders the preview asynchronously.
 *
 * Returns a Promise that resolves with the approved def object (name, key,
 * description, imagePrompt) or null if the user cancels.
 *
 * @api-declaration
 * openAddModal(def) → Promise<{ name, key, description, imagePrompt } | null>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [image.pollinations.ai (browser img src, no fetch())]
 */
import { callPopup } from '../../../../../script.js'
import { fetchPreviewBlob } from '../imageCache.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildPollinationsPreviewUrl(imagePrompt) {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=640&height=360&model=flux&nologo=true`
}

export async function openAddModal(def) {
    const popupPromise = callPopup(
        `<h3>Add Location to Library</h3>

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Name</label>
        <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Key (slug)</label>
        <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" style="width:100%;" />

        <label style="display:block;margin:8px 0 3px;font-size:0.88em;opacity:0.75;">Description</label>
        <textarea id="lz-add-description" class="text_pole" rows="3" style="width:100%;">${escapeHtml(def.description ?? '')}</textarea>

        <div style="margin-top:10px;">
            <button class="menu_button" id="lz-add-preview-btn">Generate Preview</button>
            <span id="lz-preview-status" style="font-size:0.82em;opacity:0.65;margin-left:8px;"></span>
        </div>
        <div id="lz-preview-container" style="display:none;margin-top:8px;">
            <img id="lz-preview-img" src="" alt="Preview" style="width:100%;border-radius:4px;" />
        </div>`,
        'confirm',
    )

    // Bind handlers immediately — callPopup renders synchronously before awaiting
    $('#lz-add-name').on('input', function () {
        $('#lz-add-key').val(
            this.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        )
    })

    $('#lz-add-preview-btn').on('click', async function () {
        const desc = $('#lz-add-description').val().trim()
        if (!desc) { toastr.warning('Enter a description first.', 'Localyze'); return }
        const btn = $(this)
        const status = $('#lz-preview-status')
        btn.prop('disabled', true).text('Fetching...')
        status.text('')
        console.debug('[Localyze:Preview] requesting preview for:', desc)
        try {
            const objectUrl = await fetchPreviewBlob(desc)
            $('#lz-preview-container').show()
            $('#lz-preview-img').attr('src', objectUrl)
            status.text('320×180 preview')
            console.debug('[Localyze:Preview] preview loaded OK')
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
        description: $('#lz-add-description').val().trim(),
    }
}
