/**
 * @file data/default-user/extensions/localyze/imageCache.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
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
 * Pollinations API is a plain GET request returning raw image binary.
 * Filename convention: localyze_{{sessionId}}_{{key}}.png
 *
 * @api-declaration
 * fetchFileIndex(sessionId) → Promise<{ fileIndex: Set, allImages: string[] }>
 * generate(key, imagePrompt, sessionId) → Promise<filename: string>
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
    POLLINATIONS_APP_KEY,
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

async function buildPollinationsRequest(finalPrompt) {
    const s = extension_settings.localyze ?? {}
    const devMode = s.devMode ?? false

    const userKey = await findSecret(POLLINATIONS_USER_SECRET_KEY).catch(() => null)
    if (!userKey) {
        throw new Error('No Pollinations account connected. Use the Connect Account button in Localyze settings.')
    }

    const params = new URLSearchParams({
        width:  devMode ? String(DEV_IMAGE_WIDTH)  : '1920',
        height: devMode ? String(DEV_IMAGE_HEIGHT) : '1080',
        model:  s.imageModel ?? DEFAULT_IMAGE_MODEL,
        key:    POLLINATIONS_APP_KEY,
    })
    return {
        url: `https://gen.pollinations.ai/image/${encodeURIComponent(finalPrompt)}?${params.toString()}`,
        headers: { 'Authorization': `Bearer ${userKey}` },
    }
}

export async function checkPollinationsBalance() {
    const userKey = await findSecret(POLLINATIONS_USER_SECRET_KEY).catch(() => null)
    if (!userKey) return { connected: false }
    const res = await fetch('https://gen.pollinations.ai/account/balance', {
        headers: { 'Authorization': `Bearer ${userKey}` },
    })
    if (!res.ok) throw new Error(`Balance check failed: ${res.status}`)
    const data = await res.json()
    return { connected: true, balance: data.balance }
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
    const { url, headers } = await buildPollinationsRequest(finalPrompt)
    console.debug(`[Localyze:Image] GET ${url}`, headers['Authorization'] ? '(authenticated)' : '(app key only)')

    const blob = await fetch(url, { headers }).then(r => r.blob())

    const formData = new FormData()
    formData.append('avatar', blob, filename)

    const res = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        body: formData,
    })

    if (!res.ok) throw new Error(`Background upload failed: ${res.status}`)

    return filename
}
