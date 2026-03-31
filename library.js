/**
 * @file data/default-user/extensions/localyze/library.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @architectural-role Chat DNA Writer
 * @description
 * Writes location_def records into message.extra.localyze. This is the sole
 * write path for location library entries — no LLM calls, no UI, no state
 * mutation. The written record becomes part of the chat DNA chain and is
 * picked up by reconstruction.js on next load.
 *
 * Edits are expressed as a new location_def with the same key; last write
 * wins during reconstruction forward pass.
 *
 * @api-declaration
 * writeLocationDef(messageId, def, sessionId) → Promise<void>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [message.extra.localyze (write), saveChatConditional()]
 */
import { getContext } from '../../../extensions.js'
import { saveChatConditional } from '../../../../script.js'

export async function writeLocationDef(messageId, def, sessionId) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message) return
    message.extra = message.extra ?? {}
    message.extra.localyze = {
        type: 'location_def',
        key: def.key,
        name: def.name,
        description: def.description,
        imagePrompt: def.imagePrompt,
        sessionId,
    }
    await saveChatConditional()
}
