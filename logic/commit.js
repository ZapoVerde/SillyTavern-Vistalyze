/**
 * @file data/default-user/extensions/vistalyze/logic/commit.js
 * @stamp {"utc":"2026-05-03T14:45:00.000Z"}
 * @version 1.3.0
 * @architectural-role IO Executor / Finalizer
 * @description
 * Handles the "Commit Phase" of the Location Workshop. Responsible for 
 * taking the finalized draft state from the UI and persisting it to 
 * the chat history and filesystem.
 *
 * @updates
 * - Integrated customBg support: If a location has a manual background selection, 
 *   the system bypasses image generation and applies the chosen file directly.
 * - Updated needsGeneration logic to respect the customBg override.
 *
 * @api-declaration
 * handleFinalizeWorkshop(targetKey) — Persists a draft and applies it as the active scene.
 * commitDraftLibrary() — Synchronizes changed draft locations to the chat history.
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO Executor
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [DNA Writer, Image Cache, Background UI, saveChatConditional, i18n]
 */

import { saveChatConditional } from '../../../../../script.js';
import { t, translate } from '../../../../i18n.js';
import { getContext } from '../../../../extensions.js';
import { log, error } from '../utils/logger.js';
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
            original.imagePrompt !== draftDef.imagePrompt ||
            original.customBg !== draftDef.customBg
        );

        if (isNew || isModified) {
            log('Commit', `Persisting definition for: ${key}`);
            await lockedWriteLocationDef(lastMsgId, draftDef, state.sessionId);
            
            // Protected Update: Sync local library memory
            upsertLocation(draftDef);
        }
    }

    // Handle deletions
    for (const key of Object.keys(state.locations)) {
        if (!state._draftLocations[key]) {
            log('Commit', `Removing deleted location: ${key}`);
            
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
        throw new Error(`[Vistalyze:Commit] Invalid target key: ${targetKey}`);
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const draftDef = state._draftLocations[targetKey];
    const original = state.locations[targetKey];

    // Determine target filename: custom override or session-keyed AI file
    const targetFilename = draftDef.customBg || `vistalyze_${state.sessionId}_${targetKey}.png`;

    // Detect if the visual state changed
    const visualsModified = original && (
        original.imagePrompt !== draftDef.imagePrompt || 
        original.customBg !== draftDef.customBg
    );

    // Generation is only needed if we don't have a customBg AND (forced, modified, or missing)
    const hasPregeneratedBlob = state._proposedFullBlob !== null;
    const needsGeneration = !draftDef.customBg && (hasPregeneratedBlob || forceRegen || visualsModified || !state.fileIndex.has(targetFilename));

    // 1. Sync the library (Metadata definitions)
    await commitDraftLibrary();

    // 2. WRITE 1: Immediate Narrative Intent
    log('Commit', `Write 1: Recording transition to ${targetKey}`);
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
                ? await uploadBlob(state._proposedFullBlob, targetFilename)
                : await generate(targetKey, draftDef, state.sessionId);

            // Protected Update: Record server file existence
            addToFileIndex(newFile);

            // 4. WRITE 2: Eventual Consistency
            log('Commit', `Write 2: Patching transition with ${newFile}`);
            await lockedPatchSceneImage(lastMsgId, newFile);
            
            // Protected Update: Record asset completion
            updateState(targetKey, newFile);
            setBg(newFile);

            if (window.toastr) window.toastr.success(t`Location applied: ${draftDef.name}`, 'Vistalyze');
        } catch (err) {
            error('Commit', 'Write 2 failed (Image IO):', err);
            if (window.toastr) window.toastr.error(t`Transition saved, but image failed: ${err.message}`, 'Vistalyze');
        }
    } else {
        // Immediate transition: Either using customBg or AI file already exists
        await lockedPatchSceneImage(lastMsgId, targetFilename);
        updateState(targetKey, targetFilename);
        setBg(targetFilename);
        if (window.toastr) window.toastr.success(t`Location switched to: ${draftDef.name}`, 'Vistalyze');
    }

    // Protected Update: Wipe temporary workshop memory
    clearWorkshop();
}

/**
 * Retroactive location assignment.
 * Writes a scene record at a specific historical message instead of lastMsgId.
 * If the targeted message IS the last message, the background is also updated.
 * Otherwise only the DNA chain is patched (no background change).
 *
 * @param {string} targetKey The slug of the location being applied.
 * @param {number} msgId     The specific message index to tag.
 */
export async function handleFinalizeWorkshopAtMessage(targetKey, msgId) {
    if (!targetKey || !state._draftLocations[targetKey]) {
        throw new Error(`[Vistalyze:Commit] Invalid target key: ${targetKey}`);
    }

    const context = getContext();
    const lastMsgId = Math.max(0, context.chat.length - 1);
    const draftDef = state._draftLocations[targetKey];
    const isCurrentMessage = (msgId === lastMsgId);

    // 1. Sync the library (definitions always written at lastMsgId)
    await commitDraftLibrary();

    // 2. Write the scene record at the specific message
    await lockedWriteSceneRecord(msgId, {
        location: targetKey,
        image: null,
        bg_declined: false
    });

    if (isCurrentMessage) {
        // Active scene path — same logic as handleFinalizeWorkshop
        updateState(targetKey, null);

        const original = state.locations[targetKey];
        const targetFilename = draftDef.customBg || `vistalyze_${state.sessionId}_${targetKey}.png`;
        const visualsModified = original && (
            original.imagePrompt !== draftDef.imagePrompt || 
            original.customBg !== draftDef.customBg
        );
        const needsGeneration = !draftDef.customBg && (visualsModified || !state.fileIndex.has(targetFilename));

        if (needsGeneration) {
            clearBg();
            try {
                const newFile = await generate(targetKey, draftDef, state.sessionId);
                addToFileIndex(newFile);
                await lockedPatchSceneImage(msgId, newFile);
                updateState(targetKey, newFile);
                setBg(newFile);
                if (window.toastr) window.toastr.success(t`Location applied: ${draftDef.name}`, 'Vistalyze');
            } catch (err) {
                error('Commit', 'Retroactive image gen failed:', err);
                if (window.toastr) window.toastr.error(t`Transition saved, but image failed: ${err.message}`, 'Vistalyze');
            }
        } else {
            await lockedPatchSceneImage(msgId, targetFilename);
            updateState(targetKey, targetFilename);
            setBg(targetFilename);
            if (window.toastr) window.toastr.success(t`Location switched to: ${draftDef.name}`, 'Vistalyze');
        }
    } else {
        // Historical tag — DNA chain patched, background unchanged
        if (window.toastr) window.toastr.info(t`Tagged as: ${draftDef.name}`, 'Vistalyze');
    }

    clearWorkshop();
}