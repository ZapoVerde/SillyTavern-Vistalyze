# Localyze — CC Implementation Brief

## Overview

A SillyTavern extension that detects location changes in roleplay chat, maintains a
per-chat location library embedded in the chat DNA chain, generates background images
via Pollinations, and manages the ST background display. Follows CNZ architectural
patterns throughout.

The extension folder on disk is `localyze/`. It is served by ST at:
`/scripts/extensions/third-party/localyze/`

---

## File Structure

```
localyze/
  manifest.json
  index.js              — entry point, event binding, pipeline orchestration
  state.js              — in-memory runtime state
  session.js            — sessionId init and chat_metadata read/write
  detector.js           — LLM calls: boolean, classifier, describer + safeParseJSON
  reconstruction.js     — forward pass over chat log, derives all runtime state
  library.js            — location_def read/write into message.extra
  imageCache.js         — /api/backgrounds/all fetch, Pollinations fetch, save to disk
  background.js         — ST background set/clear via chat_metadata lock (Option A)
  orphanDetector.js     — fast diff against knownSessions, drives audit badge
  ui/
    toolbar.js          — manual override button + audit badge injection
    pickerModal.js      — location picker (manual override + fallback)
    addModal.js         — new location review/approve flow
    orphanModal.js      — orphan file review and delete UI
  style.css             — fade transition styles for #bg1
```

---

## manifest.json

```json
{
    "display_name": "Localyze",
    "loading_order": 10,
    "requires": [],
    "optional": [],
    "js": "index.js",
    "css": "style.css",
    "author": "ZapoVerde",
    "version": "1.0.0",
    "homePage": "",
    "auto_update": false
}
```

---

## Import Paths

Extensions are served at `/scripts/extensions/third-party/localyze/`. All imports
resolve relative to the browser URL, not the filesystem path.

### From root-level files (index.js, state.js, detector.js, etc.)

```js
import { ... } from '../../../../script.js';           // /script.js
import { ... } from '../../../extensions.js';          // /scripts/extensions.js
import { ... } from '../../../backgrounds.js';         // /scripts/backgrounds.js
```

### From ui/ files (ui/toolbar.js, ui/pickerModal.js, etc.)

```js
import { ... } from '../../../../../script.js';        // /script.js
import { ... } from '../../../../extensions.js';       // /scripts/extensions.js
import { ... } from '../../../../backgrounds.js';      // /scripts/backgrounds.js
import { ... } from '../state.js';                     // sibling at root level
```

Rule: one extra `../` per directory level below the extension root.

---

## Data Structures

### `chat_metadata.localyze`

```js
{
  sessionId: "a3f9c821"   // short UUID, generated once per chat, never regenerated
}
```

Written once on first load of a chat with no existing sessionId. Never written again.
Persisted via `saveMetadataDebounced()`.

---

### `message.extra.localyze` — two record types

**location_def** — written when a location is approved

```js
{
  type: "location_def",
  key: "tavern_prancing_pony",
  name: "The Prancing Pony",
  description: "A dimly lit medieval tavern, low beams, firelight, crowded tables",
  imagePrompt: "dimly lit medieval tavern interior, low wooden beams, firelight, fantasy art, landscape",
  sessionId: "a3f9c821"
}
```

Edits re-emit a new `location_def` with the same key. Last write wins during
reconstruction.

**scene** — written on every confirmed scene transition

```js
{
  type: "scene",
  location: "tavern_prancing_pony",   // key, or null if declined
  image: "localyze_a3f9c821_tavern_prancing_pony.png",  // filename applied, or null
  bg_declined: false
}
```

Written immediately on transition confirmation. `image` field starts as `null` when
generation is pending and is patched in when generation completes (two-write pattern).

---

### Filename convention

```
localyze_{{sessionId}}_{{key}}.png
```

Example: `localyze_a3f9c821_tavern_prancing_pony.png`

The `localyze_` prefix namespaces generated files from user backgrounds. The
`sessionId` segment ties the file to a specific chat for orphan detection.

---

### Runtime state (`state.js`)

