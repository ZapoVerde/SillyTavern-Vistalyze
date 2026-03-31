/**
 * @file data/default-user/extensions/localyze/detector.js
 * @stamp {"utc":"2026-04-01T15:30:00.000Z"}
 * @version 1.1.1
 * @architectural-role LLM IO
 * @description
 * Owns the three LLM detection calls in the per-turn pipeline.
 * 
 * Version 1.1.1 Updates:
 * - Upgraded detectClassifier to use robust key-matching (Semantic Search).
 * - Scans LLM response for valid keys using word boundaries.
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
 * JSON Schema for Structured Outputs (Location Archivist).
 */
const DESCRIBER_SCHEMA = {
    type: "json_schema",
    json_schema: {
        name: "location_definition",
        strict: true,
        schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Human-readable label for the location" },
                essence: { type: "string", description: "A conceptual definition of what the place is" },
                atmosphere: { type: "string", description: "2-3 sentences of visual/sensory details for image generation" }
            },
            required: ["name", "essence", "atmosphere"],
            additionalProperties: false
        }
    }
};

function interpolate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

function safeParseJSON(raw) {
    try {
        const stripped = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim()
        return JSON.parse(stripped)
    } catch {
        return null
    }
}

async function dispatch(prompt, profileId, label, extraOptions = {}) {
    console.debug(`[Localyze:${label}] Prompt:\n${prompt}`)
    
    if (profileId) {
        try {
            const result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions)
            const text = result.content ?? result
            console.debug(`[Localyze:${label}] Response (ConnectionManager):\n${text}`)
            return text
        } catch (err) {
            console.warn(`[Localyze:${label}] ConnectionManager failed, falling back:`, err)
        }
    }

    try {
        const text = await generateQuietPrompt({ 
            quietPrompt: prompt, 
            removeReasoning: true,
            ...extraOptions 
        })
        console.debug(`[Localyze:${label}] Response (generateQuietPrompt):\n${text}`)
        return text
    } catch (err) {
        console.error(`[Localyze:${label}] generateQuietPrompt failed:`, err)
        throw err
    }
}

export async function detectBoolean(messageText, currentLocation, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        current_location: currentLocation,
        history: historyText,
        message: messageText,
    })
    const result = await dispatch(prompt, profileId, 'Boolean', { temperature: 0.1 })
    const answer = String(result).trim().toUpperCase().startsWith('YES')
    console.debug(`[Localyze:Boolean] → ${answer ? 'YES (location changed)' : 'NO (same location)'}`)
    return answer
}

/**
 * Identifies which location key matches the current context.
 * Performs a robust search: scans the LLM output for the presence of known keys.
 */
export async function detectClassifier(messageText, locationKeys, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        key_list: locationKeys.join(', '),
        history: historyText,
        message: messageText,
    })
    
    const rawResult = await dispatch(prompt, profileId, 'Classifier', { temperature: 0.1 })
    const text = String(rawResult).trim()

    if (!text || text.toUpperCase().includes('NULL')) {
        console.debug('[Localyze:Classifier] → NULL (no match indicated)')
        return null
    }

    // Robust Search: Iterate through valid keys and find if any are present in the text.
    // We check for word boundaries to prevent 'inn' matching 'dinner'.
    for (const key of locationKeys) {
        const regex = new RegExp(`\\b${key}\\b`, 'i');
        if (regex.test(text)) {
            console.debug(`[Localyze:Classifier] → Found key match: ${key}`)
            return key;
        }
    }

    // Final fallback: Clean the whole string and try exact match
    const cleaned = text.replace(/[^a-z0-9_]/gi, '').toLowerCase()
    const fallback = locationKeys.find(k => k === cleaned) ?? null
    
    console.debug(`[Localyze:Classifier] → ${fallback ?? `no match found in "${text}"`}`)
    return fallback
}

export async function detectDescriber(contextText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, { context: contextText })
    
    const raw = await dispatch(prompt, profileId, 'Describer', { 
        response_format: DESCRIBER_SCHEMA,
        temperature: 0.1 
    })
    
    const parsed = safeParseJSON(String(raw))
    if (parsed === null) {
        console.warn('[Localyze:Describer] JSON parse failed. Raw output was:\n', raw)
    } else {
        console.debug('[Localyze:Describer] →', parsed)
    }
    return parsed
}