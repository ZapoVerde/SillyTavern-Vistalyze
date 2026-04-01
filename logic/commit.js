/**
 * @file data/default-user/extensions/localyze/logic/commit.js
 * @stamp {"utc":"2026-04-03T16:15:00.000Z"}
 * @version 1.2.0
 * @architectural-role IO Executor / Finalizer
 * @description
 * Handles the "Commit Phase" of the Location Workshop. Responsible for 
 * taking the finalized draft state from the UI and persisting it to 
 * the chat history and filesystem.
 *
 * @updates
 * - Migration: Replaced all direct state mutations with upsertLocation, 
 *   removeLocation, addToFileIndex, and clearWorkshop setters.
 * - Maintained Two-Write Pattern: Transition intent is written before asset generation.
 *
 * @api-declaration
 * handleFinalizeWorkshop(targetKey) — Persists a draft and applies it as the active scene.
 * commitDraftLibrary() — Synchronizes changed draft locations to the chat history.
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO Executor
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [DNA Writer, Image Cache, Background UI, saveChatConditional]
 */

import { saveChatConditional } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { 
    state, 
    updateState, 
    upsertLocation, 
    removeLocation, 
    addToFileIndex, 
    clearWorkshop 
} from '../state.js';
import { generate, uploadBlob } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import {
    lockedWriteLocationDef,
    lockedWriteSceneRecord,
    lockedPatchSceneImage
} from '../io/dnaWriter.js';

/**
 * Commits the current _draftLocations to the live state and persists them to DNA.
 * Syncs manual edits made in the Architect tab.
 */
async function commitDraftLibrary() {
    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    
    for (const [key, draftDef] of Object.entries(state._draftLocations)) {
        const original = state.locations[key];
        const isNew = !original;
        const isModified = original && (
            original.name !== draftDef.name ||
            original.description !== draftDef.description ||
            original.imagePrompt !== draftDef.imagePrompt
        );

        if (isNew || isModified) {
            console.debug(`[Localyze:Commit] Persisting definition for: ${key}`);
            await lockedWriteLocationDef(lastMsgId, draftDef, state.sessionId);
            
            // Protected Update: Sync local library memory
            upsertLocation(draftDef);
        }
    }

    // Handle deletions
    for (const key of Object.keys(state.locations)) {
        if (!state._draftLocations[key]) {
            console.debug(`[Localyze:Commit] Removing deleted location: ${key}`);
            
            // Protected Update: Delete from local library memory
            removeLocation(key);
        }
    }
}

/**
 * The primary "Apply" logic for the Workshop.
 * Persists changes, generates images if needed, and updates the background.
 * Uses the Two-Write Pattern for data safety.
 * 
 * @param {string} targetKey The slug of the location being applied.
 * @param {boolean} forceRegen If true, forces a new image generation.
 */
export async function handleFinalizeWorkshop(targetKey, forceRegen = false) {
    if (!targetKey || !state._draftLocations[targetKey]) {
        throw new Error(`[Localyze:Commit] Invalid target key: ${targetKey}`);
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const draftDef = state._draftLocations[targetKey];
    const original = state.locations[targetKey];

    // Detect if the visual prompt changed (requires overwriting the current image)
    const visualsModified = original && original.imagePrompt !== draftDef.imagePrompt;
    const filename = `localyze_${state.sessionId}_${targetKey}.png`;
    const hasPregeneratedBlob = state._proposedFullBlob !== null;
    const needsGeneration = hasPregeneratedBlob || forceRegen || visualsModified || !state.fileIndex.has(filename);

    // 1. Sync the library (Metadata definitions)
    await commitDraftLibrary();

    // 2. WRITE 1: Immediate Narrative Intent
    console.debug(`[Localyze:Commit] Write 1: Recording transition to ${targetKey}`);
    await lockedWriteSceneRecord(lastMsgId, {
        location: targetKey,
        image: null, 
        bg_declined: false
    });
    
    // Protected Update: Record intent in runtime state
    updateState(targetKey, null);

    if (needsGeneration) {
        clearBg();

        try {
            // 3. IO: Async Asset Creation/Transfer
            const newFile = hasPregeneratedBlob
                ? await uploadBlob(state._proposedFullBlob, filename)
                : await generate(targetKey, draftDef, state.sessionId);

            // Protected Update: Record server file existence
            addToFileIndex(newFile);

            // 4. WRITE 2: Eventual Consistency
            console.debug(`[Localyze:Commit] Write 2: Patching transition with ${newFile}`);
            await lockedPatchSceneImage(lastMsgId, newFile);
            
            // Protected Update: Record asset completion
            updateState(targetKey, newFile);
            setBg(newFile);

            if (window.toastr) window.toastr.success(`Location applied: ${draftDef.name}`, 'Localyze');
        } catch (err) {
            console.error('[Localyze:Commit] Write 2 failed (Image IO):', err);
            if (window.toastr) window.toastr.error(`Transition saved, but image failed: ${err.message}`, 'Localyze');
        }
    } else {
        // Immediate transition (Asset already exists)
        await lockedPatchSceneImage(lastMsgId, filename);
        updateState(targetKey, filename);
        setBg(filename);
        if (window.toastr) window.toastr.success(`Location switched to: ${draftDef.name}`, 'Localyze');
    }

    // Protected Update: Wipe temporary workshop memory
    clearWorkshop();
}