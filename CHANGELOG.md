# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Fix playback progress not reporting to Jellyfin when playing from browser UI
- Fix main-thread freeze when playing media in same window by deferring HTTP work 3s and routing API calls through browser WebView proxy
- Continue Watching and Next Up episode cards play the episode directly instead of opening the series page

### Changed

- Redesign browser UI with React/Inafin design system; persist userId in session storage
- Move Jellyfin browser UI from sidebar panel to standalone window
- Rename `src/ui/sidebar/` to `src/ui/browser/`, `JellyfinSidebar` class to `JellyfinBrowser`

- Extract URL parsing and API fetch functions into `src/jellyfin-api.js` module
- Extract session management functions into `src/session.js` module
- Extract subtitle downloading functions into `src/subtitles.js` module
- Extract playback tracking and progress sync functions into `src/playback.js` module
- Extract video title/metadata logic into `src/metadata.js` module
- Extract autoplay/episode playlist logic into `src/autoplay.js` module

### Fixed

- Keep episode list visible after clicking Play Episode instead of returning to main browse view

### Added

- Hide TV shows with no episodes (empty series folders) from the TV Shows tab
- Watched indicator in episode list: green ✓ badge for fully watched episodes, progress bar for partially watched
- Auto-open Jellyfin browser window on startup (configurable via `auto_open_browser` preference)
- **Movies and TV Shows tabs** in the browser with thumbnail grid layout
  - New "Movies" tab displaying all movies from Jellyfin library
  - New "TV Shows" tab displaying all TV series from Jellyfin library
  - Thumbnail grid with poster images (2:3 aspect ratio)
  - Year overlay and type badge on each card
  - Lazy loading of images for better performance
  - Infinite scroll pagination (loads 50 items at a time)
  - Loading, error, and empty state handling
  - Clicking a movie plays it directly; clicking a TV show opens episode browser

### Technical Details

- New modular component architecture in `src/ui/browser/components/`:
  - `MediaCard.js` - Reusable card component for media items
  - `MediaGrid.js` - Grid container with IntersectionObserver-based infinite scroll
  - `LibraryTab.js` - Tab controller with lazy loading and pagination
- Responsive CSS Grid layout adapts to window width
- Components use Jellyfin `/Users/{userId}/Items` API endpoint

## [0.3.0] - 2025-01-XX

### Added

- Bi-directional playback progress sync with Jellyfin server
- Autoplay next episode feature for TV series

## [0.2.0] - Previous Release

### Added

- Media browser sidebar with Recent and Search tabs
- Episode selection for TV series
- "Open in Jellyfin" button to view items in web interface

## [0.1.0] - Initial Release

### Added

- Jellyfin URL parsing and playback in IINA
- Automatic subtitle downloading from Jellyfin
- Session management with auto-login support
