/**
 * @file data/default-user/extensions/localyze/index.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.3
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * Localyze extension entry point. Owns the boot sequence, the per-turn
 * detection pipeline, all branching logic, and all writes to message.extra
 * .localyze. Calls modules in sequence; no module calls back into index.js.
 *
 * Boot sequence (runs on load and every CHAT_CHANGED):
 *   1. initSession()      — read/generate sessionId
 *   2. reconstruct()      — derive locations and transitions from chat log
 *   3. fetchFileIndex()   — single POST /api/backgrounds/all → fileIndex
 *   4. regen queue        — silent background generation for missing files
 *   5. restoreBackground  — set or clear based on currentImage + fileIndex
 *   6. fastDiff()         — orphan badge if suspect files found
 *
 * Per-turn pipeline (MESSAGE_RECEIVED):
 *   Boolean → Classifier → Known (Step 3a) | Unknown (Step 3b)
 *   Unknown: Describer → confirmation modal → addModal → writeLocationDef
 *   Two-write pattern: scene record written immediately with image:null,
 *   patched with filename when generation completes.
 *
 * @api-declaration
 * Entry points (event-bound):
 *   handleMessageReceived(messageId) — per-turn detection pipeline
 *   handleChatChanged()              — resets state, reruns boot sequence
 * Internal:
 *   boot(), handleKnownLocation(), handleUnknownLocation(),
 *   writeSceneRecord(), patchSceneImage()
 *
 * @contract
 *   assertions:
 *     purity: mutates
 *     state_ownership: [state.locations, state.currentLocation,
 *       state.currentImage, state.fileIndex, state.sessionId]
 *     external_io: [generateQuietPrompt (via detector.js),
 *       POST /api/backgrounds/all (via imageCache.js),
 *       GET image.pollinations.ai (via imageCache.js),
 *       POST /api/backgrounds/upload (via imageCache.js),
 *       message.extra.localyze (write), saveChatConditional(),
 *       chat_metadata.localyze (via session.js),
 *       extension_settings.localyze (read/write),
 *       #bg1 DOM (via background.js)]
 */
import { eventSource, event_types, saveChatConditional, saveSettingsDebounced } from '../../../../script.js'
import { extension_settings, getContext } from '../../../extensions.js'
import { state, resetState, updateState } from './state.js'
import { initSession } from './session.js'
import { reconstruct } from './reconstruction.js'
import { detectBoolean, detectClassifier, detectDescriber } from './detector.js'
import { writeLocationDef } from './library.js'
import { fetchFileIndex, generate } from './imageCache.js'
import { set as setBg, clear as clearBg } from './background.js'
import { fastDiff } from './orphanDetector.js'
import { injectToolbar, showOrphanBadge } from './ui/toolbar.js'
import { openAddModal } from './ui/addModal.js'
import { openPickerModal } from './ui/pickerModal.js'
import { injectSettingsPanel } from './settings/panel.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function boot() {
    const context = getContext()
    if (!context.chatId) return

    initSession()

    const { locations, transitions, currentLocation, currentImage } = reconstruct(context.chat)
    state.locations = locations
    state.currentLocation = currentLocation
    state.currentImage = currentImage

    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId)
    state.fileIndex = fileIndex

    // Build regeneration queue (deduplicated)
    const queue = []

    // Path A — known locations with no file
    for (const key of Object.keys(state.locations)) {
        const filename = `localyze_${state.sessionId}_${key}.png`
        if (!state.fileIndex.has(filename)) {
            queue.push(key)
        }
    }

    // Path B — scene records with null image (interrupted generation)
    for (const t of transitions) {
        if (t.location && !t.image && !queue.includes(t.location)) {
            queue.push(t.location)
        }
    }

    // Fire all queued keys as silent background generation (non-blocking)
    for (const key of queue) {
        const def = state.locations[key]
        if (!def) continue
        generate(key, def.imagePrompt, state.sessionId)
            .then(filename => {
                state.fileIndex.add(filename)
                if (filename === state.currentImage) setBg(filename)
            })
            .catch(err => console.error('[Localyze] Silent regen failed:', err))
    }

    // Restore background
    if (state.currentImage && state.fileIndex.has(state.currentImage)) {
        setBg(state.currentImage)
    } else {
        clearBg()
    }

    // Fast orphan diff
    const suspects = fastDiff(allImages, extension_settings.localyze?.knownSessions ?? [])
    if (suspects.length > 0) {
        if (!extension_settings.localyze) extension_settings.localyze = { knownSessions: [], auditCache: { suspects: [], lastAudit: null, orphans: [] } }
        extension_settings.localyze.auditCache = extension_settings.localyze.auditCache ?? {}
        extension_settings.localyze.auditCache.suspects = suspects
        saveSettingsDebounced()
        showOrphanBadge(suspects.length)
    }
}

