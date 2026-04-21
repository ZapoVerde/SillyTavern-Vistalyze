/**
 * @file data/default-user/extensions/vistalyze/orphanDetector.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @architectural-role Orphan File Detection
 * @description
 * Detects background image files in public/backgrounds/ that are no longer
 * associated with any known chat session. Two-tier system:
 *
 *   fastDiff    — pure function, runs at every boot with zero extra IO.
 *                 Diffs vistalyze_* files against the knownSessions registry
 *                 already held in extension_settings. Instant. May produce
 *                 false positives if knownSessions is incomplete (e.g. chat
 *                 opened on a different device).
 *
 *   runFullAudit — manual trigger only. Iterates all characters and their
 *                  chat files to build a complete knownSessions set, then
 *                  runs fastDiff against it. Expensive (N requests), never
 *                  runs automatically. Result is cached in auditCache.
 *
 * Neither function auto-deletes anything. The orphanModal owns deletion.
 *
 * @api-declaration
 * fastDiff(allImages, knownSessions) → string[]   (suspect filenames)
 * runFullAudit(allImages) → Promise<string[]>     (confirmed orphan filenames)
 *
 * @contract
 *   assertions:
 *     purity: IO (runFullAudit) / pure (fastDiff)
 *     state_ownership: []
 *     external_io: [POST /api/characters/chats, POST /api/chats/get]
 */
import { characters, getRequestHeaders } from '../../../../script.js'

export function fastDiff(allImages, knownSessions) {
    const knownSet = new Set(knownSessions)
    return allImages
        .filter(f => f.startsWith('vistalyze_'))
        .filter(f => {
            const sessionId = f.split('_')[1]
            return !knownSet.has(sessionId)
        })
}

export async function runFullAudit(allImages) {
    const knownSessions = new Set()

    for (const character of characters) {
        if (!character.avatar) continue

        let chats = []
        try {
            const res = await fetch('/api/characters/chats', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: character.avatar }),
            })
            const data = await res.json()
            chats = Array.isArray(data) ? data : []
        } catch {
            continue
        }

        for (const chat of chats) {
            const rawName = typeof chat === 'string' ? chat : chat.file_name
            if (!rawName) continue
            const chatName = rawName.replace('.jsonl', '')
            try {
                const res = await fetch('/api/chats/get', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        ch_name: character.name,
                        file_name: chatName,
                        avatar_url: character.avatar,
                    }),
                })
                const messages = await res.json()
                if (!Array.isArray(messages)) continue
                for (const element of messages) {
                    const sessionId =
                        element?.vistalyze?.sessionId ??
                        element?.extra?.vistalyze?.sessionId ??
                        null
                    if (sessionId) knownSessions.add(sessionId)
                }
            } catch {
                continue
            }
        }
    }

    return fastDiff(allImages, [...knownSessions])
}
