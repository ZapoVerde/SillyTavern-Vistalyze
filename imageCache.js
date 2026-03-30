/**
 * @file data/default-user/extensions/localyze/imageCache.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.1.0
 * @architectural-role Image IO
 * @description
 * Owns all image-related IO. 
 * 
 * Version 1.1.0 Updates:
 * - Uses SillyTavern SecretService for secure key retrieval.
 * - Implements strict Response validation (checks ok status and Content-Type).
 * - Switches to Authorization: Bearer headers for the gen.pollinations.ai gateway.
 * - Wraps blobs in File objects with explicit MIME types for ST server compatibility.
 *
 * @api-declaration
 * fetchFileIndex(sessionId) → Promise<{ fileIndex: Set, allImages: string[] }>
 * generate(key, locationDef, sessionId) → Promise<filename: string>
 * fetchPreviewBlob(prompt) → Promise<string> (Object URL)
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [POST /api/backgrounds/all, GET gen.pollinations.ai,
 *       POST /api/backgrounds/upload, getSecret()]
 */
import { getRequestHeaders } from '../../../../script.js'
import { extension_settings, getSecret } from '../../../extensions.js'
import {
    POLLINATIONS_BASE_URL,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
} from './defaults.js'

const SECRET_KEY_NAME = 'localyze_pollinations_key'

function interpolateImagePrompt(template, locationDef) {
    return template
        .replace(/\{\{image_prompt\}\}/g, locationDef.imagePrompt ?? '')
        .replace(/\{\{name\}\}/g,         locationDef.name        ?? '')
        .replace(/\{\{description\}\}/g,  locationDef.description ?? '')
}

/**
 * Builds the URL for the gen.pollinations.ai gateway.
 * No keys are passed in the URL to prevent leakage and comply with gateway rules.
 */
function buildPollinationsUrl(finalPrompt, overrides = {}) {
    const s = extension_settings.localyze ?? {}
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
 * Fetches the user's API key from the SillyTavern Secret Service.
 * Throws if the key is missing to prevent keyless requests that will be rejected.
 */
async function getAuthHeaders() {
    const userKey = await getSecret(SECRET_KEY_NAME)
    if (!userKey) {
        throw new Error('Pollinations API key not found. Please set it in the Localyze settings.')
    }
    return {
        'Authorization': `Bearer ${userKey}`,
    }
}

/**
 * Validates that the response from Pollinations is actually an image.
 * Prevents saving error text strings as broken .png files.
 */
async function validateImageResponse(response, url) {
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
    
    console.debug('[Localyze:Preview] GET', url)
    const res = await fetch(url, { headers })
    await validateImageResponse(res, url)
    
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
    const template = extension_settings.localyze?.imagePromptTemplate ?? DEFAULT_IMAGE_PROMPT_TEMPLATE
    const finalPrompt = interpolateImagePrompt(template, locationDef)
    
    const url = buildPollinationsUrl(finalPrompt)
    const headers = await getAuthHeaders()
    
    console.debug(`[Localyze:Image] GET ${url}`)
    const imgRes = await fetch(url, { headers })
    await validateImageResponse(imgRes, url)
    
    const blob = await imgRes.blob()

    // Wrap blob in a File object with explicit image MIME type.
    // This ensures SillyTavern's multer middleware accepts and writes the file correctly.
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