/**
 * @file data/default-user/extensions/localyze/logic/commit.js
 * @stamp {"utc":"2026-04-03T10:30:00.000Z"}
 * @version 1.0.3
 * @architectural-role IO Executor / Finalizer
 * @description
 * Handles the "Commit Phase" of the Location Workshop. Responsible for 
 * taking the finalized draft state from the UI and persisting it to 
 * the chat history and filesystem.
 *
 * @updates
 * - Awaited Generation: generate() is now fully awaited so the caller (modal) holds
 *   open until the image is confirmed on the server — no more fire-and-forget.
 * - Simplified Write Path: collapsed the two-write (null → patch) pattern into a
 *   single lockedWriteSceneRecord call after generation succeeds.
 * - Standardized Visual Change Detection: Explicitly checks imagePrompt diffs
 *   to force a regeneration/overwrite of the existing background asset.
 * - Maintained Overwrite Strategy: Keeps static filenames to prevent folder clutter.
 *
 * @api-declaration
 * handleFinalizeWorkshop(targetKey) — Persists a draft and applies it as the active scene.
 * commitDraftLibrary() — Synchronizes changed draft locations to the chat history.
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
    lockedWriteSceneRecord
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
            state.locations[key] = structuredClone(draftDef);
        }
    }

    // Handle deletions
    for (const key of Object.keys(state.locations)) {
        if (!state._draftLocations[key]) {
            console.debug(`[Localyze:Commit] Removing deleted location: ${key}`);
            delete state.locations[key];
        }
    }
}

/**
 * The primary "Apply" logic for the Workshop.
 * Persists changes, generates high-res images if needed, and updates the background.
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

    // 1. Sync the library (Write 1)
    await commitDraftLibrary();

    // 2. Determine if generation is required (Missing file OR explicit change/force)
    const filename = `localyze_${state.sessionId}_${targetKey}.png`;
    const needsGeneration = forceRegen || visualsModified || !state.fileIndex.has(filename);

    if (needsGeneration) {
        // Await full-res generation — caller holds the modal open until this resolves.
        // Throws on failure, which propagates to the UI so the modal stays open.
        const newFile = await generate(targetKey, draftDef, state.sessionId);

        state.fileIndex.add(newFile);

        // Single write: record the real filename now that the image is confirmed on server.
        await lockedWriteSceneRecord(lastMsgId, {
            location: targetKey,
            image: newFile,
            bg_declined: false
        });
        updateState(targetKey, newFile);

        // Apply to UI. background.js uses timestamps to bust cache even on same filename.
        setBg(newFile);

        state.currentImage = newFile;
        if (window.toastr) window.toastr.success(`Location applied: ${draftDef.name}`, 'Localyze');
    } else {
        // Immediate transition (No visuals change, just switching or minor metadata edit)
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