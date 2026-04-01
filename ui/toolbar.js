/**
 * @file data/default-user/extensions/localyze/ui/toolbar.js
 * @stamp {"utc":"2026-04-03T18:10:00.000Z"}
 * @version 1.7.0
 * @architectural-role Toolbar UI
 * @description
 * Injects management buttons into the ST extensions panel (#extensionsMenu).
 *
 * @updates
 * - Migration: Replaced direct mutation of auditCache with the updateMetaSetting() API.
 * - Standardized Callbacks: Uses logic/maintenance.js controllers for all entries.
 *
 * @api-declaration
 * injectToolbar(onOpenLibrary, onEdit, onManualDetect) — Injects toolbar buttons.
 * showOrphanBadge(count) — shows red count badge on audit button.
 * clearOrphanBadge()     — hides badge.
 *
 * @contract
 *   assertions:
 *     purity: IO
 *     state_ownership: [none]
 *     external_io: [#extensionsMenu DOM, updateMetaSetting, maintenance.js]
 */
import { getRequestHeaders } from '../../../../../script.js';
import { openOrphanModal } from './orphanModal.js';
import { runFullAudit } from '../orphanDetector.js';
import { updateMetaSetting } from '../settings/data.js';

/**
 * Injects the Localyze suite buttons into the ST extension menu.
 * @param {Function} onOpenLibrary Callback from maintenance.js to sync and open library.
 * @param {Function} onEdit Callback for Architect mode.
 * @param {Function} onManualDetect Callback for Discovery/Explorer mode.
 */
export function injectToolbar(onOpenLibrary, onEdit, onManualDetect) {
    // 1. Cleanup for hot-reloads
    $('#lz-toolbar-btn').remove();
    $('#lz-explorer-btn').remove();
    $('#lz-audit-btn').remove();

    // 2. Library Button
    const pickerBtn = $(`
        <div id="lz-toolbar-btn" class="list-group-item flex-container flexGap5" title="Localyze: Library">
            <i class="fa-solid fa-location-dot"></i>
            <span>Localyze Library</span>
        </div>
    `);
    
    pickerBtn.on('click', () => {
        if (typeof onOpenLibrary === 'function') onOpenLibrary();
    });

    // 3. Discovery Button
    const explorerBtn = $(`
        <div id="lz-explorer-btn" class="list-group-item flex-container flexGap5" title="Localyze: Discover New Location">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Discovery</span>
        </div>
    `);
    
    explorerBtn.on('click', async () => {
        if (typeof onManualDetect === 'function') await onManualDetect();
    });

    // 4. Audit Button
    const auditBtn = $(`
        <div id="lz-audit-btn" class="list-group-item flex-container flexGap5" title="Localyze: Audit Images">
            <i class="fa-solid fa-trash-can"></i>
            <span>Audit Images</span>
            <span id="lz-orphan-badge" style="display:none; background:var(--SmartThemeErrorColor); color:white; padding:1px 6px; border-radius:10px; font-size:0.75em; margin-left:auto;"></span>
        </div>
    `);
    
    auditBtn.on('click', async () => {
        const originalHtml = auditBtn.find('span:first').html();
        
        try {
            auditBtn.find('span:first').text('Auditing...');
            
            const res = await fetch('/api/backgrounds/all', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({}),
            });
            const data = await res.json();
            const images = data.images ?? [];

            // Perform deep audit
            const orphans = await runFullAudit(images);

            // Protected Update: Update Global Cache via Setter API
            const newAuditCache = {
                lastAudit: new Date().toISOString(),
                orphans: orphans,
                suspects: orphans
            };
            updateMetaSetting('auditCache', newAuditCache);

            if (orphans.length > 0) {
                openOrphanModal(orphans);
            } else {
                if (window.toastr) window.toastr.success('No orphaned images found.', 'Localyze');
            }
        } catch (err) {
            console.error('[Localyze] Audit failed:', err);
            if (window.toastr) window.toastr.error('Audit failed. See console for details.', 'Localyze');
        } finally {
            auditBtn.find('span:first').html(originalHtml);
        }
    });

    // 5. DOM Injection
    const $menu = $('#extensionsMenu');
    if ($menu.length) {
        $menu.append(pickerBtn);
        $menu.append(explorerBtn);
        $menu.append(auditBtn);
    }
}

/**
 * Updates the visual badge for orphan detection results.
 * @param {number} count 
 */
export function showOrphanBadge(count) {
    if (count > 0) {
        $('#lz-orphan-badge').text(count).show();
    } else {
        clearOrphanBadge();
    }
}

/**
 * Hides the badge.
 */
export function clearOrphanBadge() {
    $('#lz-orphan-badge').hide().text('');
}