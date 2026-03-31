/**
 * @file data/default-user/extensions/localyze/logic/commit.js
 * @stamp {"utc":"2026-04-01T21:00:00.000Z"}
 * @version 1.0.1
 * @architectural-role IO Executor / Finalizer
 * @description
 * Handles the "Commit Phase" of the Location Workshop. This module is 
 * responsible for taking the finalized draft state and persisting it to 
 * the chat history and filesystem.
 *
 * Implements the Two-Write Pattern:
 * 1. PERSIST DEFINITION: Writes the location metadata to the chat DNA.
 * 2. GENERATE ASSET: Triggers the high-resolution image generation.
 * 3. ANCHOR SCENE: Writes the scene transition record once the asset is ready.
 *
 * @core-principles
 * 1. ATOMICITY: Uses the DNA Writer's AsyncLock to prevent race conditions.
 * 2. DATA INTEGRITY: The location definition is saved BEFORE the image 
 *    generation starts, ensuring the library entry survives even if generation fails.
 * 3. UI SYNCHRONIZATION: Updates the live background and runtime state only 
 *    after successful persistence.
 *
 * @api-declaration
 * handleFinalizeWorkshop(targetKey) — Takes a draft key, persists it, and applies it as the active scene.
 * commitDraftLibrary() — Synchronizes all changed draft locations to the chat history.
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO Executor
 *     state_ownership: [state.locations, state.currentLocation, state.currentImage, state.fileIndex]
 *     external_io: [DNA Writer, Image Cache, Background UI, saveChatConditional]
 */

import { saveChatConditional } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { state, updateState } from '../state.js';
import { generate } from '../imageCache.js';
import { set as setBg } from '../background.js';
import { 
    lockedWriteLocationDef, 
    lockedWriteSceneRecord, 
    lockedPatchSceneImage 
} from '../io/dnaWriter.js';

/**
 * Commits the current _draftLocations to the live state and persists them to DNA.
 * Used when "Finalizing" the workshop to ensure all manual edits are saved.
 */
async function commitDraftLibrary() {
    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    
    // 1. Identify what changed in the draft
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
            // Write the definition to chat DNA
            await lockedWriteLocationDef(lastMsgId, draftDef, state.sessionId);
            // Synchronize in-memory library
            state.locations[key] = structuredClone(draftDef);
        }
    }

    // 2. Handle Deletions (Items in locations but not in _draftLocations)
    for (const key of Object.keys(state.locations)) {
        if (!state._draftLocations[key]) {
            console.debug(`[Localyze:Commit] Removing deleted location from memory: ${key}`);
            delete state.locations[key];
            // Note: We don't "delete" from DNA. The next reconstruction 
            // forward-pass simply won't find it in the new draft dictionary.
        }
    }
}

/**
 * The primary "Apply" logic for the Workshop.
 * Persists the library changes, generates the image, and sets the background.
 * 
 * @param {string} targetKey The slug of the location being applied.
 * @param {boolean} forceRegen If true, a new high-res image is generated even if one exists.
 */
export async function handleFinalizeWorkshop(targetKey, forceRegen = false) {
    if (!targetKey || !state._draftLocations[targetKey]) {
        throw new Error(`[Localyze:Commit] Invalid target key: ${targetKey}`);
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const draftDef = state._draftLocations[targetKey];
    const original = state.locations[targetKey];

    // Principle: Detect visual drift BEFORE committing draft to memory
    const visualsModified = original && original.imagePrompt !== draftDef.imagePrompt;

    // 1. Sync the library first (Write 1)
    await commitDraftLibrary();

    // 2. Determine if we need to generate a new image
    const filename = `localyze_${state.sessionId}_${targetKey}.png`;
    const needsGeneration = forceRegen || visualsModified || !state.fileIndex.has(filename);

    if (needsGeneration) {
        if (window.toastr) window.toastr.info(`Generating background for "${draftDef.name}"...`, 'Localyze');

        // Write the Scene record with image: null (Intent to transition / Write 1 of 2)
        await lockedWriteSceneRecord(lastMsgId, { 
            location: targetKey, 
            image: null, 
            bg_declined: false 
        });
        updateState(targetKey, null);

        // Start async high-res generation
        generate(targetKey, draftDef, state.sessionId)
            .then(async newFile => {
                state.fileIndex.add(newFile);
                
                // Finalize the Scene record (Patch Write / Write 2 of 2)
                await lockedPatchSceneImage(lastMsgId, newFile);
                
                // Apply UI
                setBg(newFile);
                state.currentImage = newFile;
                
                if (window.toastr) window.toastr.success(`Location applied: ${draftDef.name}`, 'Localyze');
            })
            .catch(err => {
                console.error('[Localyze:Commit] High-res generation failed:', err);
                if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Localyze');
            });
    } else {
        // Image already exists and prompt hasn't drifted — Immediate transition
        setBg(filename);
        await lockedWriteSceneRecord(lastMsgId, { 
            location: targetKey, 
            image: filename, 
            bg_declined: false 
        });
        updateState(targetKey, filename);
        
        if (window.toastr) window.toastr.success(`Location switched to: ${draftDef.name}`, 'Localyze');
    }

    // Clear workshop temporary state
    state._draftLocations = {};
    state._activeWorkshopKey = null;
    state._proposedImageBlob = null;
}