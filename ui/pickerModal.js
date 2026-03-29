/**
 * @file data/default-user/extensions/localyze/ui/pickerModal.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Manual Override UI
 * @description
 * Searchable location picker modal. Allows the user to manually set the
 * active location and background at any time, bypassing LLM detection.
 * Mirrors the Step 3a (known location) pipeline from index.js, including
 * the two-write pattern for pending image generation.
 *
 * Auto-selects the current location when opened. Search filters by both
 * display name and key slug.
 *
 * @api-declaration
 * openPickerModal() — opens the picker; no-ops with toastr if library is empty
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [state.currentLocation, state.currentImage,
 *       state.fileIndex (indirect via applyLocation)]
 *     external_io: [message.extra.localyze (write), saveChatConditional(),
 *       generate() (via imageCache), set/clear (via background)]
 */
import { saveChatConditional } from '../../../../../script.js'
import { getContext } from '../../../../extensions.js'
import { state, updateState } from '../state.js'
import { set as setBg, clear as clearBg } from '../background.js'
import { generate } from '../imageCache.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function writeSceneRecord(messageId, record) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message) return
    message.extra = message.extra ?? {}
    message.extra.localyze = { type: 'scene', ...record }
    await saveChatConditional()
}

async function patchScene(messageId, filename) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message) return
    if (message.extra?.localyze) {
        message.extra.localyze.image = filename
        await saveChatConditional()
    }
}

async function applyLocation(key) {
    const filename = `localyze_${state.sessionId}_${key}.png`
    const def = state.locations[key]
    const context = getContext()
    const lastMsgId = context.chat.length - 1

    if (state.fileIndex.has(filename)) {
        setBg(filename)
        await writeSceneRecord(lastMsgId, { location: key, image: filename, bg_declined: false })
        updateState(key, filename)
    } else {
        clearBg()
        await writeSceneRecord(lastMsgId, { location: key, image: null, bg_declined: false })
        updateState(key, null)

        const capturedId = lastMsgId
        generate(key, def.imagePrompt, state.sessionId)
            .then(filename => {
                state.fileIndex.add(filename)
                patchScene(capturedId, filename)
                setBg(filename)
                state.currentImage = filename
            })
            .catch(err => console.error('[Localyze] Picker generate failed:', err))
    }
}

export function openPickerModal() {
    if (Object.keys(state.locations).length === 0) {
        toastr.info('No locations in library for this chat.', 'Localyze')
        return
    }

    const locationEntries = Object.entries(state.locations)
    const optionsHtml = locationEntries
        .map(([key, loc]) => `<option value="${escapeHtml(key)}">${escapeHtml(loc.name)}</option>`)
        .join('')

    const modal = $(`<div class="localyze-confirm-overlay" id="lz-picker-overlay">
        <div class="localyze-modal">
            <h3>Select Location</h3>
            <input type="text" id="lz-picker-search" class="text_pole" placeholder="Search locations..." style="width:100%; margin-bottom:6px;" />
            <select id="lz-picker-select" size="8">
                ${optionsHtml}
            </select>
            <div class="localyze-modal-actions">
                <button class="menu_button" id="lz-picker-cancel">Cancel</button>
                <button class="menu_button" id="lz-picker-apply">Set Background</button>
            </div>
        </div>
    </div>`)

    // Search filter
    modal.find('#lz-picker-search').on('input', function () {
        const query = this.value.toLowerCase()
        modal.find('#lz-picker-select option').each(function () {
            const text = $(this).text().toLowerCase()
            const val = $(this).val().toLowerCase()
            $(this).toggle(text.includes(query) || val.includes(query))
        })
    })

    modal.find('#lz-picker-cancel').on('click', () => {
        modal.remove()
    })

    modal.find('#lz-picker-apply').on('click', async () => {
        const selected = modal.find('#lz-picker-select').val()
        if (!selected) {
            toastr.warning('Please select a location.', 'Localyze')
            return
        }
        modal.remove()
        await applyLocation(selected)
    })

    $('body').append(modal)

    // Auto-select current location if present
    if (state.currentLocation) {
        modal.find(`#lz-picker-select option[value="${escapeHtml(state.currentLocation)}"]`).prop('selected', true)
    }
}
