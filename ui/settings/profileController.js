/**
 * @file data/default-user/extensions/localyze/ui/settings/profileController.js
 * @stamp {"utc":"2026-04-01T13:30:00.000Z"}
 * @architectural-role Stateful Owner / Profile Logic
 * @description
 * Manages the logic for settings profiles and "dirty" state tracking.
 * Provides the bridge between the UI dropdown and the underlying 
 * profile dictionary in settings/data.js.
 *
 * @api-declaration
 * isStateDirty(meta) -> boolean
 * updateDirtyIndicator(meta) -> void
 * refreshProfileDropdown(meta) -> void
 * handleProfileSave(meta) -> void
 * handleProfileAdd(meta, onRefresh) -> Promise<void>
 * handleProfileRename(meta, onRefresh) -> Promise<void>
 * handleProfileDelete(meta, onRefresh) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful Owner
 *     state_ownership: [extension_settings.localyze.profiles, .activeState]
 *     external_io: [saveSettingsDebounced, callPopup, toastr]
 */

import { saveSettingsDebounced, callPopup } from '../../../../../../script.js';
import { escapeHtml } from './templates.js';

/**
 * Compares the active temporary state against the saved profile data.
 * @param {object} meta Root metadata object.
 * @returns {boolean} True if changes are unsaved.
 */
export function isStateDirty(meta) {
    if (!meta.profiles || !meta.currentProfileName) return false;
    const currentSaved = JSON.stringify(meta.profiles[meta.currentProfileName]);
    const currentActive = JSON.stringify(meta.activeState);
    return currentSaved !== currentActive;
}

/**
 * Updates the profile dropdown labels to reflect unsaved changes (*).
 * @param {object} meta Root metadata object.
 */
export function updateDirtyIndicator(meta) {
    const isDirty = isStateDirty(meta);
    const label = meta.currentProfileName + (isDirty ? ' *' : '');
    const $sel = $('#lz-profile-select');
    
    // Update the text of the currently selected option
    $sel.find(`option[value="${CSS.escape(meta.currentProfileName)}"]`).text(label);
    $sel.val(meta.currentProfileName);
}

/**
 * Repopulates the profile dropdown list.
 * @param {object} meta Root metadata object.
 */
export function refreshProfileDropdown(meta) {
    const $sel = $('#lz-profile-select');
    if (!$sel.length) return;

    $sel.empty();
    for (const name of Object.keys(meta.profiles)) {
        $sel.append($('<option>').val(name).text(name));
    }
    updateDirtyIndicator(meta);
}

/**
 * Commits the current activeState to the profile dictionary.
 * @param {object} meta Root metadata object.
 */
export function handleProfileSave(meta) {
    meta.profiles[meta.currentProfileName] = structuredClone(meta.activeState);
    saveSettingsDebounced();
    updateDirtyIndicator(meta);
    if (window.toastr) window.toastr.success(`Profile "${meta.currentProfileName}" saved.`, 'Localyze');
}

/**
 * Logic for creating a new profile.
 */
export async function handleProfileAdd(meta, onRefresh) {
    const rawName = await callPopup('<h3>New profile name</h3>', 'input', '');
    const name = (rawName ?? '').trim();
    if (!name) return;

    if (meta.profiles[name]) {
        if (window.toastr) window.toastr.warning(`Profile "${name}" already exists.`, 'Localyze');
        return;
    }

    meta.profiles[name] = structuredClone(meta.activeState);
    meta.currentProfileName = name;
    saveSettingsDebounced();
    onRefresh();
}

/**
 * Logic for renaming the active profile.
 */
export async function handleProfileRename(meta, onRefresh) {
    const rawName = await callPopup('<h3>Rename profile</h3>', 'input', meta.currentProfileName);
    const newName = (rawName ?? '').trim();
    if (!newName || newName === meta.currentProfileName) return;

    if (meta.profiles[newName]) {
        if (window.toastr) window.toastr.warning(`Profile "${newName}" already exists.`, 'Localyze');
        return;
    }

    meta.profiles[newName] = meta.profiles[meta.currentProfileName];
    delete meta.profiles[meta.currentProfileName];
    meta.currentProfileName = newName;
    saveSettingsDebounced();
    onRefresh();
}

/**
 * Logic for deleting the active profile.
 */
export async function handleProfileDelete(meta, onRefresh) {
    if (Object.keys(meta.profiles).length <= 1) {
        if (window.toastr) window.toastr.warning('Cannot delete the only profile.', 'Localyze');
        return;
    }

    const confirmed = await callPopup(
        `<h3>Delete profile "${escapeHtml(meta.currentProfileName)}"?</h3>This cannot be undone.`,
        'confirm'
    );
    if (!confirmed) return;

    delete meta.profiles[meta.currentProfileName];
    meta.currentProfileName = Object.keys(meta.profiles)[0];
    meta.activeState = structuredClone(meta.profiles[meta.currentProfileName]);
    
    saveSettingsDebounced();
    onRefresh();
}