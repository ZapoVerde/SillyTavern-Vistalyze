/**
 * @file data/default-user/extensions/vistalyze/library.js
 * @stamp {"utc":"2026-05-03T14:15:00.000Z"}
 * @architectural-role Chat DNA Writer
 * @description
 * Writes location_def records into message.extra.vistalyze as an array.
 * 
 * @updates
 * - Added support for customBg property to allow persistence of manually 
 *   selected backgrounds in the chat DNA.
 *
 * @api-declaration
 * writeLocationDef(messageId, def, sessionId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [message.extra.vistalyze (write), saveChatConditional()]
 */
import { getContext } from '../../../extensions.js'
import { saveChatConditional } from '../../../../script.js'

/**
 * Writes a location definition into the chat DNA.
 * @param {number} messageId 
 * @param {object} def { key, name, description, imagePrompt, customBg }
 * @param {string} sessionId 
 */
export async function writeLocationDef(messageId, def, sessionId) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message) return

    message.extra = message.extra ?? {}
    const existing = message.extra.vistalyze;

    // Handle Array Pattern Migration
    if (!existing) {
        // Fresh start
        message.extra.vistalyze = [];
    } else if (!Array.isArray(existing)) {
        // Migration: Wrap existing object-style record into an array
        message.extra.vistalyze = [existing];
    }

    // Append the new definition to the ledger
    message.extra.vistalyze.push({
        type: 'location_def',
        key: def.key,
        name: def.name,
        description: def.description,
        imagePrompt: def.imagePrompt,
        customBg: def.customBg, // Persist manual override if present
        sessionId,
    });

    await saveChatConditional()
}