```js
{
  currentLocation: "tavern_prancing_pony",  // or null
  currentImage: "localyze_a3f9c821_tavern_prancing_pony.png",  // or null
  sessionId: "a3f9c821",
  locations: {},        // key → location_def, rebuilt on every load
  fileIndex: new Set()  // known-present filenames, rebuilt on every load
}
```

In-memory only. Fully rebuilt from chat log and filesystem on every `CHAT_CHANGED`.
`state.js` is the only module permitted to mutate these values.

---

## Boot Sequence

Runs on extension load and on every `CHAT_CHANGED`. Owned by `index.js` which calls
`session.js`, `reconstruction.js`, `imageCache.js`, `background.js`, and
`orphanDetector.js` in sequence.

```
1. Session init (session.js)
     read chat_metadata.localyze?.sessionId
     if missing:
       generate short UUID → chat_metadata.localyze = { sessionId }
       saveMetadataDebounced()
     state.sessionId = sessionId
     push sessionId into extension_settings.localyze.knownSessions (Set → Array)
     saveSettingsDebounced()

2. Reconstruction (reconstruction.js)
     Pure function. Takes context.chat array, returns derived state. No IO.

     forward pass over context.chat:
       message.extra?.localyze?.type === "location_def"
         → locations[record.key] = record        // last write wins
       message.extra?.localyze?.type === "scene"
         → transitions.push(record)

     return {
       locations,
       currentLocation: transitions.at(-1)?.location ?? null,
       currentImage:    transitions.at(-1)?.image ?? null,
     }

     → assign to state.locations, state.currentLocation, state.currentImage

3. File reconciliation (imageCache.js)
     Single fetch — no per-file HEAD requests:

     POST /api/backgrounds/all → { images: string[] }

     state.fileIndex = new Set(
       images.filter(f => f.startsWith(`localyze_${state.sessionId}_`))
     )

     Build regeneration queue (deduplicated):
       // path A — known locations with no file
       for (const key of Object.keys(state.locations)):
         filename = `localyze_${state.sessionId}_${key}.png`
         if (!state.fileIndex.has(filename)) queue.push(key)

       // path B — scene records with null image (interrupted generation)
       for (const t of transitions):
         if (t.location && !t.image && !queue.includes(t.location))
           queue.push(t.location)

     Fire all queued keys as silent background generation (non-blocking).
     On each completion: state.fileIndex.add(filename)
                         background.set() if it matches currentImage

     Pass full `images` array to orphanDetector (already have it, no extra IO).

4. Restore background
     if state.currentImage && state.fileIndex.has(state.currentImage):
       background.set(state.currentImage)
     else:
       background.clear()

5. Fast orphan diff (orphanDetector.js) — instant, no IO
     localyzeFiles = images.filter(f => f.startsWith('localyze_'))
     knownSessions = new Set(extension_settings.localyze.knownSessions ?? [])

     suspects = localyzeFiles.filter(f => {
       const sessionId = f.split('_')[1]   // localyze_{{sessionId}}_{{key}}.png
       return !knownSessions.has(sessionId)
     })

     if suspects.length > 0:
       show badge on audit button in toolbar
       cache suspects in extension_settings.localyze.auditCache.suspects
```

---

## Per-Turn Pipeline

Triggered by `MESSAGE_RECEIVED`. Handler receives `(messageId, type)`.
`const message = context.chat[messageId]` to access the message object.

