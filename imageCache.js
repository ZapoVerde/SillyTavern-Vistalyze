/**
 * @file data/default-user/extensions/localyze/imageCache.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.1
 * @architectural-role Image IO
 * @description
 * Owns all image-related IO: building the file index from the backgrounds
 * endpoint, fetching images from Pollinations, and uploading them to ST's
 * backgrounds folder. No state mutation, no UI, no LLM calls.
 *
 * fetchFileIndex is called once per boot to build state.fileIndex in a single
 * POST /api/backgrounds/all request (no per-file HEAD requests).
 *
 * generate() is always called fire-and-forget from index.js. Errors are
 * caught at the call site and logged; they do not surface to the user.
 *
 * Pollinations auth: sk_ user key is passed as ?key= query param (CORS-safe
 * GET, no Authorization header). Endpoint: image.pollinations.ai/prompt/{prompt}
 * Filename convention: localyze_{{sessionId}}_{{key}}.png
 *
 * @api-declaration
 * fetchFileIndex(sessionId) → Promise<{ fileIndex: Set, allImages: string[] }>
 * generate(key, locationDef, sessionId) → Promise<filename: string>
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: []
 *     external_io: [POST /api/backgrounds/all, GET image.pollinations.ai,
 *       POST /api/backgrounds/upload, findSecret (ST secrets)]
 */
import { getRequestHeaders } from '../../../../script.js'
import { extension_settings } from '../../../extensions.js'
import { findSecret } from '../../../secrets.js'
import {
    POLLINATIONS_USER_SECRET_KEY,
    DEFAULT_IMAGE_MODEL,
    DEFAULT_IMAGE_PROMPT_TEMPLATE,
    DEV_IMAGE_WIDTH,
    DEV_IMAGE_HEIGHT,
} from './defaults.js'

function interpolateImagePrompt(template, locationDef) {
    return template
        .replace(/\{\{image_prompt\}\}/g, locationDef.imagePrompt ?? '')
        .replace(/\{\{name\}\}/g,         locationDef.name        ?? '')
        .replace(/\{\{description\}\}/g,  locationDef.description ?? '')
}

function buildPollinationsUrl(finalPrompt, userKey, overrides = {}) {
    const s = extension_settings.localyze ?? {}
    const devMode = s.devMode ?? false
    const params = new URLSearchParams({
        width:  overrides.width  ?? (devMode ? String(DEV_IMAGE_WIDTH)  : '1920'),
        height: overrides.height ?? (devMode ? String(DEV_IMAGE_HEIGHT) : '1080'),
        model:  s.imageModel ?? DEFAULT_IMAGE_MODEL,
        key:    userKey,
        nologo: 'true',
    })
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?${params.toString()}`
}

async function getUserKey() {
    const userKey = await findSecret(POLLINATIONS_USER_SECRET_KEY).catch(() => null)
    if (!userKey) throw new Error('No Pollinations key saved. Paste your sk_ key in Localyze settings.')
    return userKey
}

/**
 * Fetches a 320×180 test image and returns an object URL for preview.
 * Used by the settings test button and addModal preview.
 */
export async function fetchPreviewBlob(prompt) {
    const userKey = await getUserKey()
    const url = buildPollinationsUrl(prompt, userKey, { width: '320', height: '180' })
    console.debug('[Localyze:Preview] GET', url)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Preview fetch failed: ${res.status} ${res.statusText} — ${url}`)
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
    const userKey = await getUserKey()
    const url = buildPollinationsUrl(finalPrompt, userKey)
    console.debug(`[Localyze:Image] GET ${url}`)

    const imgRes = await fetch(url)
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status} ${imgRes.statusText} — ${url}`)
    const blob = await imgRes.blob()

    const formData = new FormData()
    formData.append('avatar', blob, filename)

    const res = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    })

    if (!res.ok) throw new Error(`Background upload failed: ${res.status} ${res.statusText}`)

    return filename
}
