/**
 * @file data/default-user/extensions/vistalyze/ui/settings/promptModal.js
 * @stamp {"utc":"2026-04-04T13:25:00.000Z"}
 * @architectural-role UI Component / Prompt Editor
 * @description
 * Orchestrates the prompt editing modal. Handles display, reset logic, 
 * and persistence of LLM prompt templates via the established Setter API.
 * Includes translation-ready wrappers for user-facing UI and notifications.
 * 
 * @updates
 * - Migration: Replaced direct mutation of getSettings() with updateActiveSetting().
 * - Standardized Persistence: Delegate saving to the Stateful Owner.
 * - Integrated translation-ready t and translate wrappers for user-facing strings.
 *
 * @api-declaration
 * openPromptModal(settingsKey, title, defaultValue, variables) -> Promise<boolean>
 *
 * @contract
 *   assertions:
 *     purity: UI Executor
 *     state_ownership: [none]
 *     external_io: [callPopup, settings/data.js, i18n]
 */

import { callPopup } from '../../../../../../script.js';
import { t, translate } from '../../../../../i18n.js';
import { getSettings, updateActiveSetting } from '../../settings/data.js';
import { escapeHtml } from './templates.js';

/**
 * Opens a modal to edit a specific prompt template.
 *
 * @param {string} settingsKey The key in the activeState object to update.
 * @param {string} title The title to display in the modal.
 * @param {string} defaultValue The hardcoded default to use on reset.
 * @param {string[]} [variables] Optional list of available {{placeholder}} names for this prompt.
 * @returns {Promise<boolean>} True if the prompt was updated and saved.
 */
export async function openPromptModal(settingsKey, title, defaultValue, variables = []) {
    const s = getSettings();
    const current = s[settingsKey] ?? defaultValue;

    const variableHint = variables.length > 0
        ? `<div style="display:flex;flex-direction:column;gap:3px;">
               <small style="opacity:0.65;font-weight:bold;" data-i18n="vistalyze.prompt_modal.available_vars">Available variables:</small>
               ${variables.map(v => `
               <div style="display:flex;align-items:baseline;gap:8px;">
                   <code style="white-space:nowrap;">{{${escapeHtml(v.name)}}}</code>
                   <small style="opacity:0.55;">${escapeHtml(v.description)}</small>
               </div>`).join('')}
           </div>`
        : `<small style="opacity:0.65;" data-i18n="vistalyze.prompt_modal.placeholder_hint">Use {{placeholders}} as shown in the default prompt.</small>`;

    const popupPromise = callPopup(
        `<div style="display:flex;flex-direction:column;gap:8px;">
            <strong>${escapeHtml(title)}</strong>
            ${variableHint}
            <textarea id="lz-prompt-editor" class="text_pole" rows="16" style="width:100%;font-family:monospace;font-size:0.88em;">${escapeHtml(current)}</textarea>
            <button id="lz-prompt-reset" class="menu_button" style="align-self:flex-start;" data-i18n="vistalyze.prompt_modal.btn_reset">${translate('Reset to Default')}</button>
        </div>`,
        'text',
    );

    // Bind reset logic
    $('#lz-prompt-reset').on('click', () => {
        $('#lz-prompt-editor').val(defaultValue);
    });

    const confirmed = await popupPromise;
    if (!confirmed) return false;

    const newValue = ($('#lz-prompt-editor').val() ?? '').trim();
    
    // Only update if the value actually changed
    if (newValue !== current) {
        // Protected Update: Delegate update and persistence to Stateful Owner
        updateActiveSetting(settingsKey, newValue || defaultValue);
        return true;
    }

    return false;
}