```
AI message received (messageId)
  │
  ├─ Step 1: Boolean (detector.js)
  │    if state.currentLocation is null → skip to Step 2
  │
  │    generateQuietPrompt({
  │      quietPrompt: `Current location: ${state.currentLocation}.
  │                   Has the location changed in this message? YES or NO only.
  │                   Message: ${message.mes}`,
  │      removeReasoning: true
  │    })
  │
  │    NO  → exit, write nothing
  │    YES → Step 2
  │
  ├─ Step 2: Classifier (detector.js)
  │    const keyList = Object.keys(state.locations).join(', ')
  │
  │    generateQuietPrompt({
  │      quietPrompt: `Which of these location keys does this message take place in?
  │                   Reply with the exact key or NULL if none match.
  │                   Keys: ${keyList}
  │                   Message: ${message.mes}`,
  │      removeReasoning: true
  │    })
  │
  │    known key → Step 3a
  │    NULL      → Step 3b
  │
  ├─ Step 3a: Known location
  │    const filename = `localyze_${state.sessionId}_${key}.png`
  │
  │    if state.fileIndex.has(filename):
  │      background.set(filename)
  │      writeSceneRecord(messageId, { location: key, image: filename, bg_declined: false })
  │      updateState(key, filename)
  │
  │    else:
  │      background.clear()                          // fade to neutral immediately
  │      writeSceneRecord(messageId, { location: key, image: null, bg_declined: false })
  │      updateState(key, null)
  │
  │      imageCache.generate(key, imagePrompt, sessionId)  // fire and forget
  │        → on complete:
  │            state.fileIndex.add(filename)
  │            patchSceneImage(messageId, filename)    // patch image: null → filename
  │            background.set(filename)               // fade in
  │            state.currentImage = filename
  │
  └─ Step 3b: Unknown location — Describer
       const context3b = last 3 turn pairs + current message

       const raw = await generateQuietPrompt({
         quietPrompt: `Describe the location in this scene.
                      Reply as JSON only, no markdown fences:
                      { "name": "", "key": "", "description": "", "imagePrompt": "" }
                      key must be lowercase_slug. imagePrompt must be landscape orientation.
                      Context: ${context3b}`,
         removeReasoning: true
       })

       const def = safeParseJSON(raw)    // returns null on failure

       if def is null:
         // treat as Cancel
         background.clear()
         writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
         updateState(null, null)
         return

       toastr: "New location detected. Add to library? [Yes] [No]"

       No / toastr timeout:
         background.clear()
         writeSceneRecord(messageId, { location: null, image: null, bg_declined: true })
         updateState(null, null)

       Yes:
         addModal.open(def)
           user reviews/edits: name, key, description, imagePrompt
           "Generate Preview" → Pollinations GET inline, shows result in modal (non-blocking)
           Approve:
             library.writeLocationDef(messageId, def, state.sessionId)
             state.locations[def.key] = def
             background.clear()
             writeSceneRecord(messageId, { location: def.key, image: null, bg_declined: false })
             updateState(def.key, null)
             imageCache.generate(def.key, def.imagePrompt, state.sessionId)
               → on complete: patch + set background + update state
           Cancel:
             same as No path
```

---

## Two-Write Pattern for scene records

When image generation is pending, two writes land on the same message:

**Write 1** — immediate, confirms the transition:
```js
context.chat[messageId].extra = context.chat[messageId].extra ?? {}
context.chat[messageId].extra.localyze = {
  type: 'scene',
  location: key,
  image: null,
  bg_declined: false
}
await saveChatConditional()
```

**Write 2** — on generation complete, patches the filename in:
```js
context.chat[messageId].extra.localyze.image = filename
await saveChatConditional()
```

Reconstruction always sees the record (even if generation never completes). A scene
record with `image: null` is a valid transition — file reconciliation at boot treats it
as a regeneration trigger.

---

## Background Module (`background.js`)

Implements Option A: chat_metadata lock. Does NOT use the unexported `setBackground`
function from backgrounds.js.

```js
import { chat_metadata } from '../../../../script.js'
import { saveMetadataDebounced } from '../../../extensions.js'

const BG_KEY = 'custom_background'
const MANAGED_KEY = 'localyze_managed'

export function set(filename) {
  const cssUrl = `url("backgrounds/${encodeURIComponent(filename)}")`
  chat_metadata[BG_KEY] = cssUrl
  chat_metadata[MANAGED_KEY] = true
  $('#bg1').addClass('localyze-fade-out')
  setTimeout(() => {
    $('#bg1').css('background-image', cssUrl)
    $('#bg1').removeClass('localyze-fade-out').addClass('localyze-fade-in')
    setTimeout(() => $('#bg1').removeClass('localyze-fade-in'), 600)
  }, 300)
  saveMetadataDebounced()
}

export function clear() {
  delete chat_metadata[BG_KEY]
  delete chat_metadata[MANAGED_KEY]
  $('#bg1').addClass('localyze-fade-out')
  setTimeout(() => {
    $('#bg1').css('background-image', '')
    $('#bg1').removeClass('localyze-fade-out')
  }, 300)
  saveMetadataDebounced()
}

export function isManagedByLocalyze() {
  return !!chat_metadata[MANAGED_KEY]
}
```

