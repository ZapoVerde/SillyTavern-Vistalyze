/**
 * @file data/default-user/extensions/localyze/reconstruction.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives all Localyze runtime state from a single forward pass over the chat
 * log. No IO, no side effects, no imports. Takes the chat array and returns a
 * plain object; index.js assigns the result to the state singleton.
 *
 * Two record types are recognised in message.extra.localyze:
 *   location_def — location library entry; last write for a given key wins
 *   scene        — scene transition; last entry drives currentLocation/Image
 *
 * This function is the self-healing mechanism: any lost or corrupted record
 * simply isn't counted. The chat log is the database.
 *
 * @api-declaration
 * reconstruct(chat) → { locations, transitions, currentLocation, currentImage }
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: []
 *     external_io: []
 */
export function reconstruct(chat) {
    const locations = {}
    const transitions = []

    for (const message of chat) {
        const rec = message.extra?.localyze
        if (!rec) continue
        if (rec.type === 'location_def') {
            locations[rec.key] = rec
        } else if (rec.type === 'scene') {
            transitions.push(rec)
        }
    }

    const last = transitions.at(-1)
    return {
        locations,
        transitions,
        currentLocation: last?.location ?? null,
        currentImage: last?.image ?? null,
    }
}
