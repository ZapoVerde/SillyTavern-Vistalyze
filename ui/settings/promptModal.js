/**
 * @file data/default-user/extensions/localyze/ui/settings/promptModal.js
 * @stamp {"utc":"2026-04-03T17:40:00.000Z"}
 * @architectural-role UI Component / Prompt Editor
 * @description
 * Orchestrates the prompt editing modal. Handles display, reset logic, 
 * and persistence of LLM prompt templates via the established Setter API.
 * 
 * @updates
 * - Migration: Replaced direct mutation of getSettings() with updateActiveSetting().
 * - Standardized Persistence: Delegate saving to the Stateful Owner.
 *
 * @api-declaration
 * openPromptModal(settingsKey, title, defaultValue) -> Promise<boolean>
 *
 * @contract
 *   assertions:
 *     purity: UI Executor
 *     state_ownership: [none]
 *     external_io: [callPopup, settings/data.js]
 */

import { callPopup } from '../../../../../../script.js';
import { getSettings, updateActiveSetting } from '../../settings/data.js';
import { escapeHtml } from './templates.js';

/**
 * Opens a modal to edit a specific prompt template.
 * 
 * @param {string} settingsKey The key in the activeState object to update.
 * @param {string} title The title to display in the modal.
 * @param {string} defaultValue The hardcoded default to use on reset.
 * @returns {Promise<boolean>} True if the prompt was updated and saved.
 */
export async function openPromptModal(settingsKey, title, defaultValue) {
    const s = getSettings();
    const current = s[settingsKey] ?? defaultValue;

    const popupPromise = callPopup(
        `<div style="display:flex;flex-direction:column;gap:8px;">
            <strong>${title}</strong>
            <small style="opacity:0.65;">Use {{placeholders}} as shown in the default prompt.</small>
            <textarea id="lz-prompt-editor" class="text_pole" rows="16" style="width:100%;font-family:monospace;font-size:0.88em;">${escapeHtml(current)}</textarea>
            <button id="lz-prompt-reset" class="menu_button" style="align-self:flex-start;">Reset to Default</button>
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