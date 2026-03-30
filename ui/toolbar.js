/**
 * @file data/default-user/extensions/localyze/ui/toolbar.js
 * @stamp {"utc":"2026-04-01T14:15:00.000Z"}
 * @version 1.3.1
 * @architectural-role Toolbar UI
 * @description
 * Injects two buttons into the ST extensions panel (#extensionsMenu).
 *
 * Version 1.3.1 Updates:
 * - Refactored injectToolbar to accept onManualDetect callback for the picker.
 *
 * @api-declaration
 * injectToolbar(onEdit, onManualDetect) — idempotent; injects both buttons.
 * showOrphanBadge(count) — shows red count badge on audit button.
 * clearOrphanBadge()     — hides badge.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [getMetaSettings().auditCache (write)]
 *     external_io: [#extensionsMenu DOM (write), POST /api/backgrounds/all,
 *       runFullAudit(), openPickerModal(), openOrphanModal()]
 */
import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js'
import { openPickerModal } from './pickerModal.js'
import { openOrphanModal } from './orphanModal.js'
import { runFullAudit } from '../orphanDetector.js'
import { getMetaSettings } from '../settings/data.js'

/**
 * Injects the Localyze buttons into the ST extension menu.
 * @param {Function} onEdit Callback passed to the picker to handle location editing.
 * @param {Function} onManualDetect Callback passed to the picker to handle manual detection.
 */
export function injectToolbar(onEdit, onManualDetect) {
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
        openPickerModal(onEdit, onManualDetect)
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

            const meta = getMetaSettings()
            meta.auditCache = meta.auditCache ?? {}
            meta.auditCache.lastAudit = new Date().toISOString()
            meta.auditCache.orphans = orphans
            meta.auditCache.suspects = orphans
            
            saveSettingsDebounced()

            if (orphans.length > 0) {
                openOrphanModal(orphans)
            } else {
                if (window.toastr) window.toastr.success('No orphaned images found.', 'Localyze')
            }
        } catch (err) {
            console.error('[Localyze] Audit failed:', err)
            if (window.toastr) window.toastr.error('Audit failed. See console for details.', 'Localyze')
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