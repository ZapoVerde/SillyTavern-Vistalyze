/**
 * @file data/default-user/extensions/localyze/detector.js
 * @stamp {"utc":"2025-05-15T11:00:00.000Z"}
 * @architectural-role LLM IO
 * @description
 * Owns the three LLM detection calls in the per-turn pipeline.
 * 
 * Updates:
 * - Removed JSON parsing for Step 3 (Describer).
 * - Implemented robust CNZ-style Marker Extraction (Regex) for Name/Definition/Visuals.
 * - Improved resilience against AI preambles and markdown formatting.
 *
 * @api-declaration
 * detectBoolean(messageText, currentLocation, ...) → boolean
 * detectClassifier(messageText, locationKeys, ...) → string | null
 * detectDescriber(contextText, ...) → object | null
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [generateQuietPrompt, ConnectionManagerRequestService]
 */
import { generateQuietPrompt } from '../../../../script.js'
import { ConnectionManagerRequestService } from '../../shared.js'

function interpolate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

/**
 * Robust Marker Extractor (CNZ Pattern).
 * Scans for Name:, Definition:, and Visuals: labels and captures the content.
 * Handles bolding (**Name:**) and trailing AI chatter.
 */
function extractMarkerData(raw) {
    const text = String(raw || '');
    const fieldMap = {
        name: 'Name',
        essence: 'Definition',
        atmosphere: 'Visuals'
    };
    const result = {};

    for (const [key, marker] of Object.entries(fieldMap)) {
        // Regex: finds "Marker:" (allowing for optional bolding asterisks) 
        // and captures everything until the next marker or end of string.
        const regex = new RegExp(`\\*?\\*?${marker}\\*?\\*?:\\s*([\\s\\S]*?)(?=\\n\\*?\\*?(?:Name|Definition|Visuals)\\*?\\*?:|$)`, 'i');
        const match = text.match(regex);
        if (match) {
            // Trim and clean up any lingering markdown artifacts
            result[key] = match[1].trim().replace(/^\*+|\*+$/g, '');
        }
    }

    // Validation: ensure we have at least a Name and Visuals to proceed
    if (!result.name || !result.atmosphere) {
        console.warn('[Localyze:Parser] Incomplete marker data found:', result);
        return null;
    }

    return result;
}

/**
 * Dispatches the prompt to the LLM.
 */
async function dispatch(prompt, profileId, label, extraOptions = {}) {
    console.debug(`[Localyze:${label}] Prompt Sent:\n${prompt}`);
    
    let result;
    if (profileId) {
        try {
            result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions);
            console.debug(`[Localyze:${label}] Raw result object (ConnectionManager):`, result);
        } catch (err) {
            console.warn(`[Localyze:${label}] ConnectionManager failed, falling back:`, err);
        }
    }

    if (!result) {
        try {
            result = await generateQuietPrompt({ 
                quietPrompt: prompt, 
                removeReasoning: true,
                ...extraOptions 
            });
            console.debug(`[Localyze:${label}] Raw result object (generateQuietPrompt):`, result);
        } catch (err) {
            console.error(`[Localyze:${label}] generateQuietPrompt failed:`, err);
            throw err;
        }
    }

    const text = result?.content ?? result;
    console.debug(`[Localyze:${label}] Extracted Text Output:\n${text}`);
    return text;
}

export async function detectBoolean(messageText, currentLocation, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        current_location: currentLocation,
        history: historyText,
        message: messageText,
    })
    const text = await dispatch(prompt, profileId, 'Boolean', { temperature: 0.1 })
    const answer = String(text).trim().toUpperCase().startsWith('YES')
    console.debug(`[Localyze:Boolean] → ${answer ? 'YES (location changed)' : 'NO (same location)'}`)
    return answer
}

export async function detectClassifier(messageText, locationKeys, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        key_list: locationKeys.join(', '),
        history: historyText,
        message: messageText,
    })
    
    const text = await dispatch(prompt, profileId, 'Classifier', { temperature: 0.1 })
    const cleanedText = String(text).trim()

    if (!cleanedText || cleanedText.toUpperCase().includes('NULL')) {
        console.debug('[Localyze:Classifier] → NULL (no match indicated)')
        return null
    }

    for (const key of locationKeys) {
        const regex = new RegExp(`\\b${key}\\b`, 'i');
        if (regex.test(cleanedText)) {
            console.debug(`[Localyze:Classifier] → Found key match: ${key}`)
            return key;
        }
    }

    const fallback = locationKeys.find(k => k === cleanedText.replace(/[^a-z0-9_]/gi, '').toLowerCase()) ?? null
    console.debug(`[Localyze:Classifier] → Final Match Result: ${fallback}`)
    return fallback
}

export async function detectDescriber(contextText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, { context: contextText })
    
    const raw = await dispatch(prompt, profileId, 'Describer', { 
        temperature: 0.1 
    })
    
    const parsed = extractMarkerData(raw)
    if (parsed === null) {
        console.error('[Localyze:Describer] Marker extraction failed. Raw input was:', raw)
    } else {
        console.debug('[Localyze:Describer] Final Extracted Object:', parsed)
    }
    return parsed
}