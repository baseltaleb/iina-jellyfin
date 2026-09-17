
## Project Overview

IINA Jellyfin Plugin - A macOS media player plugin (JavaScript) that provides Jellyfin media server integration including automatic subtitle downloading, a standalone media browser window, and bi-directional playback progress sync.

## Commands

```bash
# Linting and formatting
pnpm lint           # Run ESLint on src/
pnpm lint:fix       # Auto-fix ESLint issues
pnpm format         # Check Prettier formatting
pnpm format:fix     # Auto-fix Prettier formatting
pnpm check          # Run both ESLint and Prettier checks

# Local development (requires IINA installed)
/Applications/IINA.app/Contents/MacOS/iina-plugin link .    # Link plugin for testing
/Applications/IINA.app/Contents/MacOS/iina-plugin unlink .  # Unlink plugin

# Packaging
/Applications/IINA.app/Contents/MacOS/iina-plugin pack .    # Create .iinaplgz for distribution
```

## Architecture

**Entry Points** (defined in `Info.json`):

- `src/index.js` - Main plugin entry: orchestrates modules, handles URL events, registers menus
- `src/global.js` - Global entry: Creates new player windows via `global.createPlayerInstance()`
- `src/ui/browser/` - Browser UI (standalone window): Authentication, library browsing, search, playback control

**Core Modules** (`src/`):

- `jellyfin-api.js` - URL parsing (`parseJellyfinUrl`, `isJellyfinUrl`) and API fetch functions
- `session.js` - Session storage, retrieval, and credential management
- `subtitles.js` - Subtitle downloading (single, external, bulk)
- `playback.js` - Playback tracking, progress reporting, resume position, mark-as-watched
- `metadata.js` - Video title and metadata display
- `autoplay.js` - Episode fetching, playlist building, autoplay setup
- `utils.js` - Shared utilities (`debugLog`, base64 encoding, ticks↔seconds conversion)

**Browser Components** (`src/ui/browser/components/`):

- `Authentication.js` - Login form, session persistence, auto-login from URLs
- `RecentTab.js` - Recently added items tab controller
- `LibraryTab.js` - Tab controller for Movies/TV Shows with lazy loading and pagination
- `MediaCard.js` - Reusable thumbnail card component for media items
- `MediaGrid.js` - CSS Grid container with infinite scroll (IntersectionObserver)

**Two JavaScript Environments**:

1. **Plugin context** (`src/index.js`, `src/global.js`, core modules): Uses IINA globals (`iina`, `http`, `event`, `menu`, `preferences`, `console`, `mpv`, `playlist`, `global`, `standaloneWindow`, `core`, `utils`)
2. **Browser context** (`src/ui/browser/`): Standard browser globals (`window`, `document`, `fetch`) plus `iina` and `http`

**Plugin ↔ Browser Communication** via message passing:

- `standaloneWindow.postMessage(name, data)` / `standaloneWindow.onMessage(name, callback)` - Plugin sends to browser window
- Messages include: `play-media`, `get-session`, `session-data`, `session-available`, `clear-session`, `store-session`

**Key Jellyfin API Integrations**:

- Subtitle fetching via `/Items/{id}/RemoteSearch/Subtitles`
- Playback progress reporting via `/Sessions/Playing/Progress` and `/Sessions/Playing/Stopped`
- Library browsing via `/Users/{id}/Items/Latest` and `/Users/{id}/Items` (with `includeItemTypes` filter)
- Episode listing via `/Shows/{seriesId}/Episodes`
- Playback info via `/Items/{id}/PlaybackInfo`
- Thumbnail images via `/Items/{id}/Images/Primary`
- Authentication via `/Users/AuthenticateByName`

## Code Style

- ESLint: Flat config with two contexts (plugin: CommonJS globals, UI/browser: browser globals)
  - Core rules: `prefer-const`, `no-var`, `eqeqeq`, `curly`, `no-eval`, `no-implied-eval`, `no-shadow`, `no-redeclare`
  - Disabled: `no-console`, `no-useless-escape`
- Prettier: 100 char lines, 2-space indent, semicolons, single quotes, trailing commas (es5)
- Debug logging available via `preferences.get('debug_logging')` (use `debugLog()` from utils.js)
- Commit style: Conventional Commits (feat:, fix:, chore:, refactor:)

## Testing

No unit test framework. Testing is manual via IINA:

1. Link plugin: `/Applications/IINA.app/Contents/MacOS/iina-plugin link .`
2. Test features in IINA (open Jellyfin URLs, use browser window, check playback sync)
3. Check debug logs via IINA developer console
4. Unlink when done

## Preferences

Default preferences in `Info.json` → `preferenceDefaults`. Key settings:

- `sync_playback_progress` - Bi-directional progress sync with Jellyfin
- `autoplay_next_episode` - Auto-play next episode in series
- `auto_login_enabled` - Extract credentials from Jellyfin URLs
- `debug_logging` - Enable console debug output

## Known Issues

- **Main thread contention bug**: HTTP requests during video buffering can freeze the app when playing in the same window. See `FREEZE_BUG.md` for details and proposed fixes. The `open_in_new_window` preference (default: true) is the current workaround.
