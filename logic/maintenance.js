/**
 * @file data/default-user/extensions/localyze/logic/maintenance.js
 * @stamp {"utc":"2026-04-01T23:55:00.000Z"}
 * @version 1.5.2
 * @architectural-role Orchestrator / Workshop Controller
 * @description
 * Manages the logic for the unified Location Workshop. This module acts as the
 * controller for the "Staged" workflow, allowing users to browse, discover, 
 * and refine locations in a temporary "Draft" state before committing 
 * changes to the chat DNA.
 *
 * @updates
 * - Added handleOpenLibrary() to ensure draft state is synced before UI display.
 * - Implemented dual-mode discoverySearch (Passive vs Targeted).
 * - Targeted mode uses Step 4 settings and interpolates {{keywords}}.
 *
 * @api-declaration
 * handleOpenLibrary()           — entry point to open workshop in Library mode.
 * handleEditLocation(key)      — entry point to open workshop in Architect mode.
 * handleManualDescriber()      — entry point to open workshop in Explorer mode.
 * syncDraftState()             — clones live locations into the draft dictionary.
 * regenField(key, field)       — targeted AI update for a specific definition field.
 * discoverySearch(keywords)    — runs Step 3 or Step 4 detection and stages result.
 * previewProposedImage(key)    — generates a Dev Mode preview blob for a draft.
 * deleteDraftLocation(key)     — removes a location from the workshop draft.
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
 * Entry point for the "Library" action from the toolbar.
 * Ensures data is synced before opening the UI.
 */
export async function handleOpenLibrary() {
    syncDraftState();
    
    const { openWorkshop } = await import('../ui/workshopModal.js');
    openWorkshop('library');
}

/**
 * Entry point for the "Edit" action from the toolbar.
 * @param {string} key 
 */
export async function handleEditLocation(key) {
    syncDraftState();
    state._activeWorkshopKey = key;
    
    const { openWorkshop } = await import('../ui/workshopModal.js');
    openWorkshop('architect');
}

/**
 * Entry point for "Discovery" (Force Detect) from the toolbar.
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
 */
export async function regenField(key, field) {
    const draft = state._draftLocations[key];
    if (!draft) return;

    const context = getContext();
    const s = getSettings();
    const lastMsgId = context.chat.length - 1;
    
    const contextText = buildDescriberContext(context.chat, lastMsgId, s.describerHistory ?? 3);
    const augmentedContext = `FOCUS LOCATION: ${draft.name}\n\n${contextText}`;
    
    try {
        const result = await detectDescriber(augmentedContext, s.describerPrompt, s.describerProfileId);
        if (result && result[field]) {
            draft[field] = result[field];
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
 */
export async function previewProposedImage(key) {
    const draft = state._draftLocations[key];
    if (!draft || !draft.imagePrompt) return null;

    try {
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
 * 
 * Logic:
 * 1. If keywords are provided: Use Step 4 (Discovery) configuration.
 * 2. If keywords are empty: Use Step 3 (Describer) configuration.
 * 
 * @param {string} keywords User-provided hint.
 */
export async function discoverySearch(keywords = '') {
    const context = getContext();
    const s = getSettings();
    const lastMsgId = context.chat.length - 1;
    const hasKeywords = keywords.trim().length > 0;

    // Determine config based on mode
    const historyLen = hasKeywords ? (s.discoveryHistory ?? 3) : (s.describerHistory ?? 3);
    const profileId  = hasKeywords ? s.discoveryProfileId : s.describerProfileId;
    let promptTemplate = hasKeywords ? s.discoveryPrompt : s.describerPrompt;

    // If targeted, pre-interpolate keywords into the template
    if (hasKeywords) {
        promptTemplate = promptTemplate.replace(/\{\{keywords\}\}/g, keywords);
    }

    const contextText = buildDescriberContext(context.chat, lastMsgId, historyLen);
    const result = await detectDescriber(contextText, promptTemplate, profileId);

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