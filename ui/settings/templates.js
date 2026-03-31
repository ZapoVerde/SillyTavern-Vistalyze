/**
 * @file data/default-user/extensions/localyze/ui/settings/templates.js
 * @stamp {"utc":"2026-04-01T23:30:00.000Z"}
 * @version 1.4.3
 * @architectural-role Pure UI Templates
 * @description
 * Pure functions for generating the Localyze settings panel HTML.
 * 
 * Updates:
 * - Added Step 4 (Targeted Discovery) to the settings panel layout.
 *
 * @api-declaration
 * buildPanelHTML(meta, models) -> string
 * buildCallRow(id, label, promptKey, profileKey, historyKey) -> string
 * escapeHtml(str) -> string
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: none
 *     external_io: none
 */

/**
 * Escapes HTML special characters for safe rendering.
 * @param {string|null|undefined} str 
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Builds the HTML for an LLM Step configuration row.
 * @param {string} id Unique identifier for the DOM elements.
 * @param {string} label Human-readable label for the step.
 * @param {string} promptKey The settings key for the prompt template.
 * @param {string} profileKey The settings key for the connection profile.
 * @param {string|null} historyKey The settings key for the history pairs count.
 * @returns {string} HTML string.
 */
export function buildCallRow(id, label, promptKey, profileKey, historyKey = null) {
    const safeId = escapeHtml(id);
    const safePromptKey = escapeHtml(promptKey);
    const safeProfileKey = escapeHtml(profileKey);

    const historyRow = historyKey ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;">History:</label>
            <input id="lz-history-${safeId}" type="number" min="0" step="1"
                class="text_pole lz-history-input" data-history-key="${escapeHtml(historyKey)}"
                style="width:60px;" />
            <span style="font-size:0.83em;opacity:0.6;">pairs (0 = off)</span>
        </div>` : '';

    return `
    <div class="lz-call-row" style="margin-bottom:16px;padding:12px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <strong style="font-size:0.95em;">${escapeHtml(label)}</strong>
            <button class="menu_button lz-open-prompt" data-prompt-key="${safePromptKey}" style="font-size:0.8em;padding:2px 8px;">Edit Prompt</button>
        </div>
        <div class="lz-profile-row" style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:0.85em;opacity:0.75;white-space:nowrap;">Connection:</label>
            <select id="lz-profile-${safeId}" class="text_pole lz-step-profile-select" data-profile-key="${safeProfileKey}" style="flex:1;"></select>
        </div>
        ${historyRow}
    </div>`;
}

/**
 * Generates the main settings panel layout.
 * @param {object} meta The root extension settings (metadata).
 * @param {string[]} availableModels List of Pollinations models to display.
 * @returns {string} Full HTML layout string.
 */
export function buildPanelHTML(meta, availableModels) {
    const modelOptions = Array.isArray(availableModels) 
        ? availableModels.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')
        : '';

    return `
    <div id="lz-settings" class="extension_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-location-dot"></i> Localyze</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <!-- Profile Management Bar -->
                <div class="lz-profile-bar" style="display:flex;align-items:center;gap:4px;margin-bottom:12px;">
                    <select id="lz-profile-select" class="text_pole" style="flex:1;" title="Active settings profile"></select>
                    <button id="lz-profile-save" class="menu_button" title="Save profile" style="padding:2px 8px;">&#x1F4BE;</button>
                    <button id="lz-profile-add" class="menu_button" title="New profile" style="padding:2px 8px;">&#x2795;</button>
                    <button id="lz-profile-rename" class="menu_button" title="Rename profile" style="padding:2px 8px;">&#x270F;&#xFE0F;</button>
                    <button id="lz-profile-delete" class="menu_button" title="Delete profile" style="padding:2px 8px;">&#x1F5D1;&#xFE0F;</button>
                </div>
                
                <p style="font-size:0.85em;opacity:0.7;margin:0 0 14px;">
                    Each AI call uses its own prompt template and connection profile.
                    Leave connection blank to use the chat's active API.
                </p>

                <!-- Detection & Discovery Steps -->
                ${buildCallRow('boolean',    'Step 1 — Location Changed? (Boolean)',   'booleanPrompt',    'booleanProfileId',    'booleanHistory')}
                ${buildCallRow('classifier', 'Step 2 — Which Location? (Classifier)', 'classifierPrompt', 'classifierProfileId', 'classifierHistory')}
                ${buildCallRow('describer',  'Step 3 — Describe New Location',        'describerPrompt',  'describerProfileId',  'describerHistory')}
                ${buildCallRow('discovery',  'Step 4 — Targeted Discovery',            'discoveryPrompt',  'discoveryProfileId',  'discoveryHistory')}
                
                <!-- Image Generation Section -->
                <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--SmartThemeBorderColor,#444);">
                    <strong style="font-size:0.95em;">Image Generation</strong>
                    <p style="font-size:0.83em;opacity:0.65;margin:4px 0 12px;">
                        Images are generated via Pollinations. Enter your API key to securely save it to your server vault.<br/>
                        <strong style="color:var(--SmartThemeWarningColor,#ffc107);">Note:</strong> Extensions require <code>allowKeysExposure: true</code> in <code>config.yaml</code> to read this key.
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
                            ${modelOptions}
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
    </div>`;
}