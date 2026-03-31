/**
 * @file data/default-user/extensions/localyze/logic/maintenance.js
 * @stamp {"utc":"2026-04-01T18:30:00.000Z"}
 * @version 1.5.0
 * @architectural-role Orchestrator / Workshop Controller
 * @description
 * Manages the logic for the unified Location Workshop. This module acts as the
 * controller for the "Staged" workflow, allowing users to browse, discover, 
 * and refine locations in a temporary "Draft" state before committing 
 * changes to the chat DNA.
 *
 * Implements targeted regeneration (Regen Definition/Visuals) and discovery
 * logic using the "immediate feeling" principle (current transcript horizon).
 *
 * @core-principles
 * 1. STAGED EDITS: All changes are written to state._draftLocations.
 * 2. TARGETED REGEN: Allows updating specific fields (definition or visuals)
 *    independently via the LLM.
 * 3. PREVIEW CONFIDENCE: Logic for generating Dev Mode previews using the
 *    Settings Template for visual confirmation.
 *
 * @api-declaration
 * handleEditLocation(key)      — entry point to open workshop in Architect mode.
 * handleManualDescriber()      — entry point to open workshop in Explorer mode.
 * syncDraftState()             — clones live locations into the draft dictionary.
 * regenField(key, field)       — targeted AI update for a specific definition field.
 * discoverySearch(keywords)    — runs Step 3 detection and stages the result.
 * previewProposedImage(key)    — generates a Dev Mode preview blob for a draft.
 * deleteDraftLocation(key)     — removes a location from the current workshop session.
 *
 * @contract
 *   assertions:
 *     purity: Stateful Controller
 *     state_ownership: [state._draftLocations, state._activeWorkshopKey, state._proposedImageBlob]
 *     external_io: [LLM Detector, Image Cache, UI Workshop Modal]
 */

import { getContext } from '../../../../extensions.js';
import { state } from '../state.js';
import { getSettings } from '../settings/data.js';
import { detectDescriber } from '../detector.js';
import { fetchPreviewBlob } from '../imageCache.js';
import { buildDescriberContext, slugify } from '../utils/history.js';

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Prepares the Workshop by cloning the current library into a draft state.
 */
export function syncDraftState() {
    state._draftLocations = structuredClone(state.locations);
    state._proposedImageBlob = null;
    state._activeWorkshopKey = null;
}

/**
 * Entry point for the "Edit" action from the toolbar or picker.
 * @param {string} key 
 */
export async function handleEditLocation(key) {
    syncDraftState();
    state._activeWorkshopKey = key;
    
    // The UI module (workshopModal.js) will be responsible for showing the modal.
    // We import it dynamically to avoid circular dependencies.
    const { openWorkshop } = await import('../ui/workshopModal.js');
    openWorkshop('architect');
}

/**
 * Entry point for "Force Detect" or "Discovery" from the toolbar.
 */
export async function handleManualDescriber() {
    syncDraftState();
    
    const { openWorkshop } = await import('../ui/workshopModal.js');
    openWorkshop('explorer');
}

// ─── Refinement Logic ────────────────────────────────────────────────────────

/**
 * Targeted Regeneration.
 * Uses the current transcript to re-extract either the Definition (logic)
 * or the Visuals (image prompt) for a specific location.
 * 
 * @param {string} key The slug in _draftLocations.
 * @param {'description'|'imagePrompt'} field The field to update.
 */
export async function regenField(key, field) {
    const draft = state._draftLocations[key];
    if (!draft) return;

    const context = getContext();
    const s = getSettings();
    const lastMsgId = context.chat.length - 1;
    
    // Build context based on "immediate feeling" (current horizon)
    const contextText = buildDescriberContext(context.chat, lastMsgId, s.describerHistory ?? 3);
    
    // We use the standard describer, but we can append the existing name 
    // to focus the AI's attention.
    const augmentedContext = `FOCUS LOCATION: ${draft.name}\n\n${contextText}`;
    
    try {
        const result = await detectDescriber(augmentedContext, s.describerPrompt, s.describerProfileId);
        if (result && result[field]) {
            draft[field] = result[field];
            console.debug(`[Localyze:Regen] Updated ${field} for ${key}`);
            return true;
        }
    } catch (err) {
        console.error(`[Localyze:Regen] Targeted regen failed for ${field}:`, err);
        throw err;
    }
    return false;
}

/**
 * Visual Preview Logic.
 * Generates a low-res preview of the draft's visual prompt.
 * 
 * @param {string} key 
 * @returns {Promise<string>} Object URL for the blob.
 */
export async function previewProposedImage(key) {
    const draft = state._draftLocations[key];
    if (!draft || !draft.imagePrompt) return null;

    try {
        // fetchPreviewBlob internally applies the Settings Template and Dev Mode sizing.
        const blobUrl = await fetchPreviewBlob(draft.imagePrompt);
        state._proposedImageBlob = blobUrl;
        return blobUrl;
    } catch (err) {
        console.error('[Localyze:Preview] Workshop preview failed:', err);
        throw err;
    }
}

// ─── Discovery Logic ─────────────────────────────────────────────────────────

/**
 * The "Discovery Search" logic.
 * Runs detection based on optional keywords and current context.
 * 
 * @param {string} keywords User-provided hint (e.g. "A misty swamp").
 */
export async function discoverySearch(keywords = '') {
    const context = getContext();
    const s = getSettings();
    const lastMsgId = context.chat.length - 1;

    let contextText = buildDescriberContext(context.chat, lastMsgId, s.describerHistory ?? 3);
    if (keywords.trim()) {
        contextText = `USER HINT: ${keywords}\n\n${contextText}`;
    }

    const result = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId);

    if (result) {
        const key = slugify(result.name);
        state._draftLocations[key] = {
            ...result,
            key,
            sessionId: state.sessionId
        };
        state._activeWorkshopKey = key;
        return key;
    }
    
    return null;
}

/**
 * Removes a location from the current draft dictionary.
 */
export function deleteDraftLocation(key) {
    if (state._draftLocations[key]) {
        delete state._draftLocations[key];
        if (state._activeWorkshopKey === key) {
            state._activeWorkshopKey = null;
            state._proposedImageBlob = null;
        }
        return true;
    }
    return false;
}