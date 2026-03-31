/**
 * @file imageCache.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @architectural-role Image IO
 * @description
 * Owns all image-related IO. Refactored to use the profile-aware getSettings() 
 * accessor for prompts, models, and dev mode flags.
 * 
 * Updates:
 * - Migrated from direct extension_settings access to getSettings().
 * - Standardized usage of profile-level configuration.
 *
 * @api-declaration
 * fetchPreviewBlob(prompt) → Promise<string> (Object URL)
 * fetchFileIndex(sessionId) → Promise<{fileIndex, allImages}>
 * generate(key, locationDef, sessionId) → Promise<string> (filename)
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [findSecret, fetch(/api/backgrounds/all), fetch(/api/backgrounds/upload)]
 */

import { getRequestHeaders } from '../../../../script.js'
import { findSecret } from '../../../secrets.js'
import { getSettings } from './settings/data.js'
import {
    POLLINATIONS_BASE_URL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
} from './defaults.js'

/** Standard SillyTavern secret key name for Pollinations */
const SECRET_KEY_NAME = 'api_key_pollinations'

function interpolateImagePrompt(template, locationDef) {
    return template
        .replace(/\{\{image_prompt\}\}/g, locationDef.imagePrompt ?? '')
        .replace(/\{\{name\}\}/g,         locationDef.name        ?? '')
        .replace(/\{\{description\}\}/g,  locationDef.description ?? '')
}

function buildPollinationsUrl(finalPrompt, overrides = {}) {
    const s = getSettings()
    const devMode = s.devMode ?? false
    const params = new URLSearchParams({
        width:  overrides.width  ?? (devMode ? String(DEV_IMAGE_WIDTH)  : '1920'),
        height: overrides.height ?? (devMode ? String(DEV_IMAGE_HEIGHT) : '1080'),
        model:  s.imageModel ?? DEFAULT_IMAGE_MODEL,
        nologo: 'true',
    })
    return `${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(finalPrompt)}?${params.toString()}`
}

/**
 * Retrieves the API key using the standard ST findSecret function.
 */
async function getAuthHeaders() {
    const userKey = await findSecret(SECRET_KEY_NAME)
    
    if (!userKey) {
        throw new Error(
            'Pollinations API key not found or blocked.\n\n' +
            '1. Ensure the key is set in ST API settings (Pollinations).\n' +
            '2. In SillyTavern/config.yaml, set "allowKeysExposure: true" then restart the server.'
        )
    }
    
    return {
        'Authorization': `Bearer ${userKey}`,
    }
}

async function validateImageResponse(response) {
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Pollinations API Error (${response.status}): ${text}`)
    }
    const contentType = response.headers.get('Content-Type')
    if (!contentType || !contentType.startsWith('image/')) {
        const text = await response.text()
        throw new Error(`Expected image, but received ${contentType}: ${text}`)
    }
}

export async function fetchPreviewBlob(prompt) {
    const url = buildPollinationsUrl(prompt, { width: '320', height: '180' })
    const headers = await getAuthHeaders()
    
    const res = await fetch(url, { headers })
    await validateImageResponse(res)
    
    return URL.createObjectURL(await res.blob())
}

export async function fetchFileIndex(sessionId) {
    const res = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    })
    const data = await res.json()
    const images = data.images ?? []
    const fileIndex = new Set(images.filter(f => f.startsWith(`localyze_${sessionId}_`)))
    return { fileIndex, allImages: images }
}

export async function generate(key, locationDef, sessionId) {
    const filename = `localyze_${sessionId}_${key}.png`
    const template = getSettings().imagePromptTemplate ?? DEFAULT_IMAGE_PROMPT_TEMPLATE
    const finalPrompt = interpolateImagePrompt(template, locationDef)
    
    const url = buildPollinationsUrl(finalPrompt)
    const headers = await getAuthHeaders()
    
    const imgRes = await fetch(url, { headers })
    await validateImageResponse(imgRes)
    
    const blob = await imgRes.blob()
    const file = new File([blob], filename, { type: 'image/png' })

    const formData = new FormData()
    formData.append('avatar', file)

    const res = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    })

    if (!res.ok) throw new Error(`Background upload failed: ${res.status} ${res.statusText}`)

    return filename
}