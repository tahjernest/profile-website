# Ebonee Crawford — Cinematic Scroll Portfolio

A scroll-driven, Awwwards-style personal portfolio for **Ebonee Crawford, AI Consultant**.
Ink-black canvas, hot-pink accent, cream type. The hero is an AI-generated 360° orbit of
Ebonee (Seedance 2.0, identity-locked to her photo) scrubbed frame-by-frame as you scroll.

## Run it

Any static server from the repo root:

```bash
python3 -m http.server 4173
# open http://localhost:4173
```

## Deploy (Vercel)

This is a plain static site — no build step, no dependencies to install. On
Vercel, import the repo and accept every default (Framework Preset: **Other**,
build command: **empty**, output directory: **empty**). It deploys from `main`.

`vercel.json` sets cache headers on the media, and `.vercelignore` keeps the
pipeline tooling and the unused hero source clip off the CDN. Media in
`frames/` and `video/` is cached for 7 days with background revalidation, so
if you regenerate a clip the change reaches visitors within a week rather than
being pinned forever.

## Structure

- `index.html` — single page: hero orbit → stats → pillars → work → finale
- `css/style.css` — design system (`--ink`, `--pink`, `--cream` in `:root`)
- `js/main.js` — Lenis smooth scroll + canvas frame scrub + scene orchestration
- `frames/hero/` — JPEG frame sequence + `index.json` (`{"count": N}`)
- `video/builder.mp4`, `video/closer.mp4` — ambient section backgrounds
- `fonts/` — Anton (display) + Space Grotesk (body), self-hosted

## Edit your content

- **Stats**: `index.html` → `.stat__num` elements (`data-value`, `data-prefix`, `data-suffix`).
  Current numbers are placeholders — put your real ones in.
- **Pillars / Work cards / CTA / socials**: plain HTML in `index.html`, clearly sectioned.
  Social links currently point at the platform home pages — swap in your profiles.

## Media pipeline (how the visuals were made)

Three 8s Seedance 2.0 clips (1080p, 16:9, silent), all using the same identity reference
photo and wardrobe (white collared button-up):

1. **Hero orbit** — black void, pink rim light, slow 360° camera orbit → extracted to a
   JPEG sequence for the scroll scrub.
2. **The Builder** — dark desk, floating holographic screens, slow push-in.
3. **The Closer** — walk toward camera down a gallery of glowing screens.

`tools/fetch_media.py` + `.github/workflows/fetch-media.yml` form a small bridge that
downloads generated media and extracts frames on a GitHub Actions runner, then commits
the assets back to this branch.
