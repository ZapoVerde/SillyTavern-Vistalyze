/**
 * @file data/default-user/extensions/localyze/ui/orphanModal.js
 * @stamp {"utc":"2026-03-30T00:00:00.000Z"}
 * @version 1.2.0
 * @architectural-role Orphan File Review UI
 * @description
 * Modal for reviewing and deleting orphaned Localyze background images.
 * Opened by toolbar.js after a full audit returns results. Shows a
 * checkbox table of orphan filenames with select-all support.
 *
 * Version 1.2.0 Updates:
 * - Refactored to use getMetaSettings() for clearing the global auditCache.
 * - Hardened deletion loop and success notifications.
 *
 * @api-declaration
 * openOrphanModal(orphans) — opens the modal; toastr if orphans is empty.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [getMetaSettings().auditCache (write)]
 *     external_io: [POST /api/backgrounds/delete, saveSettingsDebounced(),
 *       clearOrphanBadge()]
 */
import { getRequestHeaders, saveSettingsDebounced, callPopup } from '../../../../../script.js'
import { clearOrphanBadge } from './toolbar.js'
import { getMetaSettings } from '../settings/data.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function openOrphanModal(orphans) {
    if (!orphans || orphans.length === 0) {
        toastr.success('No orphaned images found.', 'Localyze')
        return
    }

    const rowsHtml = orphans.map(filename => `
        <tr>
            <td style="width:32px; text-align:center;">
                <input type="checkbox" class="lz-orphan-check" value="${escapeHtml(filename)}" checked />
            </td>
            <td style="font-size:0.85em;">${escapeHtml(filename)}</td>
        </tr>
    `).join('')

    const confirmed = await callPopup(
        `<h3>Orphaned Localyze Images (${orphans.length})</h3>
        <p style="opacity:0.65;font-size:0.88em;">These files belong to sessions not found in any known chat.</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.88em;">
            <thead>
                <tr>
                    <th style="width:32px;text-align:center;">
                        <input type="checkbox" id="lz-orphan-select-all" title="Select All" checked />
                    </th>
                    <th style="text-align:left;">Filename</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>`,
        'confirm',
    )

    // Bind event handlers after callPopup renders
    $('#lz-orphan-select-all').on('change', function () {
        $('.lz-orphan-check').prop('checked', this.checked)
    })

    if (!confirmed) return

    const selected = $('.lz-orphan-check:checked').map(function () { return this.value }).get()
    if (selected.length === 0) {
        toastr.warning('No files selected.', 'Localyze')
        return
    }

    let failed = 0
    for (const file of selected) {
        try {
            const res = await fetch('/api/backgrounds/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ bg: file }),
            })
            if (!res.ok) failed++
        } catch {
            failed++
        }
    }

    // Reset the global audit cache in meta settings
    const meta = getMetaSettings()
    meta.auditCache = {
        suspects: [],
        lastAudit: new Date().toISOString(),
        orphans: []
    }
    
    saveSettingsDebounced()
    clearOrphanBadge()

    if (failed > 0) {
        toastr.warning(`Deleted ${selected.length - failed} files. ${failed} deletion(s) failed.`, 'Localyze')
    } else {
        toastr.success(`Deleted ${selected.length} orphaned file(s).`, 'Localyze')
    }
}