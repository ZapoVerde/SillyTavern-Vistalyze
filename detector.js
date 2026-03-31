/**
 * @file data/default-user/extensions/localyze/detector.js
 * @stamp {"utc":"2026-04-01T15:10:00.000Z"}
 * @version 1.1.2
 * @architectural-role LLM IO
 * @description
 * Owns the three LLM detection calls in the per-turn pipeline.
 * 
 * Version 1.1.2 Updates:
 * - Hardened dispatch debugging to log the raw response object for diagnostic clarity.
 * - Simplified response_format to 'json_object' for broader provider compatibility.
 * - Improved safeParseJSON to handle non-string or already-parsed inputs.
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

/**
 * Simplified JSON Object request for broader compatibility across backends.
 */
const DESCRIBER_FORMAT = { type: "json_object" };

function interpolate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

/**
 * Robust JSON parser that handles markdown fences and already-parsed objects.
 */
function safeParseJSON(raw) {
    if (typeof raw === 'object' && raw !== null) return raw;
    try {
        const str = String(raw || '').trim();
        if (!str) return null;
        
        const stripped = str
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        return JSON.parse(stripped);
    } catch (err) {
        console.warn('[Localyze:JSON] Parse failed:', err.message);
        return null;
    }
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
        response_format: DESCRIBER_FORMAT,
        temperature: 0.1 
    })
    
    const parsed = safeParseJSON(raw)
    if (parsed === null) {
        console.error('[Localyze:Describer] Final JSON check failed. Raw input was:', raw)
    } else {
        console.debug('[Localyze:Describer] Final Parsed Object:', parsed)
    }
    return parsed
}