/**
 * @file data/default-user/extensions/localyze/settings/panel.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.1.0
 * @architectural-role Settings UI
 * @description
 * Injects the Localyze settings panel into ST's extensions drawer.
 *
 * Version 1.1.0 Updates:
 * - Migrated key storage to ST's async Secret Service.
 * - Added visual status indicator for the encrypted key.
 * - Removed plaintext key population to prevent leakage.
 *
 * @api-declaration
 * injectSettingsPanel() — idempotent; appends panel to #extensions_settings
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership:[extension_settings.localyze (write via save handlers)]
 *     external_io:[#extensions_settings DOM (write), saveSettingsDebounced(),
 *       ConnectionManagerRequestService.handleDropdown(), callPopup(),
 *       getSecret(), setSecret()]
 */
import { saveSettingsDebounced, callPopup } from '../../../../../script.js'
import { extension_settings, getSecret, setSecret } from '../../../../extensions.js'
import { ConnectionManagerRequestService } from '../../../shared.js'
import {
    DEFAULT_BOOLEAN_PROMPT,
    DEFAULT_CLASSIFIER_PROMPT,
    DEFAULT_DESCRIBER_PROMPT,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEFAULT_IMAGE_MODEL,
    POLLINATIONS_MODELS,
} from '../defaults.js'
import { fetchPreviewBlob } from '../imageCache.js'

const SECRET_KEY_NAME = 'localyze_pollinations_key'

// ─── Settings accessor ────────────────────────────────────────────────────────

function getSettings() {
    if (!extension_settings.localyze) extension_settings.localyze = {}
    return extension_settings.localyze
}

// ─── Prompt popup ─────────────────────────────────────────────────────────────

