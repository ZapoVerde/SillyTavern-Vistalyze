/**
 * @file data/default-user/extensions/localyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-03T15:30:00.000Z"}
 * @version 1.1.0
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the Localyze environment for a specific chat.
 * 
 * @updates
 * - Migration: Replaced all direct state mutations with bulkInitState, 
 *   setFileIndex, addToFileIndex, and updateState setters.
 * - Standardized Metadata: Uses updateMetaSetting for global audit cache updates.
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

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
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
    console.debug('[Localyze:Boot] Starting sequence...');
    
    const context = getContext();
    if (!context.chatId) {
        console.debug('[Localyze:Boot] Abort: No active chatId found.');
        return;
    }

    // 1. Session & DNA Reconstruction
    // Derives the library and the "last known scene" from the chat JSONL.
    initSession();
    
    const reconstructed = reconstruct(context.chat);
    
    // Protected Update: Hydrate live state from reconstructed DNA
    bulkInitState(reconstructed);
    
    console.debug(`[Localyze:Boot] DNA Reconstructed: ${Object.keys(state.locations).length} locations found.`);

    // 2. Filesystem Reconciliation
    // Fetch the list of actual background files present on the server.
    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId);
    
    // Protected Update: Update the server asset cache
    setFileIndex(fileIndex);
    
    console.debug(`[Localyze:Boot] File Index: ${state.fileIndex.size} managed files detected.`);

    // 3. 404 Prevention & Self-Healing Queue
    const queue = [];

    // Check every location in the library. If its image is missing, queue it.
    for (const key of Object.keys(state.locations)) {
        const filename = `localyze_${state.sessionId}_${key}.png`;
        if (!state.fileIndex.has(filename)) {
            console.warn(`[Localyze:Boot] Asset missing from server: ${filename}. Queuing regeneration.`);
            queue.push(key);
        }
    }

    // Identify if the CURRENT scene's image is missing
    const isCurrentImageMissing = state.currentImage && !state.fileIndex.has(state.currentImage);

    // 4. UI Restoration
    if (state.currentImage && !isCurrentImageMissing) {
        // File exists on server: display it immediately
        console.debug('[Localyze:Boot] Restoring valid background:', state.currentImage);
        setBg(state.currentImage);
    } else {
        // File is missing or no scene active: clear the background to prevent 404 logs
        if (isCurrentImageMissing) {
            console.warn(`[Localyze:Boot] Active background ${state.currentImage} is missing. Clearing UI to prevent 404.`);
        }
        clearBg();
    }

    // 5. Execute Regeneration Queue
    if (queue.length > 0) {
        console.debug(`[Localyze:Boot] Regenerating ${queue.length} missing assets...`);
        for (const key of queue) {
            const def = state.locations[key];
            if (!def) continue;
            
            generate(key, def, state.sessionId)
                .then(async filename => {
                    // Protected Update: Add the new file to the index
                    addToFileIndex(filename);
                    
                    // If the regenerated file is the one we should be looking at, apply it now
                    if (filename === state.currentImage) {
                        console.log(`[Localyze:Boot] Active background regenerated: ${filename}. Applying to UI.`);
                        setBg(filename);
                    }
                })
                .catch(err => console.error(`[Localyze:Boot] Regeneration failed for "${key}":`, err));
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