async function handleMessageReceived(messageId) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message || message.is_user) return

    const locationKeys = Object.keys(state.locations)

    const s = extension_settings.localyze

    // Step 1: Boolean gate — only if we have a current location
    if (state.currentLocation !== null) {
        const changed = await detectBoolean(
            message.mes, state.currentLocation,
            s.booleanPrompt, s.booleanProfileId,
        )
        if (!changed) return
    }

    // Step 2: Classifier
    if (locationKeys.length > 0) {
        const key = await detectClassifier(
            message.mes, locationKeys,
            s.classifierPrompt, s.classifierProfileId,
        )
        if (key !== null) {
            await handleKnownLocation(messageId, key)
        } else {
            await handleUnknownLocation(messageId, context)
        }
    } else {
        // No locations in library yet — go straight to unknown
        await handleUnknownLocation(messageId, context)
    }
}

async function handleKnownLocation(messageId, key) {
    const filename = `localyze_${state.sessionId}_${key}.png`
    const def = state.locations[key]

    if (state.fileIndex.has(filename)) {
        setBg(filename)
        await writeSceneRecord(messageId, { location: key, image: filename, bg_declined: false })
        updateState(key, filename)
    } else {
        clearBg()
        await writeSceneRecord(messageId, { location: key, image: null, bg_declined: false })
        updateState(key, null)

        const capturedId = messageId
        generate(key, def.imagePrompt, state.sessionId)
            .then(filename => {
                state.fileIndex.add(filename)
                patchSceneImage(capturedId, filename)
                setBg(filename)
                state.currentImage = filename
            })
            .catch(console.error)
    }
}

async function handleUnknownLocation(messageId, context) {
    // Build contextText from last 6 messages (or fewer)
    const chat = context.chat
    const start = Math.max(0, chat.length - 6)
    const contextText = chat.slice(start).map(m => `${m.name ?? ''}: ${m.mes ?? ''}`).join('\n\n')

    const s = extension_settings.localyze
    const def = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId)

    if (def === null) {
        clearBg()
        await writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    // Show confirmation modal
    const confirmed = await new Promise(resolve => {
        const overlay = $(`<div class="localyze-confirm-overlay">
            <div class="localyze-modal">
                <p><strong>New location detected:</strong> ${escapeHtml(def.name)}</p>
                <p class="localyze-dim">${escapeHtml(def.description)}</p>
                <div class="localyze-modal-actions">
                    <button class="menu_button lz-confirm-no">Dismiss</button>
                    <button class="menu_button lz-confirm-yes">Add to Library</button>
                </div>
            </div>
        </div>`)
        overlay.find('.lz-confirm-yes').on('click', () => { overlay.remove(); resolve(true) })
        overlay.find('.lz-confirm-no').on('click', () => { overlay.remove(); resolve(false) })
        $('body').append(overlay)
    })

    if (!confirmed) {
        clearBg()
        await writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    // User said Yes — open addModal for review/editing
    const approved = await openAddModal(def)

    if (approved === null) {
        // Cancelled in addModal — same as No
        clearBg()
        await writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    // Approved — write location def and fire generation
    await writeLocationDef(messageId, approved, state.sessionId)
    state.locations[approved.key] = approved
    clearBg()
    await writeSceneRecord(messageId, { location: approved.key, image: null, bg_declined: false })
    updateState(approved.key, null)

    const capturedId = messageId
    generate(approved.key, approved.imagePrompt, state.sessionId)
        .then(filename => {
            state.fileIndex.add(filename)
            patchSceneImage(capturedId, filename)
            setBg(filename)
            state.currentImage = filename
        })
        .catch(err => console.error('[Localyze] Generate failed after approve:', err))
}

async function writeSceneRecord(messageId, record) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message) return
    message.extra = message.extra ?? {}
    message.extra.localyze = { type: 'scene', ...record }
    await saveChatConditional()
}

async function patchSceneImage(messageId, filename) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message) return
    if (message.extra?.localyze) {
        message.extra.localyze.image = filename
        await saveChatConditional()
    }
}

function handleChatChanged() {
    resetState()
    boot().catch(err => console.error('[Localyze] Boot error:', err))
}

// Module-level init
injectToolbar()
injectSettingsPanel()
eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived)
eventSource.on(event_types.CHAT_CHANGED, handleChatChanged)
boot().catch(err => console.error('[Localyze] Initial boot error:', err))
