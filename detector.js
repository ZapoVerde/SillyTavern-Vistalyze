/**
 * @file data/default-user/extensions/localyze/detector.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role LLM IO
 * @description
 * Owns the three LLM detection calls in the per-turn pipeline. Takes text in,
 * returns a result. No state mutation, no UI, no side effects beyond the LLM
 * call itself. All calls use generateQuietPrompt with removeReasoning: true.
 *
 * Three calls:
 *   detectBoolean   — fast YES/NO gate: has the location changed?
 *   detectClassifier — which known key matches the current message?
 *   detectDescriber  — extract name/key/description/imagePrompt for a new location
 *
 * safeParseJSON strips markdown fences before parsing and returns null on
 * failure. A null describer result is treated as Cancel by the caller.
 *
 * @api-declaration
 * detectBoolean(messageText, currentLocation) → boolean
 * detectClassifier(messageText, locationKeys) → string | null
 * detectDescriber(contextText) → object | null
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [generateQuietPrompt (fallback), ConnectionManagerRequestService (primary)]
 */
import { generateQuietPrompt } from '../../../../script.js'
import { ConnectionManagerRequestService } from '../../shared.js'

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

async function dispatch(prompt, profileId, label) {
    console.debug(`[Localyze:${label}] Prompt:\n${prompt}`)
    if (profileId) {
        try {
            const result = await ConnectionManagerRequestService.sendRequest(profileId, prompt, null)
            const text = result.content ?? result
            console.debug(`[Localyze:${label}] Response (ConnectionManager):\n${text}`)
            return text
        } catch (err) {
            console.warn(`[Localyze:${label}] ConnectionManager failed, falling back:`, err)
        }
    }
    try {
        const text = await generateQuietPrompt({ quietPrompt: prompt, removeReasoning: true })
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
    const result = await dispatch(prompt, profileId, 'Boolean')
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
    const result = await dispatch(prompt, profileId, 'Classifier')
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
    const raw = await dispatch(prompt, profileId, 'Describer')
    const parsed = safeParseJSON(String(raw))
    if (parsed === null) {
        console.warn('[Localyze:Describer] JSON parse failed. Raw output was:\n', raw)
    } else {
        console.debug('[Localyze:Describer] →', parsed)
    }
    return parsed
}
