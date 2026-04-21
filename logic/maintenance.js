/**
 * @file data/default-user/extensions/vistalyze/logic/maintenance.js
 * @stamp {"utc":"2026-04-03T18:30:00.000Z"}
 * @version 1.7.0
 * @architectural-role Orchestrator / Workshop Controller
 * @description
 * Manages the logic for the unified Location Workshop.
 *
 * @updates
 * - Migration: Replaced final direct draft mutations with stageDiscovery() and removeDraft().
 * - Full Compliance: The maintenance module is now 100% compliant with the Gatekeeper Architecture.
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
 *     state_ownership: [state (mutates via setters)]
 *     external_io: [LLM Detector, Image Cache, UI Workshop Modal]
 */

import { getContext } from '../../../../extensions.js';
import { error } from '../utils/logger.js';
import { 
    state, 
    syncDrafts, 
    setWorkshopKey, 
    updateDraftField, 
    setProposedBlob, 
    stageDiscovery, 
    removeDraft 
} from '../state.js';
import { getSettings } from '../settings/data.js';
import { detectDescriber } from '../detector.js';
import { fetchPreviewBlob, fetchFullBlob } from '../imageCache.js';
import { buildDescriberContext, slugify } from '../utils/history.js';

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Prepares the Workshop by cloning the current library into a draft state.
 */
export function syncDraftState() {
    syncDrafts();
}

/**
 * Entry point for the "Library" action from the toolbar.
 */
export async function handleOpenLibrary() {
    syncDraftState();
    
    const { openWorkshop } = await import('../ui/workshopModal.js');
    openWorkshop('library');
}

/**
 * Entry point for the "Edit" action from the toolbar.
 */
export async function handleEditLocation(key) {
    syncDraftState();
    
    // Protected Update: Set editing target
    setWorkshopKey(key);
    
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
 * @param {string} key The draft location key.
 * @param {string} field 'description' or 'imagePrompt'
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
            // Protected Update: Update the staged field
            updateDraftField(key, field, result[field]);
            return true;
        }
    } catch (err) {
        error('Regen', `Targeted regen failed for ${field}:`, err);
        throw err;
    }
    return false;
}

/**
 * Visual Preview Logic (Dev Mode).
 */
export async function previewProposedImage(key) {
    const draft = state._draftLocations[key];
    if (!draft || !draft.imagePrompt) return null;

    try {
        const blobUrl = await fetchPreviewBlob(draft.imagePrompt);
        
        // Protected Update: Cache the thumbnail blob
        setProposedBlob('thumbnail', blobUrl);
        return blobUrl;
    } catch (err) {
        error('Preview', 'Workshop preview failed:', err);
        throw err;
    }
}

/**
 * Full-Resolution Preview.
 */
export async function generateFullPreview(key) {
    const draft = state._draftLocations[key];
    if (!draft || !draft.imagePrompt) return null;

    try {
        const blobUrl = await fetchFullBlob(draft);
        
        // Protected Update: Cache the full-res blob
        setProposedBlob('full', blobUrl);
        return blobUrl;
    } catch (err) {
        error('Preview', 'Full preview generation failed:', err);
        throw err;
    }
}

// ─── Discovery Logic ─────────────────────────────────────────────────────────

/**
 * The "Discovery Search" logic.
 */
export async function discoverySearch(keywords = '') {
    const context = getContext();
    const s = getSettings();
    const lastMsgId = context.chat.length - 1;
    const hasKeywords = keywords.trim().length > 0;

    const historyLen = hasKeywords ? (s.discoveryHistory ?? 3) : (s.describerHistory ?? 3);
    const profileId  = hasKeywords ? s.discoveryProfileId : s.describerProfileId;
    let promptTemplate = hasKeywords ? s.discoveryPrompt : s.describerPrompt;

    if (hasKeywords) {
        promptTemplate = promptTemplate.replace(/\{\{keywords\}\}/g, keywords);
    }

    const contextText = buildDescriberContext(context.chat, lastMsgId, historyLen);
    const result = await detectDescriber(contextText, promptTemplate, profileId);

    if (result) {
        const key = slugify(result.name);
        const stagedDef = {
            key,
            name: result.name,
            description: result.description,
            imagePrompt: result.imagePrompt,
            sessionId: state.sessionId
        };
        
        // Protected Update: Inject new discovery into draft memory
        stageDiscovery(stagedDef);
        
        // Protected Update: Activate it for editing
        setWorkshopKey(key);
        return key;
    }
    
    return null;
}

/**
 * Removes a location from the current draft dictionary.
 */
export function deleteDraftLocation(key) {
    if (state._draftLocations[key]) {
        // Protected Update: Remove from staged draft
        removeDraft(key);
        
        if (state._activeWorkshopKey === key) {
            setWorkshopKey(null);
        }
        return true;
    }
    return false;
}