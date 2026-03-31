/**
 * @file data/default-user/extensions/localyze/logic/maintenance.js
 * @stamp {"utc":"2026-04-01T16:20:00.000Z"}
 * @architectural-role Orchestrator / Maintenance Logic
 * @description
 * Manages manual updates to the location library. This module bridges 
 * user intent (via UI modals) with the DNA Chain persistence and 
 * asset generation.
 * 
 * Updates:
 * - Standardized terminology: removed 'essence' and 'atmosphere' mapping logic.
 * - Expects standardized keys (description, imagePrompt) from detector.js.
 * 
 * @api-declaration
 * handleEditLocation(key) -> Promise<void>
 * handleManualDescriber() -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state.locations (mutates)]
 *     external_io: [ui/editModal, ui/addModal, io/dnaWriter, imageCache, background, detector]
 */

import { getContext } from '../../../../extensions.js';
import { state, updateState } from '../state.js';
import { getSettings } from '../settings/data.js';
import { buildDescriberContext, slugify } from '../utils/history.js';
import { detectDescriber } from '../detector.js';
import { openEditModal } from '../ui/editModal.js';
import { openAddModal } from '../ui/addModal.js';
import { set as setBg, clear as clearBg } from '../background.js';
import { generate } from '../imageCache.js';
import { 
    lockedWriteLocationDef, 
    lockedWriteSceneRecord, 
    lockedPatchSceneImage 
} from '../io/dnaWriter.js';

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
    
    const newDef = await openEditModal(oldDef);
    if (!newDef) return; 
    
    const context = getContext();
    const lastMsgId = context.chat.length > 0 ? context.chat.length - 1 : 0;
    
    await lockedWriteLocationDef(lastMsgId, newDef, state.sessionId);
    state.locations[key] = newDef;
    
    if (newDef.regenRequested) {
        if (window.toastr) window.toastr.info(`Regenerating image for ${newDef.name}...`, 'Localyze');
        
        generate(key, newDef, state.sessionId)
            .then(async filename => {
                state.fileIndex.add(filename);
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

/**
 * Manually invokes the Describer (Step 3) to extract a new location from context.
 * Triggered by the "Force Detect Location" button in the picker.
 */
export async function handleManualDescriber() {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) {
        if (window.toastr) window.toastr.warning('Chat is empty.', 'Localyze');
        return;
    }

    const lastMsgId = context.chat.length - 1;
    const s = getSettings();
    
    // 1. Build context and call LLM
    const contextText = buildDescriberContext(context.chat, lastMsgId, s.describerHistory ?? 0);
    const rawDef = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId);

    if (!rawDef) {
        if (window.toastr) window.toastr.warning('Could not detect a new location from context.', 'Localyze');
        return;
    }

    // Standardize object with the required key
    const def = {
        ...rawDef,
        key: slugify(rawDef.name)
    };

    // 2. User Review/Edit
    const approved = await openAddModal(def);
    if (!approved) return;

    // 3. Two-Write Pattern Implementation
    // Write 1: Location Def and Scene Intent (image: null)
    await lockedWriteLocationDef(lastMsgId, approved, state.sessionId);
    state.locations[approved.key] = approved;
    
    clearBg();
    await lockedWriteSceneRecord(lastMsgId, { location: approved.key, image: null, bg_declined: false });
    updateState(approved.key, null);

    // 4. Async Generation
    generate(approved.key, approved, state.sessionId)
        .then(async filename => {
            state.fileIndex.add(filename);
            
            // Write 2: Patch scene record with filename
            await lockedPatchSceneImage(lastMsgId, filename);
            
            // Finalize UI/State
            setBg(filename);
            state.currentImage = filename;
            
            if (window.toastr) window.toastr.success(`New location "${approved.name}" added and applied.`, 'Localyze');
        })
        .catch(err => {
            console.error('[Localyze:Maintenance] Manual detection generation failed:', err);
            if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Localyze');
        });
}