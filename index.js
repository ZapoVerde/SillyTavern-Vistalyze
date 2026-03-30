/**
 * @file index.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.0.21
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * Localyze extension entry point. Owns the boot sequence, the per-turn
 * detection pipeline, and branching logic.
 *
 * Version 1.1.3 Updates:
 * - Decoupled MESSAGE_RECEIVED from ST's event emitter to fix Save Timeouts.
 * - Added AsyncLock to safely queue concurrent writes (Two-Write Pattern).
 * - Fixed location_def vs scene overwrite collision on the same message.
 *
 * @api-declaration
 * Entry points (event-bound):
 *   handleMessageReceived(messageId) -> Fire and forget pipeline
 *   handleChatChanged()
 */
import { eventSource, event_types, saveChatConditional, saveSettingsDebounced, callPopup } from '../../../../script.js'
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

// ─── AsyncLock (Mutex) for safe concurrent chat writes ───────────────

class AsyncLock {
    constructor() {
        this.locked = false;
        this.queue =[];
    }
    async acquire() {
        if (!this.locked) {
            this.locked = true;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }
    release() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }
}
const writeLock = new AsyncLock();

// ─── Locked Write Wrappers ───────────────────────────────────────────

async function lockedWriteSceneRecord(messageId, record) {
    await writeLock.acquire()
    try {
        const context = getContext()
        const message = context.chat[messageId]
        if (message) {
            message.extra = message.extra ?? {}
            message.extra.localyze = { type: 'scene', ...record }
            await saveChatConditional()
        }
    } finally {
        writeLock.release()
    }
}

async function lockedPatchSceneImage(messageId, filename) {
    await writeLock.acquire()
    try {
        const context = getContext()
        const message = context.chat[messageId]
        if (message && message.extra?.localyze) {
            message.extra.localyze.image = filename
            await saveChatConditional()
        }
    } finally {
        writeLock.release()
    }
}

async function lockedWriteLocationDef(messageId, def, sessionId) {
    await writeLock.acquire()
    try {
        await writeLocationDef(messageId, def, sessionId)
    } finally {
        writeLock.release()
    }
}

// ─── Utility ─────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHistoryText(chat, beforeIndex, numPairs) {
    if (numPairs <= 0) return ''
    const start = Math.max(0, beforeIndex - numPairs * 2)
    const slice = chat.slice(start, beforeIndex)
    if (!slice.length) return ''
    const transcript = slice.map(m => `${m.name ?? ''}: ${m.mes ?? ''}`).join('\n\n')
    return `Preceding turns:\n${transcript}\n\n`
}

// ─── Boot Sequence ───────────────────────────────────────────────────

async function boot() {
    console.debug('[Localyze] boot() start')
    const context = getContext()
    if (!context.chatId) {
        console.debug('[Localyze] boot() abort — no chatId')
        return
    }

    console.debug('[Localyze] initSession()')
    initSession()
    console.debug('[Localyze] sessionId:', state.sessionId)

    console.debug('[Localyze] reconstruct()')
    const { locations, transitions, currentLocation, currentImage } = reconstruct(context.chat)
    state.locations = locations
    state.currentLocation = currentLocation
    state.currentImage = currentImage
    console.debug(`[Localyze] reconstructed — locations: ${Object.keys(locations).length}, transitions: ${transitions.length}, currentLocation: ${currentLocation}`)

    console.debug('[Localyze] fetchFileIndex()')
    const { fileIndex, allImages } = await fetchFileIndex(state.sessionId)
    state.fileIndex = fileIndex
    console.debug(`[Localyze] fileIndex: ${fileIndex.size} localyze files, ${allImages.length} total backgrounds`)

    const queue =[]

    for (const key of Object.keys(state.locations)) {
        const filename = `localyze_${state.sessionId}_${key}.png`
        if (!state.fileIndex.has(filename)) {
            queue.push(key)
        }
    }

    for (const t of transitions) {
        if (t.location && !t.image && !queue.includes(t.location)) {
            queue.push(t.location)
        }
    }

    if (queue.length) console.debug('[Localyze] regen queue:', queue)

    // Fire queued background generation silently
    for (const key of queue) {
        const def = state.locations[key]
        if (!def) continue
        generate(key, def, state.sessionId)
            .then(async filename => {
                state.fileIndex.add(filename)
                if (filename === state.currentImage) setBg(filename)
            })
            .catch(err => console.error('[Localyze] Silent regen failed:', err))
    }

    if (state.currentImage && state.fileIndex.has(state.currentImage)) {
        console.debug('[Localyze] restoring background:', state.currentImage)
        setBg(state.currentImage)
    } else {
        console.debug('[Localyze] no background to restore — clearing')
        clearBg()
    }

    const suspects = fastDiff(allImages, extension_settings.localyze?.knownSessions ??[])
    if (suspects.length > 0) {
        if (!extension_settings.localyze) extension_settings.localyze = { knownSessions: [], auditCache: { suspects: [], lastAudit: null, orphans:[] } }
        extension_settings.localyze.auditCache = extension_settings.localyze.auditCache ?? {}
        extension_settings.localyze.auditCache.suspects = suspects
        saveSettingsDebounced()
        showOrphanBadge(suspects.length)
    }
}

