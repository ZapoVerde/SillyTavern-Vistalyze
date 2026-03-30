/**
 * @file data/default-user/extensions/localyze/utils/history.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Pure Functions / Text Processor
 * @description
 * Pure string and array manipulation utilities for the Localyze pipeline.
 * Contains logic for escaping HTML in UI elements and building history 
 * transcripts for LLM context windows.
 *
 * @api-declaration
 * escapeHtml(str) -> string
 * buildHistoryText(chat, beforeIndex, numPairs) -> string
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
 * Builds a formatted transcript of preceding turns for LLM context.
 * Pairs refer to (User + AI) blocks.
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