Guard: before any `set()` call check `isManagedByLocalyze()` OR that no manual lock
exists. If the user has set a manual background lock (no `MANAGED_KEY`), do not
overwrite it.

---

## Fade Styles (`style.css`)

Localyze owns its own fade transition. No ST built-in mechanism exists.

```css
#bg1 {
  transition: opacity 0.3s ease;
}

#bg1.localyze-fade-out {
  opacity: 0;
}

#bg1.localyze-fade-in {
  opacity: 1;
}
```

---

## Image Pipeline (`imageCache.js`)

Pollinations API is a GET request. Response is raw image binary.

```js
import { getRequestHeaders } from '../../../../script.js'

function buildPollinationsUrl(imagePrompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1920&height=1080&model=flux&nologo=true`
}

export async function generate(key, imagePrompt, sessionId) {
  const filename = `localyze_${sessionId}_${key}.png`
  const url = buildPollinationsUrl(imagePrompt)

  const blob = await fetch(url).then(r => r.blob())      // GET

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
```

`generate()` is always called fire-and-forget from `index.js`. Errors are caught at
the call site and logged; they do not throw to the user.

---

## LLM Calls (`detector.js`)

All three calls use `generateQuietPrompt` with options object form. `removeReasoning`
is `true` on all calls.

```js
import { generateQuietPrompt } from '../../../../script.js'

// safeParseJSON — strips markdown fences, returns null on failure
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
```

Describer returns `null` on parse failure. `index.js` treats a `null` describer result
as Cancel: no modal opens, no transition is written.

| Call | `quietPrompt` content | Returns |
|---|---|---|
| Boolean | Latest AI message + currentLocation | `"YES"` or `"NO"` |
| Classifier | Latest AI message + key list | exact key string or `"NULL"` |
| Describer | Last 3 turn pairs + current message | parsed object or `null` |

No separate model config in v1. Uses whatever API the chat has configured.

---

## Orphan Detection (`orphanDetector.js`)

Two-tier system:

**Fast diff** — runs automatically at every boot, zero extra IO (uses `images` array
already fetched in step 3 of boot sequence):

```js
export function fastDiff(images, knownSessions) {
  return images
    .filter(f => f.startsWith('localyze_'))
    .filter(f => {
      const parts = f.split('_')   // ['localyze', sessionId, ...key..., '.png']
      const sessionId = parts[1]
      return !knownSessions.has(sessionId)
    })
}
```

Results cached in `extension_settings.localyze.auditCache = { suspects: [] }`.
Badge shown on toolbar audit button if `suspects.length > 0`.

**Full audit** — manual trigger only. User clicks audit button:
- Iterates `characters[]` (exported from `script.js`)
- For each character: `POST /api/characters/chats` → chat file list
- For each chat: `POST /api/chats/get` → reads `chat_metadata.localyze.sessionId`
- Builds full `knownSessions` set
- Diffs against all `localyze_*` files
- Writes result to `auditCache`, opens `orphanModal`

A file is only flagged if its sessionId is absent from every known chat. Conservative
by design — never auto-deletes.

### Orphan Modal
- List of suspect files: filename, inferred key, size
- Checkbox select all / individual
- Delete Selected → `POST /api/backgrounds/delete` for each
- Clears badge and auditCache on completion

---

## Manual Override

Toolbar button → `pickerModal.open()`

Picker shows searchable dropdown of all keys in `state.locations`. On select:
- Runs the same Step 3a logic as the per-turn pipeline (known location flow)
- Writes scene record to `context.chat[context.chat.length - 1]` (last message)
- Updates state

---

## Session Recovery

Recovery IS the boot sequence. There is no separate recovery path. On every
`CHAT_CHANGED`, reconstruction rebuilds everything from the DNA chain. Runtime state
is always a pure derivative of the chat log plus the filesystem.

---

## Event Bindings (`index.js`)

```js
eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived)
eventSource.on(event_types.CHAT_CHANGED, handleChatChanged)
```

`handleMessageReceived(messageId, type)` — runs detection pipeline on `context.chat[messageId]`
`handleChatChanged()` — runs full boot sequence

---

## Extension Settings Structure

```js
extension_settings.localyze = {
  knownSessions: [],          // string[], ever-growing registry of sessionIds seen
  auditCache: {
    suspects: [],             // filenames flagged by last fast diff
    lastAudit: null,          // ISO timestamp of last full audit
    orphans: []               // filenames confirmed orphaned by last full audit
  }
}
```

Initialised with defaults if missing on load.

---

## Write Rules

| Record | Written to | Trigger | Persist via |
|---|---|---|---|
| `sessionId` | `chat_metadata.localyze` | First load of chat | `saveMetadataDebounced()` |
| `knownSessions` | `extension_settings.localyze` | Every session init | `saveSettingsDebounced()` |
| `location_def` | `message.extra.localyze` | Location approved | `saveChatConditional()` |
| `scene` (write 1) | `message.extra.localyze` | Transition confirmed | `saveChatConditional()` |
| `scene` (write 2) | `message.extra.localyze` | Generation complete | `saveChatConditional()` |
| Background image | `public/backgrounds/` | Generation complete | `/api/backgrounds/upload` |
| Background lock | `chat_metadata.custom_background` | `background.set()` | `saveMetadataDebounced()` |
| `auditCache` | `extension_settings.localyze` | Fast diff or full audit | `saveSettingsDebounced()` |

---

## Purity Rules

| Module | Class | Rule |
|---|---|---|
| `detector.js` | IO | LLM calls + safeParseJSON only. Takes text in, returns result. No state mutation, no UI. |
| `reconstruction.js` | Pure | Takes chat array, returns derived state object. No IO, no mutation, no side effects. |
| `library.js` | Stateful/IO | Writes location_def to message.extra. No LLM, no UI. |
| `imageCache.js` | IO | Fetch + file write only. No state mutation, no UI. |
| `background.js` | IO | chat_metadata lock wrapper only. No state mutation beyond chat_metadata. |
| `session.js` | Stateful/IO | sessionId read/write against chat_metadata and extension_settings only. |
| `orphanDetector.js` | IO | Filesystem reads + fast diff. Returns suspect list. No UI. |
| `state.js` | Stateful | Only module permitted to mutate runtime state. |
| UI modules | Stateful/IO | Modal lifecycle and user input only. |
| `index.js` | Orchestrator | Calls modules in sequence. Owns branching logic. Writes message.extra. |

---

## Self-Healing Properties

| Failure | Recovery |
|---|---|
| Lost scene transition message | `transitions[]` is shorter. `currentLocation` may be stale until next scene change, which self-corrects. |
| Lost location_def message | Location vanishes from library. Re-detected as unknown on next mention. Describer fires, user re-approves, def re-enters chain. |
| Image file deleted from disk | File reconciliation at next boot catches it. `imagePrompt` still in `location_def`. Silent regeneration queued. |
| Generation interrupted (image: null) | Scene record with `image: null` is a valid transition. File reconciliation treats it as a regeneration trigger. |
| Fork mid-session | Each branch carries only defs and transitions up to fork point. New locations in a branch stay in that branch. |
| Orphaned image file | Fast diff flags it at next boot. Badge shown. User reviews and deletes manually. Never auto-deleted. |

---

## Out of Scope for v1

- Variants (time of day, weather) — schema slot reserved in scene record, not implemented
- Cross-chat library export/import
- Per-character or global location libraries
- Dedicated model selection for detector calls
- Tombstone / deletion of location_def entries from the chain
