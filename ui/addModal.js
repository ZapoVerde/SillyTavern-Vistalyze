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
function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildPollinationsUrl(imagePrompt) {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1920&height=1080&model=flux&nologo=true`
}

export function openAddModal(def) {
    return new Promise(resolve => {
        const modal = $(`<div class="localyze-confirm-overlay" id="lz-add-overlay">
            <div class="localyze-modal" style="min-width:500px; max-width:680px;">
                <h3>Add Location to Library</h3>

                <label for="lz-add-name">Name</label>
                <input type="text" id="lz-add-name" class="text_pole" value="${escapeHtml(def.name ?? '')}" />

                <label for="lz-add-key">Key (slug)</label>
                <input type="text" id="lz-add-key" class="text_pole" value="${escapeHtml(def.key ?? '')}" />

                <label for="lz-add-description">Description</label>
                <textarea id="lz-add-description" class="text_pole" rows="3" style="width:100%;">${escapeHtml(def.description ?? '')}</textarea>

                <label for="lz-add-prompt">Image Prompt</label>
                <textarea id="lz-add-prompt" class="text_pole" rows="3" style="width:100%;">${escapeHtml(def.imagePrompt ?? '')}</textarea>

                <div class="localyze-modal-actions" style="justify-content:flex-start; margin-bottom:8px;">
                    <button class="menu_button" id="lz-add-preview-btn">Generate Preview</button>
                </div>

                <div id="lz-preview-container" style="display:none;">
                    <img id="lz-preview-img" src="" alt="Preview" />
                </div>

                <div class="localyze-modal-actions">
                    <button class="menu_button" id="lz-add-cancel">Cancel</button>
                    <button class="menu_button" id="lz-add-approve">Approve</button>
                </div>
            </div>
        </div>`)

        // Auto-slugify name → key
        modal.find('#lz-add-name').on('input', function () {
            const slug = this.value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '')
            modal.find('#lz-add-key').val(slug)
        })

        // Generate preview
        modal.find('#lz-add-preview-btn').on('click', function () {
            const prompt = modal.find('#lz-add-prompt').val().trim()
            if (!prompt) {
                toastr.warning('Enter an image prompt first.', 'Localyze')
                return
            }
            const btn = $(this)
            btn.prop('disabled', true).text('Loading...')

            const url = buildPollinationsUrl(prompt)
            const previewContainer = modal.find('#lz-preview-container')
            const previewImg = modal.find('#lz-preview-img')

            previewContainer.show()
            previewImg.attr('src', url)

            previewImg.off('load error').on('load', () => {
                btn.prop('disabled', false).text('Generate Preview')
            }).on('error', () => {
                btn.prop('disabled', false).text('Generate Preview')
                toastr.warning('Preview failed to load.', 'Localyze')
            })
        })

        // Cancel
        modal.find('#lz-add-cancel').on('click', () => {
            modal.remove()
            resolve(null)
        })

        // Approve
        modal.find('#lz-add-approve').on('click', () => {
            const name = modal.find('#lz-add-name').val().trim()
            const key = modal.find('#lz-add-key').val().trim()
            const description = modal.find('#lz-add-description').val().trim()
            const imagePrompt = modal.find('#lz-add-prompt').val().trim()

            if (!name || !key) {
                toastr.warning('Name and Key are required.', 'Localyze')
                return
            }

            modal.remove()
            resolve({ name, key, description, imagePrompt })
        })

        $('body').append(modal)
        modal.find('#lz-add-name').focus()
    })
}
