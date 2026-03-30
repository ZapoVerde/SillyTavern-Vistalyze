/**
 * @file data/default-user/extensions/localyze/utils/history.js
 * @stamp {"utc":"2026-04-01T12:05:00.000Z"}
 * @version 1.2.0
 * @architectural-role Pure Functions / Text Processor
 * @description
 * Pure string and array manipulation utilities for the Localyze pipeline.
 * Contains logic for escaping HTML in UI elements, building history 
 * transcripts for LLM context windows, and deterministic slugification.
 * 
 * Version 1.2.0 Updates:
 * - Added slugify() for programmatic location key generation.
 *
 * @api-declaration
 * escapeHtml(str) -> string
 * slugify(name) -> string
 * buildHistoryText(chat, beforeIndex, numPairs) -> string
 * buildDescriberContext(chat, messageId, numPairs) -> string
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