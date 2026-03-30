/**
 * @file data/default-user/extensions/localyze/ui/toolbar.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.2.0
 * @architectural-role Toolbar UI
 * @description
 * Injects two buttons into the ST extensions panel (#extensionsMenu):
 *
 *   Localyze button  — opens the location picker modal for manual override.
 *   Audit Images btn — runs full orphan audit and opens orphanModal if needed;
 *                      carries the orphan badge (#lz-orphan-badge) which is
 *                      shown by index.js after the boot-time fast diff.
 *
 * Version 1.2.0 Updates:
 * - Refactored to use getMetaSettings() for the global auditCache.
 * - Standardized badge and audit lifecycle with the profile system.
 *
 * @api-declaration
 * injectToolbar()        — idempotent; injects both buttons.
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
            // Fetch the full image list for the audit
            const images = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            }).then(r => r.json()).then(d => d.images ?? [])

            // Run the expensive full audit across all character folders
            const orphans = await runFullAudit(images)

            // Access global meta settings to store results
            const meta = getMetaSettings()
            meta.auditCache = meta.auditCache ?? {}
            meta.auditCache.lastAudit = new Date().toISOString()
            meta.auditCache.orphans = orphans
            meta.auditCache.suspects = orphans
            
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