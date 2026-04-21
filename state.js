/**
 * @file data/default-user/extensions/vistalyze/state.js
 * @stamp {"utc":"2026-04-03T20:00:00.000Z"}
 * @architectural-role Stateful Owner (Runtime State)
 * @description
 * Single source of truth for all Vistalyze in-memory runtime state. 
 * 
 * STRICT CONTRACT:
 * 1. This module is the ONLY module permitted to mutate the 'state' object.
 * 2. External modules MUST use the provided Setter API for all updates.
 * 3. External modules may READ from the exported 'state' object directly.
 * 4. All objects passed into setters are structured-cloned to prevent reference leaks.
 *
 * @api-declaration
 * state                          — Read-only access to runtime data.
 * setSessionId(id)               — Sets the unique 8-char session key.
 * updateState(location, image)   — Updates the active scene and background.
 * bulkInitState(data)            — Hydrates state from reconstruction pass (includes transitionsMap, newFromMap).
 * upsertLocation(def)            — Adds or updates a definition in the library.
 * removeLocation(key)            — Deletes a definition from the library.
 * setFileIndex(files)            — Overwrites the known background file list.
 * addToFileIndex(file)           — Appends a single file to the known list.
 * setWorkshopKey(key)            — Sets the active location being edited.
 * syncDrafts()                   — Clones the library into the workshop draft.
 * stageDiscovery(def)            — Injects a new discovery result into drafts.
 * updateDraftField(k, f, v)      — Updates a specific field in a draft location.
 * removeDraft(key)               — Removes a location from the staged draft.
 * setProposedBlob(type, url)     — Stores temporary preview ObjectURLs.
 * clearWorkshop()                — Wipes all temporary workshop data.
 * resetState()                   — Restores state to factory defaults.
 */

export const state = {
    // Persistent Identity
    sessionId: null,

    // Live Library & Scene
    locations: {},         // key -> { name, description, imagePrompt, ... }
    currentLocation: null, // key
    currentImage: null,    // filename

    // Markov Transition Graph (derived from DNA during reconstruction)
    transitionsMap: {},    // { fromKey: { toKey: count } }
    newFromMap: {},        // { fromKey: count } — creation events per origin

    // Filesystem Cache
    fileIndex: new Set(),  // Set of filenames on server

    // Workshop (Temporary UI State)
    _activeWorkshopKey: null,
    _draftLocations: {},   // key -> { name, description, imagePrompt }
    _proposedImageBlob: null,
    _proposedFullBlob: null,
}

/**
 * Restores the entire state to its initial null/empty values.
 */
export function resetState() {
    state.sessionId = null;
    state.locations = {};
    state.currentLocation = null;
    state.currentImage = null;
    state.fileIndex = new Set();
    state.transitionsMap = {};
    state.newFromMap = {};

    clearWorkshop();
}

/**
 * Sets the session ID for the current chat.
 * @param {string} id 
 */
export function setSessionId(id) {
    state.sessionId = id;
}

/**
 * Updates the active scene tracking.
 * @param {string|null} location The location key.
 * @param {string|null} image The background filename.
 */
export function updateState(location, image) {
    state.currentLocation = location;
    state.currentImage = image;
}

/**
 * Performs a bulk update of the core library and scene.
 * Usually called after DNA reconstruction.
 */
export function bulkInitState({ locations, currentLocation, currentImage, transitionsMap, newFromMap }) {
    state.locations = structuredClone(locations);
    state.currentLocation = currentLocation;
    state.currentImage = currentImage;
    state.transitionsMap = structuredClone(transitionsMap ?? {});
    state.newFromMap = structuredClone(newFromMap ?? {});
}

/**
 * Adds or updates a location definition in the live library.
 * @param {object} def { key, name, description, imagePrompt, ... }
 */
export function upsertLocation(def) {
    if (!def.key) return;
    state.locations[def.key] = structuredClone(def);
}

/**
 * Removes a location definition from the live library.
 * @param {string} key 
 */
export function removeLocation(key) {
    delete state.locations[key];
}

/**
 * Overwrites the file index with a fresh list from the server.
 * @param {string[]} files 
 */
export function setFileIndex(files) {
    state.fileIndex = new Set(files);
}

/**
 * Adds a single filename to the existing file index.
 * @param {string} filename 
 */
export function addToFileIndex(filename) {
    state.fileIndex.add(filename);
}

// ─── Workshop Management ───────────────────────────────────────────────────

/**
 * Sets which location is currently being edited in the Architect view.
 * @param {string|null} key 
 */
export function setWorkshopKey(key) {
    state._activeWorkshopKey = key;
}

/**
 * Clones the live library into the temporary workshop draft state.
 */
export function syncDrafts() {
    state._draftLocations = structuredClone(state.locations);
    state._proposedImageBlob = null;
    state._proposedFullBlob = null;
}

/**
 * Injects a new discovery result into the draft dictionary.
 * @param {object} def 
 */
export function stageDiscovery(def) {
    if (!def.key) return;
    state._draftLocations[def.key] = structuredClone(def);
}

/**
 * Updates a specific field for a location in the draft library.
 * @param {string} key The location key in the draft.
 * @param {string} field 'name', 'description', or 'imagePrompt'.
 * @param {string} value The new text value.
 */
export function updateDraftField(key, field, value) {
    if (state._draftLocations[key]) {
        state._draftLocations[key][field] = value;
        
        // If visuals change, any existing pre-generated blobs are now invalid.
        if (field === 'imagePrompt') {
            state._proposedImageBlob = null;
            state._proposedFullBlob = null;
        }
    }
}

/**
 * Removes a location from the staged draft dictionary.
 * @param {string} key 
 */
export function removeDraft(key) {
    delete state._draftLocations[key];
}

/**
 * Stores a temporary ObjectURL for an image preview.
 * @param {'thumbnail'|'full'} type 
 * @param {string|null} url 
 */
export function setProposedBlob(type, url) {
    if (type === 'thumbnail') state._proposedImageBlob = url;
    if (type === 'full')      state._proposedFullBlob  = url;
}

/**
 * Wipes all temporary workshop data and draft edits.
 */
export function clearWorkshop() {
    state._activeWorkshopKey = null;
    state._draftLocations = {};
    state._proposedImageBlob = null;
    state._proposedFullBlob = null;
}