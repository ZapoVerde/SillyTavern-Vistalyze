/**
 * @file data/default-user/extensions/localyze/reconstruction.js
 * @stamp {"utc":"2026-04-02T12:10:00.000Z"}
 * @architectural-role State Derivation (Pure)
 * @description
 * Derives all Localyze runtime state from a single forward pass over the chat
 * log. 
 * 
 * @updates
 * - Added support for the "Array Pattern" in message.extra.localyze.
 * - Handles both single-object (legacy) and array-based (current) records.
 * - This allows a single message to define a location AND trigger a scene shift.
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
        const localyzeData = message.extra?.localyze
        if (!localyzeData) continue

        // Normalize to array to handle both legacy and new patterns
        const records = Array.isArray(localyzeData) ? localyzeData : [localyzeData]

        for (const rec of records) {
            if (!rec || typeof rec !== 'object') continue

            if (rec.type === 'location_def') {
                // Last write for a given key wins (edit support)
                locations[rec.key] = rec
            } else if (rec.type === 'scene') {
                transitions.push(rec)
            }
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