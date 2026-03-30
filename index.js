/**
 * @file data/default-user/extensions/localyze/index.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.0.19
 * @architectural-role Feature Entry Point / Orchestrator
 * @description
 * Localyze extension entry point. Owns the boot sequence, the per-turn
 * detection pipeline, and branching logic.
 *
 * Version 1.0.18 Updates:
 * - Added UI error notifications to image generation catch blocks to 
 *   bubble up authentication/validation failures from imageCache.js.
 *
 * @api-declaration
 * Entry points (event-bound):
 *   handleMessageReceived(messageId)
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
            .then(filename => {
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

async function handleMessageReceived(messageId) {
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
        await writeSceneRecord(messageId, { location: key, image: filename, bg_declined: false })
        updateState(key, filename)
    } else {
        clearBg()
        await writeSceneRecord(messageId, { location: key, image: null, bg_declined: false })
        updateState(key, null)

        const capturedId = messageId
        generate(key, def, state.sessionId)
            .then(filename => {
                state.fileIndex.add(filename)
                patchSceneImage(capturedId, filename)
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
        await writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
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
        await writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    const approved = await openAddModal(def)

    if (approved === null) {
        clearBg()
        await writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
        updateState(null, null)
        return
    }

    await writeLocationDef(messageId, approved, state.sessionId)
    state.locations[approved.key] = approved
    clearBg()
    await writeSceneRecord(messageId, { location: approved.key, image: null, bg_declined: false })
    updateState(approved.key, null)

    const capturedId = messageId
    generate(approved.key, approved, state.sessionId)
        .then(filename => {
            state.fileIndex.add(filename)
            patchSceneImage(capturedId, filename)
            setBg(filename)
            state.currentImage = filename
        })
        .catch(err => {
            console.error('[Localyze] Generate failed after approve:', err)
            toastr.error(`Generation failed: ${err.message}`, 'Localyze')
        })
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

console.debug('[Localyze] module loading — injecting toolbar and settings panel')
injectToolbar()
injectSettingsPanel()
console.debug('[Localyze] binding events')
eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived)
eventSource.on(event_types.CHAT_CHANGED, handleChatChanged)
console.debug('[Localyze] firing initial boot()')
boot().catch(err => console.error('[Localyze] Initial boot error:', err))