/**
 * @file data/default-user/extensions/localyze/logic/pipeline.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the "Falling Water" detection pipeline and per-turn narrative 
 * branching. This module coordinates between LLM detectors, the DNA writer, 
 * and the image generation service.
 * 
 * It ensures that every AI message is evaluated for environmental changes 
 * and that the resulting state (currentLocation, currentImage) is synchronized 
 * with the chat log and the UI background.
 *
 * @api-declaration
 * runPipeline(messageId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via updateState)]
 *     external_io: [LLM Calls, Chat Writes, Image Generation, Background UI]
 */

import { callPopup } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { state, updateState } from '../state.js';
import { getSettings } from '../settings/data.js';
import { buildHistoryText, escapeHtml } from '../utils/history.js';
import { detectBoolean, detectClassifier, detectDescriber } from '../detector.js';
import { generate } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import { openAddModal } from '../ui/addModal.js';
import { 
    lockedWriteSceneRecord, 
    lockedPatchSceneImage, 
    lockedWriteLocationDef 
} from '../io/dnaWriter.js';

/**
 * Main entry point for the per-turn detection logic.
 * Triggered by AI message arrival.
 * @param {number} messageId 
 */
export async function runPipeline(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    
    // Safety check: LLZ only reacts to AI messages
    if (!message || message.is_user) return;

    const locationKeys = Object.keys(state.locations);
    const s = getSettings();

    // Step 1: Boolean Gate (Has the location changed?)
    if (state.currentLocation !== null) {
        const historyText = buildHistoryText(context.chat, messageId, s.booleanHistory ?? 0);
        const changed = await detectBoolean(
            message.mes, 
            state.currentLocation, 
            historyText,
            s.booleanPrompt, 
            s.booleanProfileId
        );
        if (!changed) return; // Halt: same location
    }

    // Step 2: Classifier (Does it match a known location?)
    if (locationKeys.length > 0) {
        const historyText = buildHistoryText(context.chat, messageId, s.classifierHistory ?? 0);
        const matchedKey = await detectClassifier(
            message.mes, 
            locationKeys, 
            historyText,
            s.classifierPrompt, 
            s.classifierProfileId
        );
        
        if (matchedKey !== null) {
            await handleKnownLocation(messageId, matchedKey);
            return;
        }
    }

    // Step 3: Describer (New location detected)
    await handleUnknownLocation(messageId, context);
}

/**
 * Handles transition to a location already in the library.
 */
async function handleKnownLocation(messageId, key) {
    const filename = `localyze_${state.sessionId}_${key}.png`;
    const def = state.locations[key];

    if (state.fileIndex.has(filename)) {
        // File exists - apply immediately
        setBg(filename);
        await lockedWriteSceneRecord(messageId, { location: key, image: filename, bg_declined: false });
        updateState(key, filename);
    } else {
        // File missing - clear background and queue generation (Two-Write)
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: key, image: null, bg_declined: false });
        updateState(key, null);

        const capturedId = messageId;
        generate(key, def, state.sessionId)
            .then(async newFile => {
                state.fileIndex.add(newFile);
                await lockedPatchSceneImage(capturedId, newFile);
                setBg(newFile);
                state.currentImage = newFile;
            })
            .catch(err => {
                console.error('[Localyze:Pipeline] Known location generate failed:', err);
                if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Localyze');
            });
    }
}

/**
 * Handles extraction and approval of a brand new location.
 */
async function handleUnknownLocation(messageId, context) {
    const chat = context.chat;
    const start = Math.max(0, chat.length - 6);
    const contextText = chat.slice(start).map(m => `${m.name ?? ''}: ${m.mes ?? ''}`).join('\n\n');

    const s = getSettings();
    const def = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId);

    // If LLM fails to parse or returns null, treat as a declined transition
    if (def === null) {
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true });
        updateState(null, null);
        return;
    }

    // Quick confirm toastr-style popup
    const confirmed = await callPopup(
        `<h3>New location detected: ${escapeHtml(def.name)}</h3>
        <p>${escapeHtml(def.description)}</p>`,
        'confirm'
    );

    if (!confirmed) {
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true });
        updateState(null, null);
        return;
    }

    // Open full review/edit modal
    const approved = await openAddModal(def);

    if (approved === null) {
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true });
        updateState(null, null);
        return;
    }

    // Commit new definition to DNA (write to previous message to avoid collision)
    const defMsgId = messageId > 0 ? messageId - 1 : messageId;
    await lockedWriteLocationDef(defMsgId, approved, state.sessionId);
    
    state.locations[approved.key] = approved;
    clearBg();
    
    // Record the scene transition (Two-Write)
    if (defMsgId !== messageId) {
        await lockedWriteSceneRecord(messageId, { location: approved.key, image: null, bg_declined: false });
    }
    updateState(approved.key, null);

    const capturedId = messageId;
    generate(approved.key, approved, state.sessionId)
        .then(async newFile => {
            state.fileIndex.add(newFile);
            await lockedPatchSceneImage(capturedId, newFile);
            setBg(newFile);
            state.currentImage = newFile;
        })
        .catch(err => {
            console.error('[Localyze:Pipeline] Generate failed after approve:', err);
            if (window.toastr) window.toastr.error(`Generation failed: ${err.message}`, 'Localyze');
        });
}