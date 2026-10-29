# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Percy visual regression testing suite for the Cymulate website (cymulate.com). Takes snapshots of key pages and compares them against baselines to detect unintended design changes.

## Commands

```bash
# Install dependencies
npm ci

# Run Percy visual tests (requires env vars)
npm test
```

`npm test` runs `visual-test.js`, which dynamically generates `snapshots.yml` and `percy-config.yml`, executes Percy CLI, then cleans up those temp files.

## Required Environment Variables

For local runs, create a `.env` file (gitignored):

```
BASE_URL=          # Target website base URL (e.g., https://cymulate.com)
PERCY_TOKEN=       # Percy CLI authentication token
```

Optional (defaults shown):
```
PERCY_PARALLEL_WORKERS=2           # injected into discovery.concurrency in percy-config.yml
PERCY_NETWORK_IDLE_WAIT_TIMEOUT=60000      # values over 60000 trigger a Percy CLI warning
PERCY_PAGE_LOAD_TIMEOUT=60000
```

## Architecture

The entire test logic lives in a single file: **`visual-test.js`**

It does the following in sequence:
1. Loads env vars; exits early if `BASE_URL` or `PERCY_TOKEN` is missing
2. Defines an array of ~40 URL paths covering key pages of the Cymulate site (including the blog, resources, news, events, webinars and research listing pages)
3. Builds snapshot config: each URL gets a scroll-and-wait `beforeSnapshot` script and `percyCSS` to hide dynamic/unstable elements (consent banners, chat widgets, animation counters, etc.)
4. Writes two temp YAML files: `snapshots.yml` (per-page config) and `percy-config.yml` (global Percy settings)
5. Calls `npx percy snapshot` via `execSync`, passing env overrides
6. Cleans up the temp YAML files in `finally`

Percy config snapshot widths: `[1920, 414]` (desktop + mobile). Browser: Chrome only.

## CI/CD — `.github/workflows/percy-visual-tests.yml`

**Triggers**:
- Push to `main`/`master`
- **Scheduled**: `0 14 * * *` UTC → Internal Slack channel; `0 19 * * *` UTC → Client Slack channel
- **Manual** (`workflow_dispatch`): user selects `internal` or `client` target

**Secrets required in GitHub**:
- `PERCY_TOKEN`
- `BASE_URL`
- `SLACK_WEBHOOK_INTERNAL`
- `SLACK_WEBHOOK_CLIENT`

**Slack notification** routing: determined by which schedule triggered or what `target` was selected in manual dispatch. Fallback Percy build URL is hardcoded to the Cymulate-amplect project if not parsed from logs.

## Key Design Decisions

- **Hidden elements via `percyCSS`**: iframes, cookie consent SDK, chat widget, animation progress bars, sticky/featured posts — all hidden to prevent flaky diffs
- **Scroll + image wait script** (`beforeSnapshot`): scrolls full page to trigger lazy-load, then waits for all `<img>` elements to load (5 s fallback per image), then sleeps 1 s
- **User-Agent `PercyBot/1.0`** in discovery config: required to pass Cloudflare bot protection on the target site
- **`networkIdleTimeout` intentionally excluded** from Percy config — it caused issues; timeouts are set via env vars instead
- **Trackers are blocked via `discovery.disallowedHostnames`** — Percy aborts requests to analytics/marketing/widget hosts during asset discovery. Without this, ~150 third-party requests per page starved the CI runner's network and same-origin assets couldn't finish within the idle budget ("Timed out waiting for network requests to idle"). The idle wait itself only counts requests to the BASE_URL host. Fonts, reCAPTCHA, and HubSpot forms/CTAs are deliberately not blocked. If a new tracker appears, add its hostname to `disallowedHostnames` in `visual-test.js`
- **Concurrency is set via `discovery.concurrency`** in the generated config (from `PERCY_PARALLEL_WORKERS`, default 2). Percy CLI does NOT read `PERCY_PARALLEL_WORKERS` as an env var — without the config option, the CLI captures 10 pages in parallel (its internal default), which caused Chromium OOM crashes ("Browser disconnected" loops) on GitHub runners
- **Asset-discovery cache is intentionally unbounded** — the `--max-cache-ram` flag (@percy/cli >= 1.31.14) is not wired in. If "Browser disconnected" OOM loops return, appending `--max-cache-ram 2048` to the `percy snapshot` command in `visual-test.js` is the first lever to pull
