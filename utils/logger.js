/**
 * @file data/default-user/extensions/localyze/utils/logger.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Utility
 * @description
 * Centralised logging wrapper for Localyze.
 *
 * - log() and warn() are gated behind DEFAULT_VERBOSE_LOGGING.
 * - error() always fires regardless of the flag.
 * - Calls with extra arguments (e.g. an error object) are rendered as a
 *   collapsed console group so the header stays on a single line.
 *
 * Usage:
 *   import { log, warn, error } from '../utils/logger.js';
 *   log('Boot', 'Session started:', id);      // → [Localyze:Boot] Session started: (collapsed)
 *   warn('Pipeline', 'Skipping stale job');   // → [Localyze:Pipeline] Skipping stale job
 *   error('Commit', 'Write failed:', err);    // → [Localyze:Commit] Write failed: (collapsed)
 *
 * @api-declaration
 * log(tag, ...args)   — verbose-gated informational output.
 * warn(tag, ...args)  — verbose-gated warning output.
 * error(tag, ...args) — always-on error output.
 */

import { DEFAULT_VERBOSE_LOGGING } from '../defaults.js';

/**
 * Emits a single labelled log line, collapsing any extra arguments into a group.
 * @param {Function} consoleFn The bound console method (log/warn/error) for detail lines.
 * @param {string} tag Module identifier, e.g. 'Boot'
 * @param {any[]} args Caller arguments: [message, ...details]
 */
function _output(consoleFn, tag, args) {
    const label = `[Localyze:${tag}] ${String(args[0] ?? '')}`;
    if (args.length <= 1) {
        consoleFn(label);
        return;
    }
    console.groupCollapsed(label);
    args.slice(1).forEach(a => consoleFn(a));
    console.groupEnd();
}

/**
 * Verbose-gated informational log.
 * @param {string} tag Module identifier
 * @param {...*} args  Message followed by any extra detail values
 */
export function log(tag, ...args) {
    if (!DEFAULT_VERBOSE_LOGGING) return;
    _output(console.log.bind(console), tag, args);
}

/**
 * Verbose-gated warning.
 * @param {string} tag Module identifier
 * @param {...*} args  Message followed by any extra detail values
 */
export function warn(tag, ...args) {
    if (!DEFAULT_VERBOSE_LOGGING) return;
    _output(console.warn.bind(console), tag, args);
}

/**
 * Always-on error output.
 * @param {string} tag Module identifier
 * @param {...*} args  Message followed by any extra detail values
 */
export function error(tag, ...args) {
    _output(console.error.bind(console), tag, args);
}
