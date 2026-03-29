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
import { saveChatConditional, callPopup } from '../../../../../script.js'
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
        generate(key, def, state.sessionId)
            .then(filename => {
                state.fileIndex.add(filename)
                patchScene(capturedId, filename)
                setBg(filename)
                state.currentImage = filename
            })
            .catch(err => console.error('[Localyze] Picker generate failed:', err))
    }
}

export async function openPickerModal() {
    if (Object.keys(state.locations).length === 0) {
        toastr.info('No locations in library for this chat.', 'Localyze')
        return
    }

    const locationEntries = Object.entries(state.locations)
    const optionsHtml = locationEntries
        .map(([key, loc]) => `<option value="${escapeHtml(key)}">${escapeHtml(loc.name)}</option>`)
        .join('')

    const confirmed = await callPopup(
        `<h3>Select Location</h3>
        <input type="text" id="lz-picker-search" class="text_pole" placeholder="Search locations..." style="width:100%; margin-bottom:6px;" />
        <select id="lz-picker-select" class="text_pole" size="8" style="width:100%;">
            ${optionsHtml}
        </select>`,
        'confirm',
    )

    // Bind search filter immediately after popup renders
    $('#lz-picker-search').on('input', function () {
        const query = this.value.toLowerCase()
        $('#lz-picker-select option').each(function () {
            $(this).toggle(
                $(this).text().toLowerCase().includes(query) ||
                $(this).val().toLowerCase().includes(query)
            )
        })
    })

    // Auto-select current location
    if (state.currentLocation) {
        $(`#lz-picker-select option[value="${escapeHtml(state.currentLocation)}"]`).prop('selected', true)
    }

    if (!confirmed) return

    const selected = $('#lz-picker-select').val()
    if (!selected) {
        toastr.warning('Please select a location.', 'Localyze')
        return
    }
    await applyLocation(selected)
}
