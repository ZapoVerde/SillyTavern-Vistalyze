/**
 * @file data/default-user/extensions/vistalyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-05-03T15:50:00.000Z"}
 * @version 1.2.0
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the Vistalyze environment for a specific chat.
 * 
 * @updates
 * - Integrated customBg awareness: The regeneration queue now skips any 
 *   location that has a manual background selection, ensuring the AI never 
 *   overwrites user choices.
 *
 * @api-declaration
 * runBoot() -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via setters only)]
 *     external_io: [session, reconstruction, imageCache, background, orphanDetector]
 */

import { saveSettingsDebounced, chat_metadata } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { log, warn, error } from '../utils/logger.js';
import { state, bulkInitState, setFileIndex, addToFileIndex, updateState } from '../state.js';
import { initSession } from '../session.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import { fastDiff } from '../orphanDetector.js';
import { showOrphanBadge } from '../ui/toolbar.js';
import { getMetaSettings, updateMetaSetting } from '../settings/data.js';

/**
 * Executes the full boot sequence for the current chat context.
 */
export async function runBoot() {
    log('Boot', 'Starting sequence...');

    const context = getContext();
    if (!context.chatId) {
        log('Boot', 'Abort: No active chatId found.');
        return;
    }

    // DEBUG: Log metadata state at boot entry — tells us if custom_background is already
    // set when we arrive, meaning ST's onChatChanged already applied it (and may have 404'd).
    log('Boot', 'runBoot() entry — chat_metadata:', {
        custom_background: chat_metadata?.custom_background ?? '(not set)',
        vistalyze_managed:  chat_metadata?.vistalyze_managed  ?? '(not set)',
    });

    // 1. Session & DNA Reconstruction
    // Derives the library and the "last known scene" from the chat JSONL.
    initSession();
    
    const reconstructed = reconstruct(context.chat);
    
    // Protected Update: Hydrate live state from reconstructed DNA
    bulkInitState(reconstructed);
    
    log('Boot', `DNA Reconstructed: ${Object.keys(state.locations).length} locations found.`);

    // 2. Filesystem Reconciliation
    // Fetch the list of actual background files present on the server.
    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId);

    // Protected Update: Update the server asset cache
    setFileIndex(fileIndex);

    log('Boot', `File Index: ${state.fileIndex.size} managed files detected.`);

    // 3. 404 Prevention & Self-Healing Queue
    const queue = [];

    // Check every location in the library. If its image is missing, queue it.
    for (const key of Object.keys(state.locations)) {
        const def = state.locations[key];
        
        // Skip regeneration if a custom background is explicitly set. 
        // Vistalyze cannot "re-generate" a manual user selection.
        if (def.customBg) continue;

        const filename = `vistalyze_${state.sessionId}_${key}.png`;
        if (!state.fileIndex.has(filename)) {
            warn('Boot', `Asset missing from server: ${filename}. Queuing regeneration.`);
            queue.push(key);
        }
    }

    // Identify if the CURRENT scene's image is missing.
    // customBg filenames are native ST files — they are never in the Vistalyze-scoped
    // fileIndex, so skip the check for them entirely.
    const currentDef = state.currentLocation ? state.locations[state.currentLocation] : null;
    const isCurrentCustom = !!currentDef?.customBg;
    const isCurrentImageMissing = !isCurrentCustom && state.currentImage && !state.fileIndex.has(state.currentImage);

    // 4. UI Restoration
    if (state.currentImage && !isCurrentImageMissing) {
        // File exists on server: display it immediately
        log('Boot', 'Restoring valid background:', state.currentImage);
        setBg(state.currentImage);
    } else {
        // File is missing or no scene active: clear the background to prevent 404 logs
        if (isCurrentImageMissing) {
            warn('Boot', `Active background ${state.currentImage} is missing. Clearing UI to prevent 404.`);
        }
        clearBg();
    }

    // 5. Execute Regeneration Queue
    if (queue.length > 0) {
        log('Boot', `Regenerating ${queue.length} missing assets...`);
        for (const key of queue) {
            const def = state.locations[key];
            if (!def) continue;

            generate(key, def, state.sessionId)
                .then(async filename => {
                    // Protected Update: Add the new file to the index
                    addToFileIndex(filename);

                    // If the regenerated file is the one we should be looking at, apply it now
                    if (filename === state.currentImage) {
                        log('Boot', `Active background regenerated: ${filename}. Applying to UI.`);
                        setBg(filename);
                    }
                })
                .catch(err => error('Boot', `Regeneration failed for "${key}":`, err));
        }
    }

    // 6. Fast Orphan Detection (Badge Update)
    const meta = getMetaSettings();
    const suspects = fastDiff(allImages, meta?.knownSessions ?? []);
    if (suspects.length > 0) {
        // Protected Update: Update global audit metadata
        const newAuditCache = {
            ...(meta.auditCache ?? {}),
            suspects: suspects
        };
        updateMetaSetting('auditCache', newAuditCache);
        
        showOrphanBadge(suspects.length);
    }
}