async function openPromptPopup(settingsKey, title, defaultValue) {
    const s = getSettings()
    const current = s[settingsKey] ?? defaultValue
    const popupPromise = callPopup(
        `<div style="display:flex;flex-direction:column;gap:8px;">
            <strong>${title}</strong>
            <small style="opacity:0.65;">Use {{placeholders}} as shown in the default prompt.</small>
            <textarea id="lz-prompt-editor" class="text_pole" rows="16" style="width:100%;font-family:monospace;font-size:0.88em;">${escapeHtml(current)}</textarea>
            <button id="lz-prompt-reset" class="menu_button" style="align-self:flex-start;">Reset to Default</button>
        </div>`,
        'text',
    )
    // Bind reset after callPopup renders the DOM synchronously
    $('#lz-prompt-reset').on('click', () => $('#lz-prompt-editor').val(defaultValue))
    const confirmed = await popupPromise
    if (!confirmed) return
    const value = $('#lz-prompt-editor').val()
    s[settingsKey] = (value ?? '').trim() || defaultValue
    saveSettingsDebounced()
    refreshPanel()
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildCallRow(id, label, promptKey, profileKey, historyKey = null) {
    const historyRow = historyKey ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;">History:</label>
            <input id="lz-history-${id}" type="number" min="0" step="1"
                class="text_pole lz-history-input" data-history-key="${historyKey}"
                style="width:60px;" />
            <span style="font-size:0.83em;opacity:0.6;">pairs (0 = off)</span>
        </div>` : ''
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
        ${historyRow}
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
                ${buildCallRow('boolean',    'Step 1 — Location Changed? (Boolean)',   'booleanPrompt',    'booleanProfileId',    'booleanHistory')}
                ${buildCallRow('classifier', 'Step 2 — Which Location? (Classifier)', 'classifierPrompt', 'classifierProfileId', 'classifierHistory')}
                ${buildCallRow('describer',  'Step 3 — Describe New Location',        'describerPrompt',  'describerProfileId')}
                
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <strong style="font-size:0.95em;">Image Generation</strong>
                    <p style="font-size:0.83em;opacity:0.65;margin:4px 0 12px;">
                        Images are generated via Pollinations. Enter your API key (sk_...) to securely save it to your server vault.
                    </p>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;">API Key:</label>
                        <input type="password" id="lz-pollinations-key" class="text_pole" placeholder="Enter new sk_ key..." style="flex:1;" />
                        <button class="menu_button" id="lz-pollinations-save" style="white-space:nowrap;">Save to Vault</button>
                    </div>
                    <div id="lz-key-status-indicator" style="font-size:0.82em; margin-left:88px; margin-bottom:12px;">
                        <span style="opacity:0.6;"><i class="fa-solid fa-spinner fa-spin"></i> Checking vault...</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <button class="menu_button" id="lz-pollinations-check">Test Connection</button>
                    </div>
                    <div id="lz-pollinations-status" style="font-size:0.82em;opacity:0.65;margin-bottom:8px;"></div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;">Model:</label>
                        <select id="lz-image-model" class="text_pole" style="flex:1;">
                            ${POLLINATIONS_MODELS.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;min-width:80px;">Prompt:</label>
                        <button class="menu_button lz-open-prompt" data-prompt-key="imagePromptTemplate"
                            style="font-size:0.8em;padding:2px 8px;">Edit Template</button>
                        <span style="font-size:0.78em;opacity:0.55;">{{image_prompt}} {{name}} {{description}}</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;">
                        <label class="checkbox_label" style="font-size:0.85em;cursor:pointer;">
                            <input type="checkbox" id="lz-dev-mode" />
                            <span>Dev mode</span>
                        </label>
                        <span style="font-size:0.78em;opacity:0.55;">Generates 320×180 preview images to save credits</span>
                    </div>
                </div>
            </div>
        </div>
    </div>`
}

// ─── Connection dropdowns ─────────────────────────────────────────────────────

function initDropdowns() {
    const s = getSettings()
    const pairs =[
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

// ─── Secret Key Status ────────────────────────────────────────────────────────

async function updateKeyStatusIndicator() {
    const $indicator = $('#lz-key-status-indicator')
    try {
        const key = await getSecret(SECRET_KEY_NAME)
        if (key) {
            $indicator.html('<span style="color:var(--SmartThemeQuoteColor,#28a745);"><i class="fa-solid fa-circle-check"></i> Configured (Encrypted)</span>')
        } else {
            $indicator.html('<span style="color:var(--SmartThemeWarningColor,#ffc107);"><i class="fa-solid fa-triangle-exclamation"></i> Not Configured</span>')
        }
    } catch (err) {
        $indicator.html('<span style="color:var(--SmartThemeErrorColor,#dc3545);"><i class="fa-solid fa-circle-xmark"></i> Vault Error</span>')
    }
}

// ─── Event bindings ───────────────────────────────────────────────────────────

function populateHistoryInputs() {
    const s = getSettings()
    $('#lz-settings').find('.lz-history-input').each(function () {
        const key = $(this).data('history-key')
        $(this).val(s[key] ?? 0)
    })
}

function bindHandlers() {
    const promptDefaults = {
        booleanPrompt:       DEFAULT_BOOLEAN_PROMPT,
        classifierPrompt:    DEFAULT_CLASSIFIER_PROMPT,
        describerPrompt:     DEFAULT_DESCRIBER_PROMPT,
        imagePromptTemplate: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    }
    const promptTitles = {
        booleanPrompt:       'Boolean Prompt — Has Location Changed?',
        classifierPrompt:    'Classifier Prompt — Which Location Key?',
        describerPrompt:     'Describer Prompt — Describe New Location',
        imagePromptTemplate: 'Image Prompt Template — {{image_prompt}} {{name}} {{description}}',
    }

    $('#lz-settings').on('click', '.lz-open-prompt', function () {
        const key = $(this).data('prompt-key')
        openPromptPopup(key, promptTitles[key], promptDefaults[key])
    })

    $('#lz-settings').on('input', '.lz-history-input', function () {
        const key = $(this).data('history-key')
        getSettings()[key] = Math.max(0, parseInt($(this).val()) || 0)
        saveSettingsDebounced()
    })

    $('#lz-settings').on('click', '#lz-pollinations-save', async function () {
        const key = $('#lz-pollinations-key').val().trim()
        if (!key) { toastr.warning('Paste your Pollinations API key first.', 'Localyze'); return }
        
        await setSecret(SECRET_KEY_NAME, key)
        $('#lz-pollinations-key').val('')
        
        toastr.success('Pollinations key securely saved to vault.', 'Localyze')
        updateKeyStatusIndicator()
    })

    $('#lz-settings').on('click', '#lz-pollinations-check', async function () {
        const btn = $(this)
        const status = $('#lz-pollinations-status')
        btn.prop('disabled', true).text('Generating...')
        status.text('Fetching test image...')
        console.debug('[Localyze] Test connection: generating 320×180 test image')
        try {
            const objectUrl = await fetchPreviewBlob('a glowing lantern on a wooden tavern table, cinematic lighting')
            status.text('Connected!')
            console.debug('[Localyze] Test connection: success')
            await callPopup(
                `<h3>Localyze — Connection OK</h3>
                <p style="opacity:0.65;font-size:0.88em;">Pollinations responded successfully. Your account is connected.</p>
                <img src="${objectUrl}" style="width:100%;border-radius:6px;margin-top:8px;" />`,
                'text',
            )
        } catch (err) {
            status.text(`Failed: ${err.message}`)
            console.error('[Localyze] Test connection failed:', err)
            toastr.error(err.message, 'Localyze')
        } finally {
            btn.prop('disabled', false).text('Test Connection')
        }
    })

    $('#lz-settings').on('change', '#lz-image-model', function () {
        getSettings().imageModel = $(this).val() || DEFAULT_IMAGE_MODEL
        saveSettingsDebounced()
    })

    $('#lz-settings').on('change', '#lz-dev-mode', function () {
        getSettings().devMode = $(this).prop('checked')
        saveSettingsDebounced()
    })
}

// ─── Image settings population ────────────────────────────────────────────────

function populateImageSettings() {
    const s = getSettings()
    $('#lz-image-model').val(s.imageModel ?? DEFAULT_IMAGE_MODEL)
    $('#lz-dev-mode').prop('checked', s.devMode ?? false)
    $('#lz-pollinations-status').text('')
    updateKeyStatusIndicator()
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

function refreshPanel() {
    initDropdowns()
    populateImageSettings()
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
    populateHistoryInputs()
    populateImageSettings()
}