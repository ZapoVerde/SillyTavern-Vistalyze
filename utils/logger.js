/**
 * @file data/default-user/extensions/vistalyze/utils/logger.js
 * @stamp {"utc":"2026-04-04T00:00:00.000Z"}
 * @architectural-role Utility
 * @description
 * Centralised logging wrapper for Vistalyze.
 *
 * - log() and warn() are gated behind DEFAULT_VERBOSE_LOGGING.
 * - error() always fires regardless of the flag.
 * - Calls with extra arguments (e.g. an error object) are rendered as a
 *   collapsed console group so the header stays on a single line.
 *
 * Usage:
 *   import { log, warn, error } from '../utils/logger.js';
 *   log('Boot', 'Session started:', id);      // → [Vistalyze:Boot] Session started: (collapsed)
 *   warn('Pipeline', 'Skipping stale job');   // → [Vistalyze:Pipeline] Skipping stale job
 *   error('Commit', 'Write failed:', err);    // → [Vistalyze:Commit] Write failed: (collapsed)
 *
 * @api-declaration
 * log(tag, ...args)   — verbose-gated informational output.
 * warn(tag, ...args)  — verbose-gated warning output.
 * error(tag, ...args) — always-on error output.
 */

import { DEFAULT_VERBOSE_LOGGING } from '../defaults.js';

/** Runtime verbose flag — initialised from the compile-time default, then updated by settings. */
let _verboseLogging = DEFAULT_VERBOSE_LOGGING;

/**
 * Updates the runtime verbose flag.
 * Call this once during settings initialisation and again whenever the setting changes.
 * @param {boolean} value
 */
export function setVerboseLogging(value) {
    _verboseLogging = Boolean(value);
}

/**
 * Emits a single labelled log line, collapsing any extra arguments into a group.
 * @param {Function} consoleFn The bound console method (log/warn/error) for detail lines.
 * @param {string} tag Module identifier, e.g. 'Boot'
 * @param {any[]} args Caller arguments: [message, ...details]
 */
function _output(consoleFn, tag, args) {
    const label = `[Vistalyze:${tag}] ${String(args[0] ?? '')}`;
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
    if (!_verboseLogging) return;
    _output(console.log.bind(console), tag, args);
}

/**
 * Verbose-gated warning.
 * @param {string} tag Module identifier
 * @param {...*} args  Message followed by any extra detail values
 */
export function warn(tag, ...args) {
    if (!_verboseLogging) return;
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