// ─── Per-Turn Pipeline ───────────────────────────────────────────────

/**
 * FIRE-AND-FORGET handler to unblock ST's MESSAGE_RECEIVED event emitter.
 * Resolves instantly so ST can save the chat without timing out.
 */
function handleMessageReceived(messageId) {
    runDetectionPipeline(messageId).catch(err => {
        console.error('[Localyze] Pipeline error:', err)
    })
}

async function runDetectionPipeline(messageId) {
    const context = getContext()
    const message = context.chat[messageId]
    if (!message || message.is_user) return

    const locationKeys = Object.keys(state.locations)
    const s = extension_settings.localyze

    if (state.currentLocation !== null) {
        const historyText = buildHistoryText(context.chat, messageId, s.booleanHistory ?? 0)
        const changed = await detectBoolean(
            message.mes, state.currentLocation, historyText,
            s.booleanPrompt, s.booleanProfileId,
        )
        if (!changed) return
    }

    if (locationKeys.length > 0) {
        const historyText = buildHistoryText(context.chat, messageId, s.classifierHistory ?? 0)
        const key = await detectClassifier(
            message.mes, locationKeys, historyText,
            s.classifierPrompt, s.classifierProfileId,
        )
        if (key !== null) {
            await handleKnownLocation(messageId, key)
        } else {
            await handleUnknownLocation(messageId, context)
        }
    } else {
        await handleUnknownLocation(messageId, context)
    }
}

async function handleKnownLocation(messageId, key) {
    const filename = `localyze_${state.sessionId}_${key}.png`
    const def = state.locations[key]

    if (state.fileIndex.has(filename)) {
        setBg(filename)
        await lockedWriteSceneRecord(messageId, { location: key, image: filename, bg_declined: false })
        updateState(key, filename)
    } else {
        clearBg()
        await lockedWriteSceneRecord(messageId, { location: key, image: null, bg_declined: false })
        updateState(key, null)

        const capturedId = messageId
        generate(key, def, state.sessionId)
            .then(async filename => {
                state.fileIndex.add(filename)
                await lockedPatchSceneImage(capturedId, filename)
                setBg(filename)
                state.currentImage = filename
            })
            .catch(err => {
                console.error('[Localyze] Known location generate failed:', err)
                toastr.error(`Generation failed: ${err.message}`, 'Localyze')
            })
    }
}

async function handleUnknownLocation(messageId, context) {
    const chat = context.chat
    const start = Math.max(0, chat.length - 6)
    const contextText = chat.slice(start).map(m => `${m.name ?? ''}: ${m.mes ?? ''}`).join('\n\n')

    const s = extension_settings.localyze
    const def = await detectDescriber(contextText, s.describerPrompt, s.describerProfileId)

    if (def === null) {
        clearBg()
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    const confirmed = await callPopup(
        `<h3>New location detected: ${escapeHtml(def.name)}</h3>
        <p>${escapeHtml(def.description)}</p>`,
        'confirm',
    )

    if (!confirmed) {
        clearBg()
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    const approved = await openAddModal(def)

    if (approved === null) {
        clearBg()
        await lockedWriteSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    // Write the Definition to the previous message (user prompt) to avoid schema collision
    // with the Scene record, which must live on the current AI message.
    const defMsgId = messageId > 0 ? messageId - 1 : messageId;
    await lockedWriteLocationDef(defMsgId, approved, state.sessionId)
    
    state.locations[approved.key] = approved
    clearBg()
    
    // Write Scene to the current AI message (skip if it was message 0 to prevent overwrite)
    if (defMsgId !== messageId) {
        await lockedWriteSceneRecord(messageId, { location: approved.key, image: null, bg_declined: false })
    }
    updateState(approved.key, null)

    const capturedId = messageId
    generate(approved.key, approved, state.sessionId)
        .then(async filename => {
            state.fileIndex.add(filename)
            await lockedPatchSceneImage(capturedId, filename)
            setBg(filename)
            state.currentImage = filename
        })
        .catch(err => {
            console.error('[Localyze] Generate failed after approve:', err)
            toastr.error(`Generation failed: ${err.message}`, 'Localyze')
        })
}

function handleChatChanged() {
    resetState()
    boot().catch(err => console.error('[Localyze] Boot error:', err))
}

console.debug('[Localyze] module loading — injecting toolbar and settings panel')
injectToolbar()
injectSettingsPanel()
console.debug('[Localyze] binding events')
eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived)
eventSource.on(event_types.CHAT_CHANGED, handleChatChanged)
console.debug('[Localyze] firing initial boot()')
boot().catch(err => console.error('[Localyze] Initial boot error:', err))