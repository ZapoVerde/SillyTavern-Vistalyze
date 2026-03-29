/**
 * @file data/default-user/extensions/localyze/background.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role ST Background API Wrapper
 * @description
 * Sets and clears the ST background using the chat_metadata lock mechanism
 * (Option A). Writes to chat_metadata['custom_background'] and a managed
 * marker key so the guard can distinguish Localyze-owned locks from manually
 * set user backgrounds.
 *
 * Does NOT call the unexported setBackground() from backgrounds.js. Instead
 * it writes directly to chat_metadata and manipulates #bg1 — matching exactly
 * what ST does internally when a background is locked to a chat.
 *
 * Fade transitions are owned here via CSS classes localyze-fade-out/in
 * defined in style.css. The set() → fade-out → swap → fade-in sequence
 * takes ~600ms total; clear() fades out and leaves blank.
 *
 * @api-declaration
 * set(filename)           — applies background with fade, sets managed lock
 * clear()                 — removes background with fade, releases lock
 * isManagedByLocalyze()   — true if the current bg lock was set by us
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [chat_metadata['custom_background'] (write),
 *       chat_metadata['localyze_managed'] (write),
 *       #bg1 DOM (write), saveMetadataDebounced()]
 */
import { chat_metadata } from '../../../../script.js'
import { saveMetadataDebounced } from '../../../extensions.js'

const BG_KEY = 'custom_background'
const MANAGED_KEY = 'localyze_managed'

export function isManagedByLocalyze() {
    return !!chat_metadata[MANAGED_KEY]
}

export function set(filename) {
    // Guard: don't overwrite a user-set manual lock
    if (chat_metadata[BG_KEY] && !isManagedByLocalyze()) return

    const cssUrl = `url("backgrounds/${encodeURIComponent(filename)}")`
    chat_metadata[BG_KEY] = cssUrl
    chat_metadata[MANAGED_KEY] = true

    $('#bg1').addClass('localyze-fade-out')
    setTimeout(() => {
        $('#bg1').css('background-image', cssUrl)
        $('#bg1').removeClass('localyze-fade-out').addClass('localyze-fade-in')
        setTimeout(() => $('#bg1').removeClass('localyze-fade-in'), 600)
    }, 300)

    saveMetadataDebounced()
}

export function clear() {
    if (chat_metadata[BG_KEY] && !isManagedByLocalyze()) return

    delete chat_metadata[BG_KEY]
    delete chat_metadata[MANAGED_KEY]

    $('#bg1').addClass('localyze-fade-out')
    setTimeout(() => {
        $('#bg1').css('background-image', '')
        $('#bg1').removeClass('localyze-fade-out')
    }, 300)

    saveMetadataDebounced()
}
