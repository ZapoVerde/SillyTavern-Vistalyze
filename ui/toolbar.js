/**
 * @file data/default-user/extensions/localyze/ui/toolbar.js
 * @stamp {"utc":"2026-04-02T10:05:00.000Z"}
 * @version 1.6.1
 * @architectural-role Toolbar UI
 * @description
 * Injects management buttons into the ST extensions panel (#extensionsMenu).
 *
 * @updates
 * - Added onOpenLibrary callback to ensure data sync before showing UI.
 * - "Localyze" button now triggers the provided callback.
 *
 * @api-declaration
 * injectToolbar(onOpenLibrary, onEdit, onManualDetect) — Injects Localyze, Discovery, and Audit buttons.
 * showOrphanBadge(count) — shows red count badge on audit button.
 * clearOrphanBadge()     — hides badge.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [none]
 *     external_io: [#extensionsMenu DOM, runFullAudit, openWorkshop]
 */
import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js';
import { openWorkshop } from './workshopModal.js';
import { openOrphanModal } from './orphanModal.js';
import { runFullAudit } from '../orphanDetector.js';
import { getMetaSettings } from '../settings/data.js';

/**
 * Injects the Localyze suite buttons into the ST extension menu.
 * @param {Function} onOpenLibrary Callback to sync and open library.
 * @param {Function} onEdit Callback for Architect mode.
 * @param {Function} onManualDetect Callback for Discovery/Explorer mode.
 */
export function injectToolbar(onOpenLibrary, onEdit, onManualDetect) {
    // Cleanup for hot-reloads
    $('#lz-toolbar-btn').remove();
    $('#lz-explorer-btn').remove();
    $('#lz-audit-btn').remove();

    // 1. Library Button (Primary entry)
    const pickerBtn = $(`
        <div id="lz-toolbar-btn" class="list-group-item flex-container flexGap5" title="Localyze: Library">
            <i class="fa-solid fa-location-dot"></i>
            <span>Localyze Library</span>
        </div>
    `);
    pickerBtn.on('click', () => {
        if (typeof onOpenLibrary === 'function') {
            onOpenLibrary();
        } else {
            openWorkshop('library');
        }
    });

    // 2. Discovery Button (Force Detect replacement)
    const explorerBtn = $(`
        <div id="lz-explorer-btn" class="list-group-item flex-container flexGap5" title="Localyze: Discover New Location">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Discovery</span>
        </div>
    `);
    explorerBtn.on('click', async () => {
        if (typeof onManualDetect === 'function') {
            await onManualDetect();
        } else {
            openWorkshop('explorer');
        }
    });

    // 3. Audit Button
    const auditBtn = $(`
        <div id="lz-audit-btn" class="list-group-item flex-container flexGap5" title="Localyze: Audit Images">
            <i class="fa-solid fa-trash-can"></i>
            <span>Audit Images</span>
            <span id="lz-orphan-badge" style="display:none; background:var(--SmartThemeErrorColor); color:white; padding:1px 6px; border-radius:10px; font-size:0.75em; margin-left:auto;"></span>
        </div>
    `);
    auditBtn.on('click', async () => {
        try {
            const res = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            });
            const data = await res.json();
            const images = data.images ?? [];

            const orphans = await runFullAudit(images);

            const meta = getMetaSettings();
            meta.auditCache = meta.auditCache ?? {};
            meta.auditCache.lastAudit = new Date().toISOString();
            meta.auditCache.orphans = orphans;
            meta.auditCache.suspects = orphans;
            
            saveSettingsDebounced();

            if (orphans.length > 0) {
                openOrphanModal(orphans);
            } else {
                if (window.toastr) window.toastr.success('No orphaned images found.', 'Localyze');
            }
        } catch (err) {
            console.error('[Localyze] Audit failed:', err);
            if (window.toastr) window.toastr.error('Audit failed. See console for details.', 'Localyze');
        }
    });

    // Injection order
    const $menu = $('#extensionsMenu');
    $menu.append(pickerBtn);
    $menu.append(explorerBtn);
    $menu.append(auditBtn);
}

/**
 * Visual badge for orphan detection.
 */
export function showOrphanBadge(count) {
    $('#lz-orphan-badge').text(count).show();
}

/**
 * Hide badge after cleanup.
 */
export function clearOrphanBadge() {
    $('#lz-orphan-badge').hide().text('');
}