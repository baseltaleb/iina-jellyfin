# Bug: App Freezes When Playing Media from Browser Window (Same Window)

## Summary

When a user clicks a media item in the browser window and plays it in the **same window**
(`open_in_new_window: false`), the entire IINA app freezes shortly after the video
starts loading. The freeze does not occur when `onFileLoaded` is a no-op.

## Root Cause

The IINA plugin's JavaScript runtime and mpv's video decoding/buffering share the
main thread. When `core.open(streamUrl)` opens an HTTP stream (Jellyfin's
`/Items/{id}/Download` endpoint), mpv begins actively downloading and buffering the
video. If the plugin simultaneously makes `http.get`/`http.post` calls to the
Jellyfin API, the async HTTP callbacks compete with mpv for the main thread — causing
a deadlock that freezes the entire app.

### Evidence from Trace Logs

`onFileLoaded` runs to completion synchronously (all TRACE logs appear). It fires off
several async operations that each call `http.get`:

- `startPlaybackTracking` → `fetchPlaybackInfo` → `http.get(/Items/{id}/PlaybackInfo)`
- `setVideoTitleFromMetadata` → `fetchItemMetadata` → `http.get(/Items/{id})`
- `setupAutoplayForEpisode` → `getSeriesInfoFromEpisode` → `fetchItemMetadata` → `http.get(/Items/{id})`
- `downloadAllSubtitles` → `fetchPlaybackInfo` → `http.get(/Items/{id}/PlaybackInfo)`

~130ms after `onFileLoaded` exits, the first HTTP response resolves:

```
14:26:08.087 [player0 - Jellyfin][d] DEBUG: TRACE: [fetchPlaybackInfo] http.get resolved
```

This is the **last log line ever produced**. The JS runtime never executes the next
line of code (`if (!response.data)`). The main thread is reclaimed by mpv's video
processing and never returns to JavaScript.

### Key Observations

- Commenting out `event.on('mpv.time-pos.changed', ...)` does NOT fix the freeze
- Adding `return` at the top of `onFileLoaded` (no-op) DOES fix the freeze
- Commenting out only the functions that make HTTP requests DOES fix the freeze
- Purely synchronous work in `onFileLoaded` (URL parsing, storing state) is fine

## Affected Flow (Before Fix)

```
Browser click → playMedia() → iina.postMessage('play-media')
  → handlePlayMedia() → core.open(streamUrl)    [video starts loading]
  → iina.file-loaded fires → onFileLoaded()
    → startPlaybackTracking()      [http.get - TRIGGERS FREEZE]
    → setVideoTitleFromMetadata()  [http.get - TRIGGERS FREEZE]
    → setupAutoplayForEpisode()    [http.get - TRIGGERS FREEZE]
    → downloadAllSubtitles()       [http.get - TRIGGERS FREEZE]
```

## Why the New Window Path Was Unaffected

With `open_in_new_window: true` (default) and `enablePlugins: false`, the new player
window has no plugin loaded — no `onFileLoaded`, no HTTP requests, no freeze. The
original window never calls `core.open()`, so there's no video loading to contend
with.

## Applied Fix: Browser WebView HTTP Proxy (Approach 2)

All plugin-context `http.get`/`http.post` calls are now routed through the browser
WebView's `fetch()` API via message passing. The browser runs on its own WebKit
thread, so HTTP responses never contend with mpv on the main thread.

### Architecture

```
BEFORE (freeze):  onFileLoaded → http.get (main thread) → callback (main thread, competes with mpv) → DEADLOCK

AFTER (fix):      onFileLoaded → postMessage('proxy-fetch') → browser fetch() (WebKit thread)
                                                             → postMessage('proxy-fetch-result')
                                                             → plugin processes result (no contention)
```

### Key Changes

1. **`src/proxy-http.js`** (new) — Drop-in `proxyGet()`/`proxyPost()` replacements for
   IINA's `http.get`/`http.post`. Routes requests through the browser WebView via
   message passing. Includes request queuing (for before browser is ready) and 15s timeout.

2. **`src/ui/browser/browser.js`** — Added top-level IIFE that registers a `proxy-fetch`
   message handler. Executes `fetch()` on the WebKit thread and sends results back via
   `proxy-fetch-result`. Sends `proxy-ready` signal on handler registration.

3. **`src/index.js`** — Browser window initialization moved from lazy
   (`showJellyfinBrowser()`) to top-level plugin init so the proxy is available before
   `onFileLoaded` fires. Subtitle downloads deferred 3s (uses `http.download` which
   can't be proxied).

4. **`src/jellyfin-api.js`** — `http.get` → `proxyGet` (3 calls)
5. **`src/playback.js`** — `http.post` → `proxyPost` (4 calls)
6. **`src/autoplay.js`** — `http.get` → `proxyGet` (1 call)

### HTTP Call Disposition

| File | Call | Action |
|------|------|--------|
| `jellyfin-api.js` | `http.get` ×3 | → `proxyGet` |
| `playback.js` | `http.post` ×4 | → `proxyPost` |
| `autoplay.js` | `http.get` ×1 | → `proxyGet` |
| `subtitles.js` | `http.download` ×2 | Keep (deferred 3s) |

### Edge Cases

- **Browser not loaded yet**: Proxy queues requests, replays when `proxy-ready` arrives
- **`http.download` for subtitles**: Can't be proxied (needs IINA temp dir); deferred 3s
- **`auto_open_browser: false`**: Browser loads invisibly at plugin init — proxy works
  regardless of window visibility

## Files Involved

- `src/proxy-http.js` — HTTP proxy module (new)
- `src/index.js` — `onFileLoaded()`, early browser init, `handlePlayMedia()`
- `src/jellyfin-api.js` — `fetchPlaybackInfo()`, `fetchItemMetadata()`, `fetchCurrentUserId()`
- `src/playback.js` — `reportPlaybackStart()`, `reportPlaybackProgress()`, `reportPlaybackStop()`, `markAsWatched()`
- `src/autoplay.js` — `fetchSeriesEpisodes()`
- `src/ui/browser/browser.js` — Proxy fetch handler
- `src/subtitles.js` — `downloadAllSubtitles()` (unchanged, deferred in index.js)
- `src/metadata.js` — `setVideoTitleFromMetadata()` (unchanged, uses proxied jellyfin-api.js)
