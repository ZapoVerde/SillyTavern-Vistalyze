/**
 * @file data/default-user/extensions/localyze/ui/orphanModal.js
 * @stamp {"utc":"2026-03-29T00:00:00.000Z"}
 * @version 1.0.0
 * @architectural-role Orphan File Review UI
 * @description
 * Modal for reviewing and deleting orphaned Localyze background images.
 * Opened by toolbar.js after a full audit returns results. Shows a
 * checkbox table of orphan filenames with select-all support.
 *
 * Deletion calls POST /api/backgrounds/delete for each selected file.
 * On completion, clears extension_settings.localyze.auditCache and the
 * orphan badge. Never auto-deletes — user must explicitly select and confirm.
 *
 * @api-declaration
 * openOrphanModal(orphans) — opens the modal; toastr if orphans is empty
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [extension_settings.localyze.auditCache (write)]
 *     external_io: [POST /api/backgrounds/delete, saveSettingsDebounced(),
 *       clearOrphanBadge()]
 */
import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js'
import { extension_settings } from '../../../../extensions.js'
import { clearOrphanBadge } from './toolbar.js'

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function openOrphanModal(orphans) {
    if (!orphans || orphans.length === 0) {
        toastr.success('No orphaned images found.', 'Localyze')
        return
    }

    const rowsHtml = orphans.map(filename => `
        <tr>
            <td style="width:32px; text-align:center;">
                <input type="checkbox" class="lz-orphan-check" value="${escapeHtml(filename)}" />
            </td>
            <td>${escapeHtml(filename)}</td>
        </tr>
    `).join('')

    const modal = $(`<div class="localyze-confirm-overlay" id="lz-orphan-overlay">
        <div class="localyze-modal" style="min-width:520px; max-width:720px;">
            <h3>Orphaned Localyze Images (${orphans.length})</h3>
            <p class="localyze-dim">These files belong to sessions not found in any known chat.</p>
            <table>
                <thead>
                    <tr>
                        <th style="width:32px; text-align:center;">
                            <input type="checkbox" id="lz-orphan-select-all" title="Select All" />
                        </th>
                        <th>Filename</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <div class="localyze-modal-actions">
                <button class="menu_button" id="lz-orphan-close">Close</button>
                <button class="menu_button" id="lz-orphan-delete">Delete Selected</button>
            </div>
        </div>
    </div>`)

    // Select all toggle
    modal.find('#lz-orphan-select-all').on('change', function () {
        modal.find('.lz-orphan-check').prop('checked', this.checked)
    })

    // Close
    modal.find('#lz-orphan-close').on('click', () => {
        modal.remove()
    })

    // Delete selected
    modal.find('#lz-orphan-delete').on('click', async () => {
        const selected = modal.find('.lz-orphan-check:checked').map(function () {
            return this.value
        }).get()

        if (selected.length === 0) {
            toastr.warning('No files selected.', 'Localyze')
            return
        }

        const deleteBtn = modal.find('#lz-orphan-delete')
        deleteBtn.prop('disabled', true).text('Deleting...')

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

        // Clear auditCache
        if (extension_settings.localyze) {
            extension_settings.localyze.auditCache = {
                suspects: [],
                lastAudit: null,
                orphans: [],
            }
            saveSettingsDebounced()
        }

        clearOrphanBadge()
        modal.remove()

        if (failed > 0) {
            toastr.warning(`Deleted ${selected.length - failed} files. ${failed} deletion(s) failed.`, 'Localyze')
        } else {
            toastr.success(`Deleted ${selected.length} orphaned file(s).`, 'Localyze')
        }
    })

    $('body').append(modal)
}
