# Plex-Style Home Screen Design

## Goal

Add a Plex-style home screen to the Jellyfin browser with horizontal-scrolling rows for Continue Watching, Next Up, and Recently Added (grouped by series/season).

## Approach

Approach A: New Home Tab Component — additive change that slots alongside existing tabs. Reuses MediaCard, leverages Jellyfin's built-in resume/next-up APIs.

## Component Architecture

### UI Primitives (pure display, no API calls)

| Component | File | Responsibility |
|---|---|---|
| **MediaCard** | `MediaCard.js` (existing, extended) | Card with thumbnail, title, badges. Extended with `showProgressBar` and `subtitle` options. Year badge removed. |
| **MediaRow** | `MediaRow.js` (new) | Horizontal-scrolling carousel of cards. Takes items + config. Handles empty/loading/error states. Reusable anywhere. |

### Data Rows (self-contained: fetch their own data, render via MediaRow)

| Component | File | API Endpoint |
|---|---|---|
| **ContinueWatchingRow** | `ContinueWatchingRow.js` | `GET /Users/{userId}/Items/Resume` |
| **NextUpRow** | `NextUpRow.js` | `GET /Shows/NextUp` |
| **RecentlyAddedRow** | `RecentlyAddedRow.js` | `GET /Users/{userId}/Items/Latest` with `groupItems=true` |

### Page Composer

| Component | File | Responsibility |
|---|---|---|
| **HomeTab** | `HomeTab.js` | Composes the 3 data rows. Thin orchestrator — no API calls, no rendering logic. |

### Dependency Graph

```
HomeTab
  |- ContinueWatchingRow -> MediaRow -> MediaCard (with progress bar)
  |- NextUpRow           -> MediaRow -> MediaCard (with subtitle)
  |- RecentlyAddedRow    -> MediaRow -> MediaCard
```

## MediaRow (Carousel Component)

Reusable horizontal scroll primitive.

### Constructor

```js
new MediaRow({
  container,          // HTMLElement or selector
  title,              // Section heading string
  onItemClick,        // Callback when a card is clicked
  emptyMessage,       // Text when no items (optional — row hides if empty)
  showProgressBar,    // Boolean — enables progress overlay on cards
})
```

### Methods

- `setItems(items, serverUrl, accessToken)` — render cards into the row
- `setLoading(bool)` — show/hide spinner
- `setError(message, onRetry)` — show error with retry button
- `clear()` / `destroy()` — cleanup

### DOM Structure

```html
<div class="media-row">
  <div class="media-row__header">
    <h3 class="media-row__title">Continue Watching</h3>
  </div>
  <div class="media-row__scroll-container">
    <!-- MediaCard instances, fixed width ~140px, horizontal scroll -->
  </div>
</div>
```

### Scrolling Behavior

- `overflow-x: auto` with `scroll-snap-type: x mandatory` for smooth snap-to-card
- Hidden scrollbar for clean look
- Cards have fixed width (not grid-based) so they scroll horizontally

## MediaCard Extensions

### Progress Bar (opt-in)

New option `showProgressBar: true`. When enabled and `item.UserData?.PlayedPercentage > 0`, renders a thin bar at the bottom of the poster:

```html
<div class="media-card__progress">
  <div class="media-card__progress-bar" style="width: 45%"></div>
</div>
```

- 3px height, `#0066cc` fill color (matches theme)
- No bar shown at 0%

### Subtitle Overlay (opt-in)

New option `subtitle: "The Office - S03E05"`. Renders small text overlay at top-left of poster:

```html
<span class="media-card__subtitle">The Office - S03E05</span>
```

- 9px font, semi-transparent dark background, white text
- Truncates with ellipsis if too long
- `max-width: 70%` to avoid overlapping other elements

### Year Badge Removal

Year badge removed from MediaCard entirely. Layout:

| Position | Content |
|---|---|
| Top-left | Subtitle (when provided) |
| Bottom-right | Type badge |
| Bottom of poster | Progress bar (when enabled) |

## Data Row Details

### Common Interface

```js
constructor({ containerSelector, getBrowser })
onActivate()   // fetch data if not loaded
refresh()      // force reload
reset()        // clear state
```

### ContinueWatchingRow

- **API:** `GET /Users/{userId}/Items/Resume?limit=20&fields=UserData,ImageTags,ProductionYear&mediaTypes=Video`
- Passes `showProgressBar: true` to its MediaRow
- Movies play directly, episodes play directly
- Empty state: row hidden entirely

### NextUpRow

- **API:** `GET /Shows/NextUp?userId={userId}&limit=20&fields=UserData,ImageTags,ProductionYear`
- Passes subtitle formatted as `"Series Name - S01E03"` to each card
- Plays episode directly on click
- Empty state: row hidden

### RecentlyAddedRow

- **API:** `GET /Users/{userId}/Items/Latest?limit=20&fields=ImageTags,ProductionYear&groupItems=true&includeItemTypes=Movie,Series,Episode`
- `groupItems=true` collapses multiple episodes from same season into one item
- Grouped series items trigger episode selection, movies play directly
- Empty state: row hidden

## HTML & Tab Wiring

### index.html Changes

Add Home tab button (first, active by default) and content area:

```html
<div class="tab-nav">
  <button class="tab-button active" data-tab="home">Home</button>
  <button class="tab-button" data-tab="tvshows">TV Shows</button>
  <button class="tab-button" data-tab="movies">Movies</button>
  <button class="tab-button" data-tab="recent">Recent</button>
  <button class="tab-button" data-tab="search">Search</button>
</div>

<div id="homeTab" class="tab-content active">
  <div id="continueWatchingRow"></div>
  <div id="nextUpRow"></div>
  <div id="recentlyAddedRow"></div>
</div>
```

### browser.js Changes

- Wire HomeTab in `initLibraryTabs()`
- `onAuthSuccess` activates `home` tab instead of `recent`
- Default active tab: `home`

### Script Tags

Add to index.html:

```html
<link rel="stylesheet" href="components/components.css" />
<script src="components/MediaRow.js"></script>
<script src="components/ContinueWatchingRow.js"></script>
<script src="components/NextUpRow.js"></script>
<script src="components/RecentlyAddedRow.js"></script>
<script src="components/HomeTab.js"></script>
```

## CSS

All new styles in `components/components.css` (new file). `browser.css` stays untouched.

Covers: MediaRow layout, scroll container, fixed-width cards in rows, progress bar, subtitle overlay, loading/error/empty states for rows.

## File Changes Summary

### New Files (6)

| File | Type | Purpose |
|---|---|---|
| `components/MediaRow.js` | UI primitive | Reusable horizontal carousel |
| `components/ContinueWatchingRow.js` | Data row | Resume items with progress bars |
| `components/NextUpRow.js` | Data row | Next episodes with subtitles |
| `components/RecentlyAddedRow.js` | Data row | Latest items, grouped |
| `components/HomeTab.js` | Page composer | Composes 3 data rows |
| `components/components.css` | Styles | All new component styles |

### Modified Files (3)

| File | Changes |
|---|---|
| `components/MediaCard.js` | Add `showProgressBar` + `subtitle`, remove year badge |
| `browser/index.html` | Add Home tab (default), script tags, CSS link |
| `browser/browser.js` | Wire HomeTab, set Home as default active tab |

## Design Principles

- Every row is self-contained and pluggable anywhere
- MediaRow is a pure UI component with no API knowledge
- Data rows own their API calls and pass items to MediaRow
- HomeTab is a thin orchestrator with no logic
- Opt-in extensions to MediaCard — no breaking changes for existing callers
- Empty rows hide entirely (Plex behavior)
