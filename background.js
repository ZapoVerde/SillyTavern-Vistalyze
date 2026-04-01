/**
 * @file data/default-user/extensions/localyze/background.js
 * @stamp {"utc":"2026-04-03T10:15:00.000Z"}
 * @architectural-role ST Background API Wrapper
 * @description
 * Sets and clears the ST background using the chat_metadata lock mechanism.
 * 
 * @updates
 * - Implemented URL Cache Busting: Appends a timestamp (?v=) to background URLs.
 * - This ensures the UI updates immediately when an image is overwritten on the server.
 * - Maintains static filenames to prevent folder clutter.
 *
 * @api-declaration
 * set(filename)           — applies background with fade and cache-busting, sets managed lock
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

/**
 * Checks if the current background lock belongs to Localyze.
 * @returns {boolean}
 */
export function isManagedByLocalyze() {
    return !!chat_metadata[MANAGED_KEY]
}

/**
 * Safely applies a background image to the SillyTavern UI.
 * @param {string} filename The name of the image file in public/backgrounds/
 */
export function set(filename) {
    // 1. Guard: Prevent malformed requests if filename is missing
    if (!filename || typeof filename !== 'string') {
        console.debug('[Localyze:Background] Skipping setBg: filename is null or empty.');
        return;
    }

    // 2. Guard: Don't overwrite a manual user-set background lock
    if (chat_metadata[BG_KEY] && !isManagedByLocalyze()) {
        console.debug('[Localyze:Background] Skipping setBg: Manual user lock detected.');
        return;
    }

    // 3. Cache Busting: Append a timestamp to the URL.
    // This forces the browser to re-download the image even if the filename is identical 
    // to a previously cached version (useful for overwrites).
    const cacheBuster = `v=${Date.now()}`;
    const cssUrl = `url("backgrounds/${encodeURIComponent(filename)}?${cacheBuster}")`
    
    chat_metadata[BG_KEY] = cssUrl
    chat_metadata[MANAGED_KEY] = true

    // UI Fade Sequence
    $('#bg1').addClass('localyze-fade-out')
    setTimeout(() => {
        $('#bg1').css('background-image', cssUrl)
        $('#bg1').removeClass('localyze-fade-out').addClass('localyze-fade-in')
        
        // Cleanup transition classes after animation completes (~600ms total)
        setTimeout(() => $('#bg1').removeClass('localyze-fade-in'), 600)
    }, 300)

    saveMetadataDebounced()
}

/**
 * Removes the background image and releases the metadata lock.
 */
export function clear() {
    // Guard: Don't release the lock if we don't own it
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