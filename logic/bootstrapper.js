/**
 * @file data/default-user/extensions/localyze/logic/bootstrapper.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Orchestrator / Boot Sequence
 * @description
 * Manages the initialization of the Localyze environment for a specific chat.
 * 
 * Logic flow:
 * 1. Initialize session identity (sessionId).
 * 2. Reconstruct state from chat DNA (locations, transitions).
 * 3. Reconcile filesystem (fileIndex).
 * 4. Queue silent regeneration for missing assets.
 * 5. Restore active background.
 * 6. Run fast orphan detection for toolbar notification.
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
import { state, resetState } from '../state.js';
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
    initSession();
    console.debug('[Localyze:Boot] SessionID:', state.sessionId);

    const { locations, transitions, currentLocation, currentImage } = reconstruct(context.chat);
    state.locations = locations;
    state.currentLocation = currentLocation;
    state.currentImage = currentImage;
    console.debug(`[Localyze:Boot] DNA Reconstructed: ${Object.keys(locations).length} locations, ${transitions.length} transitions found.`);

    // 2. Filesystem Reconciliation
    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId);
    state.fileIndex = fileIndex;
    console.debug(`[Localyze:Boot] File Index: ${fileIndex.size} managed files detected.`);

    // 3. Regeneration Queue (Self-Healing)
    const queue = [];

    // Path A: Known locations with no corresponding file
    for (const key of Object.keys(state.locations)) {
        const filename = `localyze_${state.sessionId}_${key}.png`;
        if (!state.fileIndex.has(filename)) {
            queue.push(key);
        }
    }

    // Path B: Scene records with null image (interrupted Two-Write Pattern)
    for (const t of transitions) {
        if (t.location && !t.image && !queue.includes(t.location)) {
            queue.push(t.location);
        }
    }

    if (queue.length > 0) {
        console.debug(`[Localyze:Boot] Queueing ${queue.length} silent regenerations...`);
        for (const key of queue) {
            const def = state.locations[key];
            if (!def) continue;
            
            generate(key, def, state.sessionId)
                .then(async filename => {
                    state.fileIndex.add(filename);
                    // If the regenerated file matches what we SHOULD be seeing, apply it now
                    if (filename === state.currentImage) setBg(filename);
                })
                .catch(err => console.error(`[Localyze:Boot] Silent regen failed for "${key}":`, err));
        }
    }

    // 4. Restore Background State
    if (state.currentImage && state.fileIndex.has(state.currentImage)) {
        console.debug('[Localyze:Boot] Restoring background:', state.currentImage);
        setBg(state.currentImage);
    } else {
        console.debug('[Localyze:Boot] No valid background found - clearing view.');
        clearBg();
    }

    // 5. Fast Orphan Detection (Identity-based check)
    const meta = getMetaSettings();
    const suspects = fastDiff(allImages, meta?.knownSessions ?? []);
    if (suspects.length > 0) {
        console.debug(`[Localyze:Boot] Orphan check: ${suspects.length} suspect files found.`);
        meta.auditCache = meta.auditCache ?? {};
        meta.auditCache.suspects = suspects;
        saveSettingsDebounced();
        showOrphanBadge(suspects.length);
    }
}