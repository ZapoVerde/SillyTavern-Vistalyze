/**
 * @file data/default-user/extensions/localyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-04-02T17:10:00.000Z"}
 * @version 1.0.2
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the Localyze environment for a specific chat.
 * 
 * @updates
 * - Hardened Self-Healing: Prevents 404 errors by checking state.fileIndex 
 *   before calling setBg().
 * - Proactive UI Clearing: Calls clearBg() if the DNA-specified image is missing.
 * - Enhanced Logging: Provides clarity on why regenerations are triggered.
 *
 * @api-declaration
 * runBoot() -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: Stateful IO
 *     state_ownership: [state (mutates via reset/update)]
 *     external_io: [session, reconstruction, imageCache, background, orphanDetector]
 */

import { saveSettingsDebounced } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { state } from '../state.js';
import { initSession } from '../session.js';
import { reconstruct } from '../reconstruction.js';
import { fetchFileIndex, generate } from '../imageCache.js';
import { set as setBg, clear as clearBg } from '../background.js';
import { fastDiff } from '../orphanDetector.js';
import { showOrphanBadge } from '../ui/toolbar.js';
import { getMetaSettings } from '../settings/data.js';

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
    const { locations, transitions, currentLocation, currentImage } = reconstruct(context.chat);
    
    state.locations = locations;
    state.currentLocation = currentLocation;
    state.currentImage = currentImage;
    console.debug(`[Localyze:Boot] DNA Reconstructed: ${Object.keys(locations).length} locations found.`);

    // 2. Filesystem Reconciliation
    // Fetch the list of actual background files present on the server.
    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId);
    state.fileIndex = fileIndex;
    console.debug(`[Localyze:Boot] File Index: ${fileIndex.size} managed files detected.`);

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

    // Identify if the CURRENT scene's image is missing (The "Ridge House" Fix)
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
                    state.fileIndex.add(filename);
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
        meta.auditCache = meta.auditCache ?? {};
        meta.auditCache.suspects = suspects;
        saveSettingsDebounced();
        showOrphanBadge(suspects.length);
    }
}