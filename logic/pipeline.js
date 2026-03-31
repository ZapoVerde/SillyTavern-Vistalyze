/**
 * @file data/default-user/extensions/localyze/logic/pipeline.js
 * @stamp {"utc":"2026-04-01T16:15:00.000Z"}
 * @architectural-role Orchestrator / Narrative Logic
 * @description
 * Implements the "Falling Water" detection pipeline.
 * 
 * @updates
 * - Standardized terminology: removed 'essence' and 'atmosphere' in favor of 
 *   'description' and 'imagePrompt' to match detector/UI standardization.
 * - Simplified handleUnknownLocation object construction.
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

import { callPopup } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { state, updateState } from '../state.js';
import { getSettings } from '../settings/data.js';
import { buildHistoryText, buildDescriberContext, escapeHtml, slugify } from '../utils/history.js';
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
    
    if (!message || message.is_user) return;

    const locationKeys = Object.keys(state.locations);
    const s = getSettings();

    // Step 1: Boolean Gate
    if (state.currentLocation !== null) {
        const historyText = buildHistoryText(context.chat, messageId, s.booleanHistory ?? 0);
        const changed = await detectBoolean(
            message.mes, 
            state.currentLocation, 
            historyText,
            s.booleanPrompt, 
            s.booleanProfileId
        );
        if (!changed) return;
    }

    // Step 2: Classifier
    if (locationKeys.length > 0) {
        // Build a highly-structured Search Index for the LLM
        const descriptiveList = Object.entries(state.locations)
            .map(([key, loc]) => `ID: [${key}] | Name: ${loc.name} | Essence: ${loc.description ?? 'Unknown'}`)
            .join('\n');

        const historyText = buildHistoryText(context.chat, messageId, s.classifierHistory ?? 0);
        const matchedKey = await detectClassifier(
            message.mes, 
            locationKeys, 
            historyText,
            s.classifierPrompt.replace('{{key_list}}', descriptiveList),
            s.classifierProfileId
        );
        
        if (matchedKey !== null) {
            await handleKnownLocation(messageId, matchedKey);
            return;
        }
    }

    // Step 3: Describer
    await handleUnknownLocation(messageId, context);
}

/**
 * Handles transition to a location already in the library.
 */
async function handleKnownLocation(messageId, key) {
    const filename = `localyze_${state.sessionId}_${key}.png`;
    const def = state.locations[key];

    if (state.fileIndex.has(filename)) {
        setBg(filename);
        await lockedWriteSceneRecord(messageId, { location: key, image: filename, bg_declined: false });
        updateState(key, filename);
    } else {
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
    const s = getSettings();
    const contextText = buildDescriberContext(context.chat, messageId, s.describerHistory ?? 0);

    const rawDef = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId);

    if (rawDef === null) {
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true });
        updateState(null, null);
        return;
    }

    // Construct the definition using standardized keys directly from detector
    const def = {
        ...rawDef,
        key: slugify(rawDef.name)
    };

    const confirmed = await callPopup(
        `<h3>New location detected: ${escapeHtml(def.name)}</h3>
        <p><em>${escapeHtml(def.description)}</em></p>
        <p style="font-size:0.9em; opacity:0.8;">${escapeHtml(def.imagePrompt)}</p>`,
        'confirm'
    );

    if (!confirmed) {
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true });
        updateState(null, null);
        return;
    }

    const approved = await openAddModal(def);

    if (approved === null) {
        clearBg();
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true });
        updateState(null, null);
        return;
    }

    const defMsgId = messageId > 0 ? messageId - 1 : messageId;
    await lockedWriteLocationDef(defMsgId, approved, state.sessionId);
    
    state.locations[approved.key] = approved;
    clearBg();
    
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