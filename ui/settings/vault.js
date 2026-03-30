/**
 * @file data/default-user/extensions/localyze/ui/settings/vault.js
 * @stamp {"utc":"2026-04-01T13:20:00.000Z"}
 * @version 1.0.0
 * @architectural-role IO Executor / Vault Manager
 * @description
 * Handles secure storage of API keys and network connectivity tests.
 * This module interacts with the SillyTavern secret vault and the
 * Pollinations API.
 *
 * @api-declaration
 * updateKeyStatusIndicator() -> void
 * savePollinationsKey(key) -> Promise<void>
 * testPollinationsConnection() -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO Executor
 *     state_ownership: [none]
 *     external_io: [writeSecret, secret_state, fetchPreviewBlob, callPopup]
 */

import { callPopup } from '../../../../../../script.js';
import { writeSecret, secret_state } from '../../../secrets.js';
import { fetchPreviewBlob } from '../../imageCache.js';

const SECRET_KEY_NAME = 'api_key_pollinations';

/**
 * Updates the visual indicator of whether the API key is present in the vault.
 */
export function updateKeyStatusIndicator() {
    const $indicator = $('#lz-key-status-indicator');
    if (!$indicator.length) return;

    // secret_state is a globally updated masked registry in ST.
    const state = secret_state[SECRET_KEY_NAME];
    
    if (Array.isArray(state) && state.length > 0) {
        $indicator.html('<span style="color:var(--SmartThemeQuoteColor,#28a745);"><i class="fa-solid fa-circle-check"></i> Configured (Saved in Vault)</span>');
    } else {
        $indicator.html('<span style="color:var(--SmartThemeWarningColor,#ffc107);"><i class="fa-solid fa-triangle-exclamation"></i> Not Configured</span>');
    }
}

/**
 * Saves the provided key to the SillyTavern server vault.
 * @param {string} key 
 */
export async function savePollinationsKey(key) {
    const trimmed = (key ?? '').trim();
    if (!trimmed) {
        if (window.toastr) window.toastr.warning('Paste your Pollinations API key first.', 'Localyze');
        return;
    }

    await writeSecret(SECRET_KEY_NAME, trimmed, 'Localyze: Pollinations');
    updateKeyStatusIndicator();
    
    if (window.toastr) window.toastr.success('Pollinations key securely saved to vault.', 'Localyze');
}

/**
 * Executes a test image generation to verify API connectivity and key validity.
 */
export async function testPollinationsConnection() {
    const $btn = $('#lz-pollinations-check');
    const $status = $('#lz-pollinations-status');
    
    const originalText = $btn.text();
    $btn.prop('disabled', true).text('Generating...');
    $status.text('Fetching test image...');

    console.debug('[Localyze] Test connection: generating 320×180 test image');
    
    try {
        const objectUrl = await fetchPreviewBlob('a glowing lantern on a wooden tavern table, cinematic lighting');
        $status.text('Connected!');
        
        await callPopup(
            `<h3>Localyze — Connection OK</h3>
            <p style="opacity:0.65;font-size:0.88em;">Pollinations responded successfully. Your account is connected.</p>
            <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
            'text',
        );
    } catch (err) {
        $status.text(`Failed: ${err.message}`);
        console.error('[Localyze] Test connection failed:', err);
        if (window.toastr) window.toastr.error(err.message, 'Localyze');
    } finally {
        $btn.prop('disabled', false).text(originalText);
    }
}