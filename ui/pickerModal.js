/**
 * @file data/default-user/extensions/localyze/ui/pickerModal.js
 * @stamp {"utc":"2026-04-01T14:10:00.000Z"}
 * @version 1.3.0
 * @architectural-role Manual Override UI
 * @description
 * Searchable location picker modal. Allows the user to manually set the
 * active location or launch the location editor.
 * 
 * Version 1.3.0 Updates:
 * - Added "Force Detect New Location" button to the bottom of the picker.
 * - Updated openPickerModal signature to support manual detection callback.
 *
 * @api-declaration
 * openPickerModal(onEditCallback, onManualDetectCallback) — opens the picker.
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
                if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Localyze')
            })
    }
}

/**
 * Opens the location picker.
 * @param {Function} onEdit Callback function(key) triggered when the edit icon is clicked.
 * @param {Function} onManualDetect Callback triggered when the "Force Detect" button is clicked.
 */
export async function openPickerModal(onEdit, onManualDetect) {
    const locationEntries = Object.entries(state.locations)
    const listHtml = locationEntries.length > 0 
        ? locationEntries
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
        : '<p style="text-align:center; opacity:0.5; padding:20px;">Library is empty.</p>'

    const popupPromise = callPopup(
        `<h3>Location Library</h3>
        <input type="text" id="lz-picker-search" class="text_pole" placeholder="Search locations..." style="width:100%; margin-bottom:10px;" />
        <div id="lz-picker-list" style="max-height:300px; overflow-y:auto; background:rgba(0,0,0,0.2); border-radius:4px; padding:4px;">
            ${listHtml}
        </div>
        
        <div style="margin-top:16px; border-top:1px solid var(--SmartThemeBorderColor); padding-top:12px;">
            <button id="lz-picker-manual" class="menu_button" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Force Detect New Location</span>
            </button>
            <p style="font-size:0.75em; opacity:0.5; margin-top:6px; text-align:center;">
                Analyze the current context to discover a new location automatically.
            </p>
        </div>`,
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
        selectedKey = $(this).data('key')
        updateSelectionUI()
    })

    // Bind edit clicks
    $('#lz-picker-list').on('click', '.lz-edit-trigger', function(e) {
        e.stopPropagation()
        const key = $(this).data('key')
        $('#dialog_overlay .menu_button:last').click() // Close picker
        if (typeof onEdit === 'function') onEdit(key)
    })

    // Bind Force Detect click
    $('#lz-picker-manual').on('click', async function() {
        $('#dialog_overlay .menu_button:last').click() // Close picker
        if (typeof onManualDetect === 'function') {
            await onManualDetect();
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