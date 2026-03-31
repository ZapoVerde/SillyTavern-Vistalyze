/**
 * @file data/default-user/extensions/localyze/utils/lock.js
 * @stamp {"utc":"2026-03-31T00:00:00.000Z"}
 * @architectural-role Utility / Concurrency Mechanic
 * @description
 * Implements a simple Mutex (Mutual Exclusion) lock for asynchronous operations.
 * 
 * In the Localyze architecture, this utility is used by the DNA Writers to 
 * ensure that writes to the chat log (JSONL) are serialized. This prevents 
 * "lost updates" when an AI message received event and an image generation 
 * completion event attempt to patch the same message simultaneously.
 *
 * @api-declaration
 * class AsyncLock
 *   acquire() -> Promise<void>
 *   release() -> void
 *
 * @contract
 *   assertions:
 *     purity: pure mechanic
 *     state_ownership: [internal queue]
 *     external_io: none
 */

/**
 * A Mutex for coordinating asynchronous tasks.
 */
export class AsyncLock {
    constructor() {
        /** @type {boolean} */
        this.locked = false;
        /** @type {Function[]} */
        this.queue = [];
    }

    /**
     * Acquires the lock. If the lock is already held, returns a promise 
     * that resolves when the lock is released and this caller is next in line.
     * @returns {Promise<void>}
     */
    async acquire() {
        if (!this.locked) {
            this.locked = true;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }

    /**
     * Releases the lock and allows the next queued caller to proceed.
     */
    release() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }
}