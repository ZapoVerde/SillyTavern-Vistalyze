/**
 * @file data/default-user/extensions/localyze/logic/maintenance.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Orchestrator / Maintenance Logic
 * @description
 * Manages manual updates to the location library. This module bridges 
 * user intent (via UI modals) with the DNA Chain persistence and 
 * asset generation.
 * 
 * Key responsibility: handleEditLocation(key).
 * 
 * @api-declaration
 * handleEditLocation(key) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state.locations (mutates)]
 *     external_io: [ui/editModal, io/dnaWriter, imageCache, background]
 */

import { getContext } from '../../../../extensions.js';
import { state, updateState } from '../state.js';
import { openEditModal } from '../ui/editModal.js';
import { lockedWriteLocationDef } from '../io/dnaWriter.js';
import { generate } from '../imageCache.js';
import { set as setBg } from '../background.js';

/**
 * Initiates the edit flow for an existing location definition.
 * Triggered by the "pencil" icon in the Location Picker.
 * 
 * @param {string} key The unique slug of the location to edit.
 */
export async function handleEditLocation(key) {
    const oldDef = state.locations[key];
    if (!oldDef) {
        console.warn(`[Localyze:Maintenance] Attempted to edit non-existent location: ${key}`);
        return;
    }
    
    // 1. Open the UI for user input
    const newDef = await openEditModal(oldDef);
    if (!newDef) return; // User cancelled
    
    const context = getContext();
    // We write the update to the very end of the chat DNA
    const lastMsgId = context.chat.length > 0 ? context.chat.length - 1 : 0;
    
    // 2. Write updated definition to chat DNA (Last Write Wins)
    await lockedWriteLocationDef(lastMsgId, newDef, state.sessionId);
    
    // 3. Update runtime state (immediately reflects in Picker)
    state.locations[key] = newDef;
    
    // 4. Handle optional image regeneration
    if (newDef.regenRequested) {
        if (window.toastr) window.toastr.info(`Regenerating image for ${newDef.name}...`, 'Localyze');
        
        generate(key, newDef, state.sessionId)
            .then(async filename => {
                state.fileIndex.add(filename);
                
                // If the user is currently "in" this location, refresh the background
                if (state.currentLocation === key) {
                    setBg(filename);
                    updateState(key, filename);
                }
                
                if (window.toastr) window.toastr.success(`Image for "${newDef.name}" updated.`, 'Localyze');
            })
            .catch(err => {
                console.error('[Localyze:Maintenance] Regeneration failed:', err);
                if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Localyze');
            });
    } else {
        if (window.toastr) window.toastr.success(`Location "${newDef.name}" updated.`, 'Localyze');
    }
}