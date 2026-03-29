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
import { findSecret } from '../../../secrets.js'
import { POLLINATIONS_REFERRER, POLLINATIONS_SECRET_KEY } from './defaults.js'

async function buildPollinationsUrl(imagePrompt) {
    const params = new URLSearchParams({
        width:    '1920',
        height:   '1080',
        model:    'flux',
        nologo:   'true',
        referrer: POLLINATIONS_REFERRER,
    })
    const userToken = await findSecret(POLLINATIONS_SECRET_KEY)
    if (userToken) params.set('token', userToken)
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?${params.toString()}`
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

export async function generate(key, imagePrompt, sessionId) {
    const filename = `localyze_${sessionId}_${key}.png`
    const url = await buildPollinationsUrl(imagePrompt)

    const blob = await fetch(url).then(r => r.blob())

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
