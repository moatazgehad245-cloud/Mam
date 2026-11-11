# 11:11

A small, cinematic love letter in three screens: a locked padlock, a floating envelope that has to be caught, and a prayer letter that rises out of it.

## Files

```
11-11/
├── index.html        Markup for all three screens, plus the CDN script tags
├── css/
│   └── style.css     Palette, layout, ambient effects, responsive rules
└── js/
    ├── lock.js       Screen 1: Three.js padlock (CSS fallback)
    ├── envelope.js   Screen 2: Three.js envelope with a 3-touch sequence (CSS fallback)
    └── app.js        Password check, screen flow, prayer letter, particles, parallax
```

## Running it

Open `index.html` in a browser. Some browsers block scripts loaded from `file://`, so a local server is more reliable:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` (or your branch) and the root folder `/`.
4. Save. The site is served at `https://<user>.github.io/<repo>/`.

All paths are relative, so it works from a repository subpath.

## Password

The lock accepts `201281`. Arabic-Indic digits (٢٠١٢٨١) are accepted too.

## Dependencies

Loaded from pinned CDN builds. None of them are paid, and no API keys or login are needed.

| Library   | Version | Used for                                  |
|-----------|---------|-------------------------------------------|
| Three.js  | r128    | 3D padlock, 3D envelope, wax seal         |
| GSAP      | 3.12.5  | Transitions, flap opening, letter rising  |
| Google Fonts | —    | Cormorant Garamond (English), Amiri (Arabic) |

## Graceful fallbacks

- **No WebGL or Three.js:** the padlock and envelope switch to CSS 3D versions with the same behavior.
- **No GSAP:** animations snap to their end states or use CSS transitions, and the flow still works.
- **Reduced motion:** ambient motion is turned down and the particle field draws a single static frame.
- **Performance:** the 3D loops run only while their screen is visible and stop after the envelope opens. The particle field pauses when the tab is hidden.

## Touch behavior

The first two taps on the envelope make it fly to a new random spot that stays inside the screen. The third tap stops it, makes it glow, and opens it. Mouse clicks and touch both work, and the page doesn't scroll during the envelope screen.
