/**
 * @file data/default-user/extensions/localyze/io/dnaWriter.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role IO Executor / DNA Chain Writer
 * @description
 * Handles all writes to message.extra.localyze with integrated concurrency 
 * locking. This ensures that rapid events (like an AI message arriving 
 * while an image generation finishes) do not cause "lost updates" in the 
 * chat JSONL.
 * 
 * This module coordinates with SillyTavern's saveChatConditional to persist 
 * state changes immediately to disk.
 *
 * @api-declaration
 * lockedWriteSceneRecord(messageId, record) -> Promise<void>
 * lockedPatchSceneImage(messageId, filename) -> Promise<void>
 * lockedWriteLocationDef(messageId, def, sessionId) -> Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [Mutex Queue]
 *     external_io: [message.extra.localyze (write), saveChatConditional()]
 */

import { saveChatConditional } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { AsyncLock } from '../utils/lock.js';
import { writeLocationDef } from '../library.js';

/** Singleton lock for all chat write operations in this extension. */
const writeLock = new AsyncLock();

/**
 * Writes a scene transition record to a message.
 * @param {number} messageId 
 * @param {object} record { location, image, bg_declined }
 */
export async function lockedWriteSceneRecord(messageId, record) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message) {
            message.extra = message.extra ?? {};
            message.extra.localyze = { 
                type: 'scene', 
                ...record 
            };
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Patches an existing scene record with a generated filename.
 * Used in the Two-Write Pattern once async generation completes.
 * @param {number} messageId 
 * @param {string} filename 
 */
export async function lockedPatchSceneImage(messageId, filename) {
    await writeLock.acquire();
    try {
        const context = getContext();
        const message = context.chat[messageId];
        if (message && message.extra?.localyze) {
            message.extra.localyze.image = filename;
            await saveChatConditional();
        }
    } finally {
        writeLock.release();
    }
}

/**
 * Writes a location definition to the chat history.
 * @param {number} messageId 
 * @param {object} def { name, key, description, imagePrompt }
 * @param {string} sessionId 
 */
export async function lockedWriteLocationDef(messageId, def, sessionId) {
    await writeLock.acquire();
    try {
        // library.js handles the object formatting
        await writeLocationDef(messageId, def, sessionId);
    } finally {
        writeLock.release();
    }
}