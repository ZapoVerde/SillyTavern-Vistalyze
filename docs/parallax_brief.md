# Parallax Background — Design Brief

Subtle horizontal panning effect on the managed background image, driven by mouse
movement (desktop) or device tilt (mobile).

## Concept

The image is displayed at its native aspect ratio, filling the viewport height. When the
viewport is narrower than the displayed image width, it acts as a window — panning
reveals the sides. When the viewport is wider or equal, the image is centered and the
effect is dormant. No images are resized or regenerated. Works with all existing images.

## DOM Approach

Replace `#bg1`'s CSS `background-image` with an injected `<img>`:

```html
<img id="lz-bg-img"
     src="{url}"
     style="position:absolute; height:100%; width:auto; top:0;
            pointer-events:none; will-change:transform;" />
```

After `img.onload`:
- Compute `displayedWidth = img.naturalWidth * (window.innerHeight / img.naturalHeight)` —
  derived from the known constraint (height: 100%), no layout flush required
- Set `img.style.left = ((window.innerWidth - displayedWidth) / 2) + 'px'` — centers image
- Compute `panRange = Math.max(0, (displayedWidth - window.innerWidth) / 2)`
- Cap: `effectivePan = Math.min(panRange, 200)` — prevents wild travel on very narrow screens

`#bg1` must have `overflow: hidden`. The `<img>` child owns the visual; `#bg1`'s own
`background-image` CSS stays empty.

## Pan Behavior

Horizontal only. No vertical translation.

At neutral (cursor center, device level): `translateX(0)` — image centered.
Image moves opposite to input direction (natural parallax feel).

```js
// Mouse
targetX = -((e.clientX / window.innerWidth) - 0.5) * 2 * effectivePan

// Tilt
const gx = Math.max(-30, Math.min(30, e.gamma))  // clamp ±30°
targetX = -(gx / 30) * effectivePan
```

## Smoothing

Lerp in the rAF loop. Two coefficients — tilt gets more damping because accelerometer
is noisier than a mouse:

```js
// alpha = 0.12 for mouse, 0.06 for tilt
currentX += (targetX - currentX) * alpha
img.style.transform = `translateX(${currentX}px)`
```

`effectivePan` already scales down travel on narrow screens. The lerp removes
micro-jitter. No additional screen-size math needed.

## Resize Handling

On `window resize`:
- Recompute `displayedWidth` from `img.offsetWidth`
- Recompute `img.style.left`, `panRange`, `effectivePan`
- Clamp `currentX` into the new `effectivePan` range immediately

## Module: `ui/parallax.js`

```
attachParallax(url)   — injects #lz-bg-img, starts rAF loop, binds events
detachParallax()      — removes #lz-bg-img, cancels rAF, unbinds all events
```

Guards:
- `attachParallax` calls `detachParallax` first if `#lz-bg-img` already exists —
  handles rapid set() calls without leaking listeners or frames
- rAF loop tracks whether `currentX` changed; skips DOM write when idle

## Changes to `background.js`

`set(filename)`:
- Remove `$('#bg1').css('background-image', cssUrl)` from the fade sequence
- Replace it with `attachParallax(url)` in the same position — called while `#bg1` is
  still at `opacity: 0`, before the fade-in begins. The image loads during the
  invisible window; by the time the fade-in completes it is positioned and ready.

`clear()`:
- Call `detachParallax()` before the fade-out begins

Two modified lines. Everything else in `background.js` is unchanged.

## Device Tilt — iOS Permission

`deviceorientation` does not fire on iOS 13+ until `DeviceOrientationEvent.requestPermission()` is called from a direct user gesture. Listening for the event first and reacting to it is not viable — it will never arrive.

Correct flow:
1. On mobile (`'ontouchstart' in window`), after the first `attachParallax` call, show a
   one-time toast: "Enable tilt parallax?" with a tap target.
2. On tap: call `DeviceOrientationEvent.requestPermission()`, bind the listener on grant.
3. Store outcome in `sessionStorage` — do not re-prompt within the same session.

`mousemove` is bound on all devices regardless, as the desktop path and mobile fallback.

## Scope

| What | Detail |
|---|---|
| New file | `ui/parallax.js` — ~80–90 lines |
| Modified | `background.js` — 2 lines changed |
| Unchanged | `imageCache.js`, all dimensions, generation pipeline, state, reconstruction, detection, all modals |
