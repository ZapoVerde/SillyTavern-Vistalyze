/**
 * @file data/default-user/extensions/localyze/utils/history.js
 * @stamp {"utc":"2026-04-03T20:00:00.000Z"}
 * @architectural-role Pure Functions / Text Processor
 * @description
 * Pure string and array manipulation utilities for the Localyze pipeline.
 * Contains logic for escaping HTML in UI elements, building history
 * transcripts for LLM context windows, and deterministic slugification.
 *
 * @updates
 * - Added slugify() for programmatic location key generation.
 * - Added buildSpatialContext() for Dynamic Markov Injection into Step 2.
 *
 * @api-declaration
 * escapeHtml(str) -> string
 * slugify(name) -> string
 * buildHistoryText(chat, beforeIndex, numPairs) -> string
 * buildDescriberContext(chat, messageId, numPairs) -> string
 * buildSpatialContext(currentLocation, transitionsMap, newFromMap) -> { spatial_transitions, spatial_discovery_count }
 *
 * @contract
 *   assertions:
 *     purity: pure
 *     state_ownership: none
 *     external_io: none
 */

/**
 * Escapes HTML special characters for safe rendering in popups/UI.
 * @param {string|null|undefined} str 
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Programmatically generates a stable, URL-safe key from a location name.
 * Used to maintain the "Immutable Link" between DNA and the filesystem.
 * @param {string|null|undefined} name 
 * @returns {string}
 */
export function slugify(name) {
    return (name ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Builds a formatted transcript of preceding turns for LLM context.
 * Pairs refer to (User + AI) blocks. This function excludes the current message.
 * 
 * @param {object[]} chat The full context.chat array.
 * @param {number} beforeIndex The index of the message currently being evaluated.
 * @param {number} numPairs Number of turn pairs to include.
 * @returns {string} Formatted history string.
 */
export function buildHistoryText(chat, beforeIndex, numPairs) {
    if (numPairs <= 0) return '';
    
    // Each pair is roughly 2 messages (User + AI)
    const start = Math.max(0, beforeIndex - (numPairs * 2));
    const slice = chat.slice(start, beforeIndex);
    
    if (!slice.length) return '';
    
    const transcript = slice
        .map(m => `${m.name ?? 'Unknown'}: ${m.mes ?? ''}`)
        .join('\n\n');
        
    return `Preceding turns:\n${transcript}\n\n`;
}

/** Minimum departures from a location before switching to bucket display. */
const SPATIAL_THRESHOLD = 5

/**
 * Builds the spatial context strings for Dynamic Markov Injection into Step 2.
 *
 * Below the threshold: lists all known destinations by name with counts.
 * Above the threshold: groups destinations into Often / Sometimes / Seldom buckets.
 * "New location (N)" competes for a bucket slot using the creation event count.
 * Returns a neutral string when no transition history exists.
 *
 * @param {string|null} currentLocation  The active location key.
 * @param {object} transitionsMap        { fromKey: { toKey: count } }
 * @param {object} newFromMap            { fromKey: count }
 * @returns {{ spatial_transitions: string, spatial_discovery_count: string }}
 */
export function buildSpatialContext(currentLocation, transitionsMap, newFromMap) {
    const NEUTRAL = 'No historical transitions recorded from this location.'

    if (!currentLocation) {
        return { spatial_transitions: NEUTRAL, spatial_discovery_count: '0' }
    }

    const knownDepartures = transitionsMap[currentLocation] ?? {}
    const discoveryCount = newFromMap[currentLocation] ?? 0
    const entries = Object.entries(knownDepartures)
    const totalDepartures = entries.reduce((sum, [, count]) => sum + count, 0)

    if (totalDepartures === 0) {
        return { spatial_transitions: NEUTRAL, spatial_discovery_count: '0' }
    }

    // Raw mode: below threshold, list all destinations by name
    if (totalDepartures <= SPATIAL_THRESHOLD) {
        const list = entries
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => `${key} (${count})`)
            .join(', ')
        return {
            spatial_transitions: list,
            spatial_discovery_count: String(discoveryCount),
        }
    }

    // Bucket mode: above threshold
    const buckets = { often: [], sometimes: [], seldom: [] }

    for (const [key, count] of entries) {
        const ratio = count / totalDepartures
        if (ratio >= 0.5)       buckets.often.push(`${key} (${count})`)
        else if (ratio >= 0.1)  buckets.sometimes.push(`${key} (${count})`)
        else if (count > 1)     buckets.seldom.push(`${key} (${count})`)
    }

    // "New location" competes for a bucket slot based on its discovery ratio
    if (discoveryCount > 0) {
        const newRatio = discoveryCount / totalDepartures
        const newEntry = `New location (${discoveryCount})`
        if (newRatio >= 0.5)        buckets.often.unshift(newEntry)
        else if (newRatio >= 0.1)   buckets.sometimes.unshift(newEntry)
        else if (discoveryCount > 1) buckets.seldom.unshift(newEntry)
    }

    const lines = []
    if (buckets.often.length)     lines.push(`Often: ${buckets.often.join(', ')}`)
    if (buckets.sometimes.length) lines.push(`Sometimes: ${buckets.sometimes.join(', ')}`)
    if (buckets.seldom.length)    lines.push(`Seldom: ${buckets.seldom.join(', ')}`)

    return {
        spatial_transitions: lines.length ? lines.join('\n') : NEUTRAL,
        spatial_discovery_count: String(discoveryCount),
    }
}

/**
 * Builds a formatted transcript for the Describer (Step 3).
 * Unlike buildHistoryText, this includes the message at messageId as the final turn.
 * 
 * @param {object[]} chat The full context.chat array.
 * @param {number} messageId The index of the trigger message.
 * @param {number} numPairs Number of preceding pairs to include.
 * @returns {string} Formatted continuous transcript string.
 */
export function buildDescriberContext(chat, messageId, numPairs) {
    const start = Math.max(0, messageId - (numPairs * 2));
    const slice = chat.slice(start, messageId + 1);
    
    return slice
        .map(m => `${m.name ?? 'Unknown'}: ${m.mes ?? ''}`)
        .join('\n\n');
}