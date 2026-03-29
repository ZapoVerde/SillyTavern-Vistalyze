/**
 * @file data/default-user/extensions/localyze/state.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Runtime State
 * @description
 * Single source of truth for all Localyze in-memory runtime state. Fully
 * rebuilt from the chat log and filesystem on every CHAT_CHANGED — nothing
 * here is persisted directly. Only this module is permitted to mutate the
 * state object; all other modules read it or call updateState().
 *
 * @api-declaration
 * state          — the state object (read from anywhere, mutated here only)
 * resetState()   — zeroes all fields; called by index.js on CHAT_CHANGED
 * updateState()  — sets currentLocation and currentImage after a transition
 *
 * @contract
 *   assertions:
 *     purity: stateful
 *     state_ownership: [state.currentLocation, state.currentImage,
 *       state.sessionId, state.locations, state.fileIndex]
 *     external_io: []
 */
export const state = {
    currentLocation: null,
    currentImage: null,
    sessionId: null,
    locations: {},
    fileIndex: new Set(),
}

export function resetState() {
    state.currentLocation = null
    state.currentImage = null
    state.sessionId = null
    state.locations = {}
    state.fileIndex = new Set()
}

export function updateState(location, image) {
    state.currentLocation = location
    state.currentImage = image
}
