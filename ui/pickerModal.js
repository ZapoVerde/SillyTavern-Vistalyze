/**
 * @file data/default-user/extensions/localyze/ui/pickerModal.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.2.0
 * @architectural-role Manual Override UI
 * @description
 * Searchable location picker modal. Allows the user to manually set the
 * active location or launch the location editor.
 * 
 * Refactored in 1.2.0 to use a custom div-based list instead of a select 
 * element, enabling per-item action buttons (Edit).
 *
 * @api-declaration
 * openPickerModal(onEditCallback) — opens the picker.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [state.currentLocation, state.currentImage]
 *     external_io: [message.extra.localyze (write), saveChatConditional(),
 *       generate(), set/clear, callPopup]
 */
import { saveChatConditional, callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
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
            .catch(err => {
                console.error('[Localyze] Picker generate failed:', err)
                toastr.error(`Generation failed: ${err.message}`, 'Localyze')
            })
    }
}

/**
 * Opens the location picker.
 * @param {Function} onEdit An optional callback function(key) triggered when the edit icon is clicked.
 */
export async function openPickerModal(onEdit) {
    if (Object.keys(state.locations).length === 0) {
        toastr.info('No locations in library for this chat.', 'Localyze')
        return
    }

    const locationEntries = Object.entries(state.locations)
    const listHtml = locationEntries
        .map(([key, loc]) => `
            <div class="lz-picker-item" data-key="${escapeHtml(key)}" 
                 style="display:flex; align-items:center; justify-content:space-between; padding:8px; cursor:pointer; border-bottom:1px solid var(--SmartThemeBorderColor); border-radius:4px;">
                <div class="lz-picker-label" style="flex:1; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-location-dot" style="opacity:0.5; font-size:0.8em;"></i>
                    <span>${escapeHtml(loc.name)}</span>
                </div>
                <div class="lz-picker-actions" style="display:flex; gap:12px;">
                    <i class="fa-solid fa-pen-to-square lz-edit-trigger" data-key="${escapeHtml(key)}" 
                       title="Edit Location" style="opacity:0.6; padding:4px;"></i>
                </div>
            </div>
        `).join('')

    const popupPromise = callPopup(
        `<h3>Select Location</h3>
        <input type="text" id="lz-picker-search" class="text_pole" placeholder="Search locations..." style="width:100%; margin-bottom:10px;" />
        <div id="lz-picker-list" style="max-height:300px; overflow-y:auto; background:rgba(0,0,0,0.2); border-radius:4px; padding:4px;">
            ${listHtml}
        </div>
        <p style="font-size:0.8em; opacity:0.5; margin-top:10px;">Click a location name to apply it, or the pencil to edit it.</p>`,
        'confirm',
    )

    // Selection state
    let selectedKey = state.currentLocation

    function updateSelectionUI() {
        $('.lz-picker-item').css('background', 'transparent')
        if (selectedKey) {
            $(`.lz-picker-item[data-key="${CSS.escape(selectedKey)}"]`).css('background', 'var(--SmartThemeQuoteColor)')
        }
    }

    // Bind item clicks
    $('#lz-picker-list').on('click', '.lz-picker-item', function(e) {
        // If clicking the name/row, select it
        selectedKey = $(this).data('key')
        updateSelectionUI()
    })

    // Bind edit clicks
    $('#lz-picker-list').on('click', '.lz-edit-trigger', function(e) {
        e.stopPropagation() // Don't trigger the row selection
        const key = $(this).data('key')
        
        // Close the current picker modal
        // In SillyTavern, triggering the 'cancel' button on the current dialog is the cleanest exit
        $('#dialog_overlay .menu_button:last').click()
        
        if (typeof onEdit === 'function') {
            onEdit(key)
        }
    })

    // Search filter
    $('#lz-picker-search').on('input', function () {
        const query = this.value.toLowerCase()
        $('.lz-picker-item').each(function () {
            const text = $(this).find('.lz-picker-label span').text().toLowerCase()
            const key = $(this).data('key').toLowerCase()
            $(this).toggle(text.includes(query) || key.includes(query))
        })
    })

    // Initial UI state
    setTimeout(updateSelectionUI, 10)

    const confirmed = await popupPromise

    if (!confirmed || !selectedKey) return

    await applyLocation(selectedKey)
}