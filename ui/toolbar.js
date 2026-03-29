/**
 * @file data/default-user/extensions/localyze/ui/toolbar.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Toolbar UI
 * @description
 * Injects two buttons into the ST extensions panel (#extensionsMenu):
 *
 *   Localyze button  — opens the location picker modal for manual override
 *   Audit Images btn — runs full orphan audit and opens orphanModal if needed;
 *                      carries the orphan badge (#lz-orphan-badge) which is
 *                      shown by index.js after the boot-time fast diff
 *
 * Duplicate buttons are removed before injection to survive hot reloads.
 * The orphan badge is driven externally by showOrphanBadge() and
 * clearOrphanBadge(), which are called by index.js and orphanModal.js.
 *
 * @api-declaration
 * injectToolbar()        — idempotent; injects both buttons
 * showOrphanBadge(count) — shows red count badge on audit button
 * clearOrphanBadge()     — hides badge
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [extension_settings.localyze.auditCache (write)]
 *     external_io: [#extensionsMenu DOM (write), POST /api/backgrounds/all,
 *       runFullAudit(), openPickerModal(), openOrphanModal()]
 */
import { extension_settings, saveSettingsDebounced } from '../../../../extensions.js'
import { getRequestHeaders } from '../../../../../script.js'
import { openPickerModal } from './pickerModal.js'
import { openOrphanModal } from './orphanModal.js'
import { runFullAudit } from '../orphanDetector.js'
import { state } from '../state.js'

export function injectToolbar() {
    // Remove any existing buttons to avoid duplicates on hot reload
    $('#lz-toolbar-btn').remove()
    $('#lz-audit-btn').remove()

    // Main picker button
    const pickerBtn = $(`
        <div id="lz-toolbar-btn" class="list-group-item flex-container flexGap5" title="Localyze">
            <i class="fa-solid fa-location-dot"></i>
            <span>Localyze</span>
        </div>
    `)
    pickerBtn.on('click', () => {
        openPickerModal()
    })

    // Audit button
    const auditBtn = $(`
        <div id="lz-audit-btn" class="list-group-item flex-container flexGap5" title="Localyze: Audit Images">
            <i class="fa-solid fa-trash-can"></i>
            <span>Audit Images</span>
            <span id="lz-orphan-badge" style="display:none;"></span>
        </div>
    `)
    auditBtn.on('click', async () => {
        try {
            const images = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            }).then(r => r.json()).then(d => d.images ?? [])

            const orphans = await runFullAudit(images)

            if (!extension_settings.localyze) {
                extension_settings.localyze = { knownSessions: [], auditCache: { suspects: [], lastAudit: null, orphans: [] } }
            }
            extension_settings.localyze.auditCache = extension_settings.localyze.auditCache ?? {}
            extension_settings.localyze.auditCache.lastAudit = new Date().toISOString()
            extension_settings.localyze.auditCache.orphans = orphans
            extension_settings.localyze.auditCache.suspects = orphans
            saveSettingsDebounced()

            if (orphans.length > 0) {
                openOrphanModal(orphans)
            } else {
                toastr.success('No orphaned images found.', 'Localyze')
            }
        } catch (err) {
            console.error('[Localyze] Audit failed:', err)
            toastr.error('Audit failed. See console for details.', 'Localyze')
        }
    })

    $('#extensionsMenu').append(pickerBtn)
    $('#extensionsMenu').append(auditBtn)
}

export function showOrphanBadge(count) {
    $('#lz-orphan-badge').text(count).show()
}

export function clearOrphanBadge() {
    $('#lz-orphan-badge').hide().text('')
}
