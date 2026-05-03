/**
 * @file data/default-user/extensions/vistalyze/ui/bgHijacker.js
 * @stamp {"utc":"2026-05-03T13:45:00.000Z"}
 * @architectural-role UI Utility / Hijack Controller
 * @description
 * Orchestrates the "Hijack Pattern" for the native SillyTavern Background drawer.
 * Temporarily hides the Vistalyze UI, opens the native ST gallery, and intercepts 
 * thumbnail clicks to capture filenames without triggering ST's native background 
 * change logic.
 *
 * @api-declaration
 * pickNativeBackground() → Promise<string | null>
 *
 * @contract
 *   assertions:
 *     purity: UI / IO
 *     state_ownership: [none]
 *     external_io: [DOM (#Backgrounds, #backgrounds-drawer-toggle, #lz-workshop-overlay), i18n]
 */

import { translate } from '../../../../i18n.js';

/**
 * Temporarily takes over the ST Background drawer to allow the user to 
 * select an existing file.
 * 
 * @returns {Promise<string | null>} The filename selected, or null if cancelled.
 */
export async function pickNativeBackground() {
    const $drawer = $('#Backgrounds');
    const $toggle = $('#backgrounds-drawer-toggle');
    const $overlay = $('#lz-workshop-overlay');
    const wasDrawerClosed = $drawer.hasClass('closedDrawer');

    // 1. Enter Hijack State
    $overlay.addClass('lz-hidden'); // Hide Vistalyze modal

    // Drop the ST callPopup modal behind the background drawer (~z 3500) so the
    // drawer is accessible. Restored in cleanup.
    const $popup = $('#dialogue_popup');
    const popupPriorZ = $popup.css('z-index');
    $popup.css('z-index', '500');

    // 2. Open native drawer if needed
    if (wasDrawerClosed) {
        $toggle.trigger('click');
    }

    // 3. Inject Floating "Return" Button
    // This ensures the user knows they are in a selection mode and can get back.
    const $cancelBtn = $(`
        <div id="lz-hijack-cancel" style="
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10001;
            background: var(--SmartThemeQuoteColor);
            color: white;
            padding: 10px 25px;
            border-radius: 30px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 10px;
        ">
            <i class="fa-solid fa-arrow-left"></i>
            <span>${translate('Return to Vistalyze (Cancel Selection)')}</span>
        </div>
    `);
    $('body').append($cancelBtn);

    return new Promise((resolve) => {
        let settled = false;

        const observer = new MutationObserver(() => {
            if ($drawer.hasClass('closedDrawer')) {
                observer.disconnect();
                cleanup(null);
            }
        });
        observer.observe($drawer[0], { attributes: true, attributeFilter: ['class'] });

        const cleanup = (result) => {
            if (settled) return;
            settled = true;

            // Disconnect observer before closing the drawer to avoid re-entry
            observer.disconnect();

            // Unbind listeners from the native drawer
            $drawer.off('click.lzHijack');
            $cancelBtn.off('click').remove();

            // Restore drawer state if we opened it
            if (wasDrawerClosed && !$drawer.hasClass('closedDrawer')) {
                $toggle.trigger('click');
            }

            // Restore popup z-index and Vistalyze overlay
            $popup.css('z-index', popupPriorZ);
            $overlay.removeClass('lz-hidden');
            resolve(result);
        };

        // 4. The Intercept
        // We bind a delegated listener to the drawer.
        // Using namespaces (.lzHijack) ensures we don't accidentally remove ST's own events.
        $drawer.on('click.lzHijack', '.bg_example', function (e) {
            // STOP! We don't want ST to process this click and save metadata yet.
            e.preventDefault();
            e.stopPropagation();

            const bgFile = $(this).attr('bgfile');
            if (bgFile) {
                cleanup(bgFile);
            }
        });

        // 5. Handle Cancellation
        $cancelBtn.on('click', () => cleanup(null));
    });
}