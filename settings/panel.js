/**
 * @file data/default-user/extensions/localyze/settings/panel.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Settings UI
 * @description
 * Injects the Localyze settings panel into ST's extensions drawer
 * (#extensions_settings). Renders one prompt + connection profile pair for
 * each of the three LLM calls: Boolean, Classifier, Describer.
 *
 * Prompt editing opens a full-screen popup (same pattern as canonize) so the
 * user can comfortably edit multi-line prompts. Changes are saved live.
 *
 * Connection profile dropdowns are managed by ConnectionManagerRequestService
 * .handleDropdown(). If the connection-manager extension is disabled or
 * unavailable, the dropdown row is hidden and the call falls back to
 * generateQuietPrompt.
 *
 * @api-declaration
 * injectSettingsPanel() — idempotent; appends panel to #extensions_settings
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [extension_settings.localyze (write via save handlers)]
 *     external_io: [#extensions_settings DOM (write), saveSettingsDebounced(),
 *       ConnectionManagerRequestService.handleDropdown(), callPopup()]
 */
import { saveSettingsDebounced, callPopup } from '../../../../../script.js'
import { writeSecret, findSecret, secret_state } from '../../../../secrets.js'
import { extension_settings } from '../../../../extensions.js'
import { ConnectionManagerRequestService } from '../../../shared.js'
import {
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_DESCRIBER_PROMPT,
    POLLINATIONS_SECRET_KEY,
} from '../defaults.js'

// ─── Settings accessor ────────────────────────────────────────────────────────

function getSettings() {
    if (!extension_settings.localyze) extension_settings.localyze = {}
    return extension_settings.localyze
}

// ─── Prompt popup ─────────────────────────────────────────────────────────────

async function openPromptPopup(settingsKey, title, defaultValue) {
    const s = getSettings()
    const current = s[settingsKey] ?? defaultValue
    const result = await callPopup(
        `<div style="display:flex;flex-direction:column;gap:8px;">
            <strong>${title}</strong>
            <small style="opacity:0.65;">Use {{placeholders}} as shown in the default prompt.</small>
            <textarea id="lz-prompt-editor" class="text_pole" rows="16" style="width:100%;font-family:monospace;font-size:0.88em;">${escapeHtml(current)}</textarea>
            <button id="lz-prompt-reset" class="menu_button" style="align-self:flex-start;">Reset to Default</button>
        </div>`,
        'input',
        current,
    )
    // callPopup 'input' type returns the textarea value on confirm, null on cancel
    if (result === null || result === false) return
    s[settingsKey] = result.trim() || defaultValue
    saveSettingsDebounced()
    refreshPanel()
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildCallRow(id, label, promptKey, profileKey) {
    return `
    <div class="lz-call-row" style="margin-bottom:16px;padding:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <strong style="font-size:0.95em;">${label}</strong>
            <button class="menu_button lz-open-prompt" data-prompt-key="${promptKey}" style="font-size:0.8em;padding:2px 8px;">Edit Prompt</button>
        </div>
        <div class="lz-profile-row" style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;">Connection:</label>
            <select id="lz-profile-${id}" class="text_pole lz-profile-select" data-profile-key="${profileKey}" style="flex:1;"></select>
        </div>
    </div>`
}

function buildPanelHTML() {
    return `
    <div id="lz-settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-location-dot"></i> Localyze</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p style="font-size:0.85em;opacity:0.7;margin:0 0 14px;">
                    Each AI call uses its own prompt template and connection profile.
                    Leave connection blank to use the chat's active API.
                </p>
                ${buildCallRow('boolean',    'Step 1 — Location Changed? (Boolean)',   'booleanPrompt',    'booleanProfileId')}
                ${buildCallRow('classifier', 'Step 2 — Which Location? (Classifier)', 'classifierPrompt', 'classifierProfileId')}
                ${buildCallRow('describer',  'Step 3 — Describe New Location',        'describerPrompt',  'describerProfileId')}
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <strong style="font-size:0.95em;">Pollinations User Token</strong>
                    <p style="font-size:0.83em;opacity:0.65;margin:4px 0 8px;">
                        Optional. Your personal Pollinations token unlocks higher rate limits.
                        Stored securely in ST's secrets — never written to settings.
                    </p>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <input type="password" id="lz-pollinations-key" class="text_pole"
                            placeholder="Paste token here…" autocomplete="off"
                            style="flex:1;" />
                        <span id="lz-pollinations-status" style="font-size:0.8em;opacity:0.6;white-space:nowrap;"></span>
                    </div>
                </div>
            </div>
        </div>
    </div>`
}

// ─── Connection dropdowns ─────────────────────────────────────────────────────

function initDropdowns() {
    const s = getSettings()
    const pairs = [
        { selector: '#lz-profile-boolean',    key: 'booleanProfileId'    },
        { selector: '#lz-profile-classifier', key: 'classifierProfileId' },
        { selector: '#lz-profile-describer',  key: 'describerProfileId'  },
    ]
    for (const { selector, key } of pairs) {
        try {
            ConnectionManagerRequestService.handleDropdown(
                selector,
                s[key] ?? '',
                (profile) => {
                    s[key] = profile?.id ?? null
                    saveSettingsDebounced()
                },
            )
        } catch {
            // Connection Manager unavailable — hide the row gracefully
            $(selector).closest('.lz-profile-row').hide()
        }
    }
}

// ─── Event bindings ───────────────────────────────────────────────────────────

function bindHandlers() {
    const promptDefaults = {
        booleanPrompt:    DEFAULT_BOOLEAN_PROMPT,
        classifierPrompt: DEFAULT_CLASSIFIER_PROMPT,
        describerPrompt:  DEFAULT_DESCRIBER_PROMPT,
    }
    const promptTitles = {
        booleanPrompt:    'Boolean Prompt — Has Location Changed?',
        classifierPrompt: 'Classifier Prompt — Which Location Key?',
        describerPrompt:  'Describer Prompt — Describe New Location',
    }

    $('#lz-settings').on('click', '.lz-open-prompt', function () {
        const key = $(this).data('prompt-key')
        openPromptPopup(key, promptTitles[key], promptDefaults[key])
    })

    // Pollinations token — write to ST secrets on input, clear on empty
    $('#lz-settings').on('input', '#lz-pollinations-key', async function () {
        const val = this.value.trim()
        await writeSecret(POLLINATIONS_SECRET_KEY, val)
        updateKeyStatus()
    })
}

function updateKeyStatus() {
    const isSet = !!(secret_state[POLLINATIONS_SECRET_KEY]?.length)
    $('#lz-pollinations-status').text(isSet ? 'Token saved' : 'No token set')
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

function refreshPanel() {
    // Re-init dropdowns with current saved values after a prompt save
    initDropdowns()
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function injectSettingsPanel() {
    if ($('#lz-settings').length) return

    const $parent = $('#extensions_settings')
    if (!$parent.length) {
        console.warn('[Localyze] #extensions_settings not found — settings panel not injected')
        return
    }

    $parent.append(buildPanelHTML())
    bindHandlers()
    initDropdowns()
    updateKeyStatus()
}
