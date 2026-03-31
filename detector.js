/**
 * @file data/default-user/extensions/localyze/detector.js
 * @stamp {"utc":"2026-04-01T15:00:00.000Z"}
 * @version 1.1.0
 * @architectural-role LLM IO
 * @description
 * Owns the three LLM detection calls in the per-turn pipeline.
 * 
 * Version 1.1.0 Updates:
 * - Added Structured Outputs (JSON Schema) support for the Describer step.
 * - Enforces JSON mode and low temperature for extraction consistency.
 * - Updated dispatch to handle response_format for compatible backends (OpenRouter/Gemini).
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
 * Enforces name, essence, and atmosphere fields.
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

/**
 * Dispatches the prompt to the LLM.
 * @param {string} prompt 
 * @param {string|null} profileId 
 * @param {string} label 
 * @param {object} extraOptions Options like response_format or temperature.
 */
async function dispatch(prompt, profileId, label, extraOptions = {}) {
    console.debug(`[Localyze:${label}] Prompt:\n${prompt}`)
    
    if (profileId) {
        try {
            // ConnectionManager implementation varies; we attempt to pass extraOptions
            const result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null, extraOptions)
            const text = result.content ?? result
            console.debug(`[Localyze:${label}] Response (ConnectionManager):\n${text}`)
            return text
        } catch (err) {
            console.warn(`[Localyze:${label}] ConnectionManager failed, falling back:`, err)
        }
    }

    try {
        // We pass prompt and options to generateQuietPrompt. 
        // backends like OpenRouter/OpenAI will respect response_format in the options object.
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

export async function detectClassifier(messageText, locationKeys, historyText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, {
        key_list: locationKeys.join(', '),
        history: historyText,
        message: messageText,
    })
    const result = await dispatch(prompt, profileId, 'Classifier', { temperature: 0.1 })
    const cleaned = String(result).trim().replace(/[^a-z0-9_]/gi, '')
    if (!cleaned || cleaned.toUpperCase() === 'NULL') {
        console.debug('[Localyze:Classifier] → NULL (no match / unknown location)')
        return null
    }
    const matched = locationKeys.find(k => k === cleaned) ?? null
    console.debug(`[Localyze:Classifier] → ${matched ?? `no exact match for "${cleaned}"`}`)
    return matched
}

export async function detectDescriber(contextText, promptTemplate, profileId) {
    const prompt = interpolate(promptTemplate, { context: contextText })
    
    // Structured Outputs: Passing the schema and forcing temperature to 0.0/0.1
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