# Plex-Style Home Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Plex-style home screen with horizontal-scrolling rows for Continue Watching, Next Up, and Recently Added.

**Architecture:** New `HomeTab` page composer that renders 3 self-contained data rows (`ContinueWatchingRow`, `NextUpRow`, `RecentlyAddedRow`), each using a reusable `MediaRow` carousel component, which renders `MediaCard` instances. Existing `MediaCard` extended with opt-in progress bar and subtitle overlay. Year badge removed.

**Tech Stack:** Vanilla JS (no modules — IINA WebView uses global `window` exports), CSS, Jellyfin REST API

**Testing:** No unit test framework. Verify via `pnpm lint` and `pnpm format` after each task. Manual testing in IINA after full wiring (Task 8).

**Design doc:** `docs/plans/2026-02-15-plex-style-home-screen-design.md`

---

### Task 1: Create components.css

**Files:**
- Create: `src/ui/browser/components/components.css`

**Step 1: Create the CSS file with all new component styles**

```css
/* =================================
   MediaRow (Carousel) Styles
   ================================= */

.media-row {
  margin-bottom: 20px;
}

.media-row--hidden {
  display: none;
}

.media-row__header {
  margin-bottom: 8px;
}

.media-row__title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.media-row__scroll-container {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}

/* Hide scrollbar for clean look */
.media-row__scroll-container::-webkit-scrollbar {
  display: none;
}

/* Fixed-width cards inside rows (overrides grid sizing) */
.media-row .media-card {
  flex: 0 0 140px;
  scroll-snap-align: start;
}

/* Row loading state */
.media-row__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  color: #888;
  gap: 8px;
}

.media-row__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #444;
  border-top-color: #0066cc;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.media-row__loading-text {
  font-size: 12px;
}

/* Row error state */
.media-row__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  text-align: center;
}

.media-row__error-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.media-row__error-message {
  color: #ef4444;
  font-size: 12px;
  margin-bottom: 12px;
}

.media-row__retry-btn {
  font-size: 12px;
}

/* =================================
   MediaCard Progress Bar
   ================================= */

.media-card__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
}

.media-card__progress-bar {
  height: 100%;
  background: #0066cc;
  border-radius: 0 1px 0 0;
}

/* =================================
   MediaCard Subtitle Overlay
   ================================= */

.media-card__subtitle {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 1;
}
```

**Step 2: Lint**

Run: `pnpm check`
Expected: PASS (CSS not linted by ESLint, Prettier will check formatting)

**Step 3: Commit**

```bash
git add src/ui/browser/components/components.css
git commit -m "feat: add component styles for home screen carousel, progress bar, and subtitle"
```

---

### Task 2: Extend MediaCard with progress bar, subtitle, and remove year badge

**Files:**
- Modify: `src/ui/browser/components/MediaCard.js`
- Modify: `src/ui/browser/browser.css` (remove `.media-card__year` styles)

**Step 1: Update MediaCard constructor to accept new options**

In `src/ui/browser/components/MediaCard.js`, replace the constructor (lines 14-21):

```js
  constructor({ item, serverUrl, accessToken, onClick, showProgressBar = false, subtitle = '' }) {
    this.item = item;
    this.serverUrl = serverUrl;
    this.accessToken = accessToken;
    this.onClick = onClick;
    this.showProgressBar = showProgressBar;
    this.subtitle = subtitle;
    this.element = null;
    this.selected = false;
  }
```

**Step 2: Update the render method**

Replace the `render()` method (lines 40-81) with:

```js
  render() {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.itemId = this.item.Id;
    card.dataset.itemType = this.item.Type;

    const thumbnailUrl = this.getThumbnailUrl();
    const title = this.item.Name || 'Unknown Title';
    const type = this.item.Type === 'Series' ? 'TV' : this.item.Type;

    // Build optional subtitle overlay
    const subtitleHtml = this.subtitle
      ? `<span class="media-card__subtitle">${this.escapeHtml(this.subtitle)}</span>`
      : '';

    // Build optional progress bar
    const percentage = this.item.UserData?.PlayedPercentage || 0;
    const progressHtml =
      this.showProgressBar && percentage > 0
        ? `<div class="media-card__progress">
            <div class="media-card__progress-bar" style="width: ${Math.round(percentage)}%"></div>
          </div>`
        : '';

    card.innerHTML = `
      <div class="media-card__poster">
        ${
          thumbnailUrl
            ? `<img
            src="${thumbnailUrl}"
            alt="${this.escapeHtml(title)}"
            class="media-card__image"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          />`
            : ''
        }
        <div class="media-card__placeholder" style="${thumbnailUrl ? 'display: none;' : 'display: flex;'}">
          <span class="media-card__placeholder-icon">${this.item.Type === 'Series' ? '📺' : '🎬'}</span>
        </div>
        ${subtitleHtml}
        <span class="media-card__badge">${type}</span>
        ${progressHtml}
      </div>
      <div class="media-card__title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</div>
    `;

    card.addEventListener('click', () => {
      if (this.onClick) {
        this.onClick(this.item);
      }
    });

    this.element = card;
    return card;
  }
```

Key changes from original:
- Removed `year` variable and `media-card__year` span
- Added `subtitleHtml` — rendered at top-left when `this.subtitle` is set
- Added `progressHtml` — rendered at bottom of poster when `showProgressBar` and percentage > 0

**Step 3: Remove year badge CSS from browser.css**

In `src/ui/browser/browser.css`, delete the `.media-card__year` block (lines 319-330):

```css
/* DELETE THIS BLOCK: */
/* Year badge (top-left) */
.media-card__year {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}
```

Also in the responsive section (lines 374-378), remove the `.media-card__year` reference from the selector:

Change:
```css
  .media-card__year,
  .media-card__badge {
    font-size: 8px;
    padding: 1px 4px;
  }
```

To:
```css
  .media-card__badge {
    font-size: 8px;
    padding: 1px 4px;
  }
```

**Step 4: Lint**

Run: `pnpm check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ui/browser/components/MediaCard.js src/ui/browser/browser.css
git commit -m "feat: extend MediaCard with progress bar and subtitle, remove year badge"
```

---

### Task 3: Create MediaRow component

**Files:**
- Create: `src/ui/browser/components/MediaRow.js`

**Step 1: Create MediaRow**

```js
/**
 * MediaRow Component
 * Reusable horizontal-scrolling carousel of MediaCard components
 */

/* global MediaCard */

class MediaRow {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - Container element or selector
   * @param {string} options.title - Section heading text
   * @param {Function} options.onItemClick - Callback when a card is clicked
   * @param {string} [options.emptyMessage=''] - Message when no items (row hides if empty)
   * @param {boolean} [options.showProgressBar=false] - Enable progress bar on cards
   */
  constructor({ container, title, onItemClick, emptyMessage = '', showProgressBar = false }) {
    this.container =
      typeof container === 'string' ? document.querySelector(container) : container;
    this.title = title;
    this.onItemClick = onItemClick;
    this.emptyMessage = emptyMessage;
    this.showProgressBar = showProgressBar;
    this.cards = [];
    this.rowElement = null;
    this.scrollContainer = null;

    this.init();
  }

  /**
   * Build the row DOM structure
   */
  init() {
    if (!this.container) {
      return;
    }

    this.rowElement = document.createElement('div');
    this.rowElement.className = 'media-row';

    this.rowElement.innerHTML = `
      <div class="media-row__header">
        <h3 class="media-row__title">${this.escapeHtml(this.title)}</h3>
      </div>
    `;

    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'media-row__scroll-container';
    this.rowElement.appendChild(this.scrollContainer);

    this.container.appendChild(this.rowElement);
  }

  /**
   * Set items in the row (replaces existing items)
   * @param {Array} items - Array of Jellyfin media items
   * @param {string} serverUrl - Jellyfin server URL
   * @param {string} accessToken - Jellyfin access token
   * @param {Object} [options] - Per-item options
   * @param {Function} [options.getSubtitle] - Function that takes an item and returns subtitle string
   */
  setItems(items, serverUrl, accessToken, options = {}) {
    this.clearCards();
    this.serverUrl = serverUrl;
    this.accessToken = accessToken;

    if (!items || items.length === 0) {
      this.hide();
      return;
    }

    this.show();

    items.forEach((item) => {
      const subtitle = options.getSubtitle ? options.getSubtitle(item) : '';
      this.addCard(item, subtitle);
    });
  }

  /**
   * Add a single card to the scroll container
   * @param {Object} item - Jellyfin media item
   * @param {string} [subtitle=''] - Subtitle overlay text
   */
  addCard(item, subtitle = '') {
    const card = new MediaCard({
      item,
      serverUrl: this.serverUrl,
      accessToken: this.accessToken,
      onClick: this.onItemClick,
      showProgressBar: this.showProgressBar,
      subtitle,
    });

    const element = card.render();
    this.scrollContainer.appendChild(element);
    this.cards.push(card);
  }

  /**
   * Show loading state
   * @param {boolean} loading - Whether to show loading spinner
   */
  setLoading(loading) {
    if (!this.scrollContainer) {
      return;
    }

    if (loading) {
      this.clearCards();
      this.show();
      this.scrollContainer.innerHTML = `
        <div class="media-row__loading">
          <div class="media-row__spinner"></div>
          <div class="media-row__loading-text">Loading...</div>
        </div>
      `;
    }
  }

  /**
   * Show error state with retry button
   * @param {string} message - Error message
   * @param {Function} onRetry - Retry callback
   */
  setError(message, onRetry) {
    if (!this.scrollContainer) {
      return;
    }

    this.clearCards();
    this.show();

    const errorEl = document.createElement('div');
    errorEl.className = 'media-row__error';
    errorEl.innerHTML = `
      <div class="media-row__error-icon">⚠️</div>
      <div class="media-row__error-message">${this.escapeHtml(message)}</div>
      <button class="media-row__retry-btn button">Retry</button>
    `;

    const retryBtn = errorEl.querySelector('.media-row__retry-btn');
    if (retryBtn && onRetry) {
      retryBtn.addEventListener('click', onRetry);
    }

    this.scrollContainer.appendChild(errorEl);
  }

  /**
   * Show the row
   */
  show() {
    if (this.rowElement) {
      this.rowElement.classList.remove('media-row--hidden');
    }
  }

  /**
   * Hide the row
   */
  hide() {
    if (this.rowElement) {
      this.rowElement.classList.add('media-row--hidden');
    }
  }

  /**
   * Clear all cards from the scroll container
   */
  clearCards() {
    this.cards.forEach((card) => card.destroy());
    this.cards = [];

    if (this.scrollContainer) {
      this.scrollContainer.innerHTML = '';
    }
  }

  /**
   * Clear the row and remove from DOM
   */
  clear() {
    this.clearCards();
  }

  /**
   * Destroy the row entirely
   */
  destroy() {
    this.clearCards();
    if (this.rowElement) {
      this.rowElement.remove();
      this.rowElement = null;
      this.scrollContainer = null;
    }
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.MediaRow = MediaRow;
```

**Step 2: Lint**

Run: `pnpm check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/browser/components/MediaRow.js
git commit -m "feat: add MediaRow carousel component"
```

---

### Task 4: Create ContinueWatchingRow

**Files:**
- Create: `src/ui/browser/components/ContinueWatchingRow.js`

**Step 1: Create ContinueWatchingRow**

```js
/**
 * ContinueWatchingRow Component
 * Self-contained data row that fetches resume items and renders via MediaRow
 */

/* global MediaRow, debugLog */

class ContinueWatchingRow {
  /**
   * @param {Object} options
   * @param {string} options.containerSelector - CSS selector for the row container
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ containerSelector, getBrowser }) {
    this.containerSelector = containerSelector;
    this.getBrowser = getBrowser;

    this.row = null;
    this.loaded = false;
    this.loading = false;
    this.limit = 20;
  }

  /**
   * Called when the parent tab becomes active
   */
  onActivate() {
    if (!this.loaded && !this.loading) {
      this.loadItems();
    }
  }

  /**
   * Initialize the MediaRow component
   */
  initRow() {
    const container = document.querySelector(this.containerSelector);
    if (!container) {
      console.error(
        `ContinueWatchingRow: Container not found: ${this.containerSelector}`
      );
      return;
    }

    const browser = this.getBrowser();

    this.row = new MediaRow({
      container,
      title: 'Continue Watching',
      onItemClick: (item) => {
        if (browser && browser.selectMediaItem) {
          browser.selectMediaItem(item);
        }
      },
      showProgressBar: true,
    });
  }

  /**
   * Fetch and display resume items
   */
  async loadItems() {
    const browser = this.getBrowser();

    if (!browser || !browser.currentServer || !browser.currentUser) {
      debugLog('ContinueWatchingRow: Missing server or user, skipping loadItems');
      return;
    }

    this.loading = true;

    if (!this.row) {
      this.initRow();
    }

    if (!this.row) {
      this.loading = false;
      return;
    }

    this.row.setLoading(true);

    try {
      const response = await this.fetchItems(browser);

      if (response.data && response.data.Items && response.data.Items.length > 0) {
        this.row.setItems(
          response.data.Items,
          browser.currentServer.url,
          browser.currentServer.accessToken
        );
        this.loaded = true;
      } else {
        this.row.hide();
        this.loaded = true;
      }
    } catch (error) {
      console.error('ContinueWatchingRow: Error loading items:', error);
      this.row.setError('Failed to load continue watching', () => this.loadItems());
    } finally {
      this.loading = false;
    }
  }

  /**
   * Fetch resume items from Jellyfin API
   * @param {Object} browser - JellyfinBrowser instance
   * @returns {Promise<Object>} API response
   */
  async fetchItems(browser) {
    const params = new URLSearchParams({
      userId: browser.currentUser.Id,
      limit: this.limit.toString(),
      fields: 'UserData,ImageTags,ProductionYear',
      mediaTypes: 'Video',
    });

    const fullUrl = `${browser.currentServer.url}/Users/${browser.currentUser.Id}/Items/Resume?${params.toString()}`;

    return browser.getHttpClient().get(fullUrl, {
      headers: {
        'X-Emby-Token': browser.currentServer.accessToken,
      },
    });
  }

  /**
   * Force reload
   */
  refresh() {
    this.loaded = false;
    this.loadItems();
  }

  /**
   * Reset state
   */
  reset() {
    this.loaded = false;
    this.loading = false;

    if (this.row) {
      this.row.clear();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.ContinueWatchingRow = ContinueWatchingRow;
```

**Step 2: Lint**

Run: `pnpm check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/browser/components/ContinueWatchingRow.js
git commit -m "feat: add ContinueWatchingRow data component"
```

---

### Task 5: Create NextUpRow

**Files:**
- Create: `src/ui/browser/components/NextUpRow.js`

**Step 1: Create NextUpRow**

```js
/**
 * NextUpRow Component
 * Self-contained data row that fetches next-up episodes and renders via MediaRow
 */

/* global MediaRow, debugLog */

class NextUpRow {
  /**
   * @param {Object} options
   * @param {string} options.containerSelector - CSS selector for the row container
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ containerSelector, getBrowser }) {
    this.containerSelector = containerSelector;
    this.getBrowser = getBrowser;

    this.row = null;
    this.loaded = false;
    this.loading = false;
    this.limit = 20;
  }

  /**
   * Called when the parent tab becomes active
   */
  onActivate() {
    if (!this.loaded && !this.loading) {
      this.loadItems();
    }
  }

  /**
   * Initialize the MediaRow component
   */
  initRow() {
    const container = document.querySelector(this.containerSelector);
    if (!container) {
      console.error(`NextUpRow: Container not found: ${this.containerSelector}`);
      return;
    }

    const browser = this.getBrowser();

    this.row = new MediaRow({
      container,
      title: 'Next Up',
      onItemClick: (item) => {
        if (browser && browser.selectMediaItem) {
          browser.selectMediaItem(item);
        }
      },
    });
  }

  /**
   * Fetch and display next-up episodes
   */
  async loadItems() {
    const browser = this.getBrowser();

    if (!browser || !browser.currentServer || !browser.currentUser) {
      debugLog('NextUpRow: Missing server or user, skipping loadItems');
      return;
    }

    this.loading = true;

    if (!this.row) {
      this.initRow();
    }

    if (!this.row) {
      this.loading = false;
      return;
    }

    this.row.setLoading(true);

    try {
      const response = await this.fetchItems(browser);

      if (response.data && response.data.Items && response.data.Items.length > 0) {
        this.row.setItems(
          response.data.Items,
          browser.currentServer.url,
          browser.currentServer.accessToken,
          { getSubtitle: this.formatSubtitle }
        );
        this.loaded = true;
      } else {
        this.row.hide();
        this.loaded = true;
      }
    } catch (error) {
      console.error('NextUpRow: Error loading items:', error);
      this.row.setError('Failed to load next up', () => this.loadItems());
    } finally {
      this.loading = false;
    }
  }

  /**
   * Format subtitle for a next-up episode
   * @param {Object} item - Jellyfin episode item
   * @returns {string} Formatted subtitle (e.g. "The Office - S03E05")
   */
  formatSubtitle(item) {
    const seriesName = item.SeriesName || '';
    const season = item.ParentIndexNumber;
    const episode = item.IndexNumber;

    if (!seriesName) {
      return '';
    }

    if (season !== undefined && episode !== undefined) {
      const s = String(season).padStart(2, '0');
      const e = String(episode).padStart(2, '0');
      return `${seriesName} - S${s}E${e}`;
    }

    return seriesName;
  }

  /**
   * Fetch next-up episodes from Jellyfin API
   * @param {Object} browser - JellyfinBrowser instance
   * @returns {Promise<Object>} API response
   */
  async fetchItems(browser) {
    const params = new URLSearchParams({
      userId: browser.currentUser.Id,
      limit: this.limit.toString(),
      fields: 'UserData,ImageTags,ProductionYear',
    });

    const fullUrl = `${browser.currentServer.url}/Shows/NextUp?${params.toString()}`;

    return browser.getHttpClient().get(fullUrl, {
      headers: {
        'X-Emby-Token': browser.currentServer.accessToken,
      },
    });
  }

  /**
   * Force reload
   */
  refresh() {
    this.loaded = false;
    this.loadItems();
  }

  /**
   * Reset state
   */
  reset() {
    this.loaded = false;
    this.loading = false;

    if (this.row) {
      this.row.clear();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.NextUpRow = NextUpRow;
```

**Step 2: Lint**

Run: `pnpm check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/browser/components/NextUpRow.js
git commit -m "feat: add NextUpRow data component"
```

---

### Task 6: Create RecentlyAddedRow

**Files:**
- Create: `src/ui/browser/components/RecentlyAddedRow.js`

**Step 1: Create RecentlyAddedRow**

```js
/**
 * RecentlyAddedRow Component
 * Self-contained data row that fetches recently added items (grouped) and renders via MediaRow
 */

/* global MediaRow, debugLog */

class RecentlyAddedRow {
  /**
   * @param {Object} options
   * @param {string} options.containerSelector - CSS selector for the row container
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ containerSelector, getBrowser }) {
    this.containerSelector = containerSelector;
    this.getBrowser = getBrowser;

    this.row = null;
    this.loaded = false;
    this.loading = false;
    this.limit = 20;
  }

  /**
   * Called when the parent tab becomes active
   */
  onActivate() {
    if (!this.loaded && !this.loading) {
      this.loadItems();
    }
  }

  /**
   * Initialize the MediaRow component
   */
  initRow() {
    const container = document.querySelector(this.containerSelector);
    if (!container) {
      console.error(
        `RecentlyAddedRow: Container not found: ${this.containerSelector}`
      );
      return;
    }

    const browser = this.getBrowser();

    this.row = new MediaRow({
      container,
      title: 'Recently Added',
      onItemClick: (item) => {
        if (browser && browser.selectMediaItem) {
          browser.selectMediaItem(item);
        }
      },
    });
  }

  /**
   * Fetch and display recently added items
   */
  async loadItems() {
    const browser = this.getBrowser();

    if (!browser || !browser.currentServer || !browser.currentUser) {
      debugLog('RecentlyAddedRow: Missing server or user, skipping loadItems');
      return;
    }

    this.loading = true;

    if (!this.row) {
      this.initRow();
    }

    if (!this.row) {
      this.loading = false;
      return;
    }

    this.row.setLoading(true);

    try {
      const response = await this.fetchItems(browser);

      // /Items/Latest returns a flat array (not wrapped in { Items: [] })
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        this.row.setItems(
          response.data,
          browser.currentServer.url,
          browser.currentServer.accessToken
        );
        this.loaded = true;
      } else {
        this.row.hide();
        this.loaded = true;
      }
    } catch (error) {
      console.error('RecentlyAddedRow: Error loading items:', error);
      this.row.setError('Failed to load recently added', () => this.loadItems());
    } finally {
      this.loading = false;
    }
  }

  /**
   * Fetch recently added items from Jellyfin API
   * Uses groupItems=true to collapse multiple episodes from the same season
   * @param {Object} browser - JellyfinBrowser instance
   * @returns {Promise<Object>} API response
   */
  async fetchItems(browser) {
    const params = new URLSearchParams({
      userId: browser.currentUser.Id,
      limit: this.limit.toString(),
      fields: 'ImageTags,ProductionYear',
      groupItems: 'true',
      includeItemTypes: 'Movie,Series,Episode',
    });

    const fullUrl = `${browser.currentServer.url}/Items/Latest?${params.toString()}`;

    return browser.getHttpClient().get(fullUrl, {
      headers: {
        'X-Emby-Token': browser.currentServer.accessToken,
      },
    });
  }

  /**
   * Force reload
   */
  refresh() {
    this.loaded = false;
    this.loadItems();
  }

  /**
   * Reset state
   */
  reset() {
    this.loaded = false;
    this.loading = false;

    if (this.row) {
      this.row.clear();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.RecentlyAddedRow = RecentlyAddedRow;
```

**Step 2: Lint**

Run: `pnpm check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/browser/components/RecentlyAddedRow.js
git commit -m "feat: add RecentlyAddedRow data component"
```

---

### Task 7: Create HomeTab

**Files:**
- Create: `src/ui/browser/components/HomeTab.js`

**Step 1: Create HomeTab page composer**

```js
/**
 * HomeTab Component
 * Thin orchestrator that composes ContinueWatchingRow, NextUpRow, and RecentlyAddedRow
 */

/* global ContinueWatchingRow, NextUpRow, RecentlyAddedRow, debugLog */

class HomeTab {
  /**
   * @param {Object} options
   * @param {string} options.containerSelector - CSS selector for the home tab container
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ containerSelector, getBrowser }) {
    this.containerSelector = containerSelector;
    this.getBrowser = getBrowser;

    this.rows = null;
    this.loaded = false;
  }

  /**
   * Called when the tab becomes active
   */
  onActivate() {
    if (!this.rows) {
      this.initRows();
    }

    if (this.rows) {
      this.rows.continueWatching.onActivate();
      this.rows.nextUp.onActivate();
      this.rows.recentlyAdded.onActivate();
    }
  }

  /**
   * Initialize the data row components
   */
  initRows() {
    this.rows = {
      continueWatching: new ContinueWatchingRow({
        containerSelector: `${this.containerSelector} #continueWatchingRow`,
        getBrowser: this.getBrowser,
      }),
      nextUp: new NextUpRow({
        containerSelector: `${this.containerSelector} #nextUpRow`,
        getBrowser: this.getBrowser,
      }),
      recentlyAdded: new RecentlyAddedRow({
        containerSelector: `${this.containerSelector} #recentlyAddedRow`,
        getBrowser: this.getBrowser,
      }),
    };

    debugLog('HomeTab: Initialized all rows');
  }

  /**
   * Force reload all rows
   */
  refresh() {
    if (this.rows) {
      this.rows.continueWatching.refresh();
      this.rows.nextUp.refresh();
      this.rows.recentlyAdded.refresh();
    }
  }

  /**
   * Reset all rows
   */
  reset() {
    this.loaded = false;

    if (this.rows) {
      this.rows.continueWatching.reset();
      this.rows.nextUp.reset();
      this.rows.recentlyAdded.reset();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.HomeTab = HomeTab;
```

**Step 2: Lint**

Run: `pnpm check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/browser/components/HomeTab.js
git commit -m "feat: add HomeTab page composer component"
```

---

### Task 8: Wire everything into index.html and browser.js

**Files:**
- Modify: `src/ui/browser/index.html`
- Modify: `src/ui/browser/browser.js`

**Step 1: Update index.html — add CSS link**

After line 8 (`<link rel="stylesheet" href="browser.css" />`), add:

```html
    <link rel="stylesheet" href="components/components.css" />
```

**Step 2: Update index.html — add Home tab button and make it default**

Replace the tab-nav div (lines 393-398):

```html
        <div class="tab-nav">
          <button class="tab-button active" data-tab="home">Home</button>
          <button class="tab-button" data-tab="tvshows">TV Shows</button>
          <button class="tab-button" data-tab="movies">Movies</button>
          <button class="tab-button" data-tab="recent">Recent</button>
          <button class="tab-button" data-tab="search">Search</button>
        </div>
```

Changes: added Home button (first, `active`), removed `active` from Recent button.

**Step 3: Update index.html — add Home tab content**

Add this right after the tab-nav closing `</div>` and before the Recent Items Tab comment (before line 400):

```html
        <!-- Home Tab -->
        <div id="homeTab" class="tab-content active">
          <div id="continueWatchingRow"></div>
          <div id="nextUpRow"></div>
          <div id="recentlyAddedRow"></div>
        </div>
```

Also change the Recent Items Tab from `active` to not-active. On line 401:

Change:
```html
        <div id="recentTab" class="tab-content active">
```

To:
```html
        <div id="recentTab" class="tab-content">
```

**Step 4: Update index.html — add script tags**

Before the `<script src="browser.js"></script>` line (line 478), add:

```html
    <script src="components/MediaRow.js"></script>
    <script src="components/ContinueWatchingRow.js"></script>
    <script src="components/NextUpRow.js"></script>
    <script src="components/RecentlyAddedRow.js"></script>
    <script src="components/HomeTab.js"></script>
```

Order matters: MediaRow must load before the data rows, and all rows must load before HomeTab. HomeTab must load before browser.js.

**Step 5: Update browser.js — add HomeTab to initLibraryTabs()**

In `src/ui/browser/browser.js`, modify `initLibraryTabs()` (around line 136). Add `home` entry:

```js
  initLibraryTabs() {
    this.libraryTabs = {
      home: new HomeTab({
        containerSelector: '#homeTab',
        getBrowser: () => this,
      }),
      recent: new RecentTab({
        containerSelector: '#recentList',
        getBrowser: () => this,
      }),
      movies: new LibraryTab({
        tabId: 'movies',
        containerSelector: '#moviesGrid',
        itemType: 'Movie',
        getBrowser: () => this,
      }),
      tvshows: new LibraryTab({
        tabId: 'tvshows',
        containerSelector: '#tvshowsGrid',
        itemType: 'Series',
        getBrowser: () => this,
      }),
    };
  }
```

**Step 6: Update browser.js — activate home tab on auth success**

In the `onAuthSuccess` callback (around line 119-126), change from activating `recent` to `home`:

Change:
```js
      onAuthSuccess: ({ currentServer, currentUser }) => {
        this.currentServer = currentServer;
        this.currentUser = currentUser;
        this.showMainContent();
        if (this.libraryTabs && this.libraryTabs.recent) {
          this.libraryTabs.recent.onActivate();
        }
      },
```

To:
```js
      onAuthSuccess: ({ currentServer, currentUser }) => {
        this.currentServer = currentServer;
        this.currentUser = currentUser;
        this.showMainContent();
        if (this.libraryTabs && this.libraryTabs.home) {
          this.libraryTabs.home.onActivate();
        }
      },
```

**Step 7: Lint**

Run: `pnpm check`
Expected: PASS

**Step 8: Commit**

```bash
git add src/ui/browser/index.html src/ui/browser/browser.js
git commit -m "feat: wire home screen tab with carousel rows into browser"
```

---

### Task 9: Final lint check and manual verification

**Step 1: Run full lint + format check**

Run: `pnpm check`
Expected: PASS — no ESLint errors, no Prettier issues

**Step 2: If lint fails, fix issues**

Run: `pnpm lint:fix && pnpm format:fix`
Then: `pnpm check` again to confirm

**Step 3: Manual verification checklist (in IINA)**

Link the plugin:
```bash
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
```

Verify:
- [ ] Browser window opens with Home tab active by default
- [ ] Continue Watching row shows in-progress items with progress bars (or hides if none)
- [ ] Next Up row shows next episodes with series subtitle (or hides if none)
- [ ] Recently Added row shows grouped items (or hides if none)
- [ ] Horizontal scrolling works on all rows via trackpad
- [ ] Clicking a movie plays it directly
- [ ] Clicking a series item opens episode selection
- [ ] Clicking an episode from Next Up / Continue Watching plays directly
- [ ] Movies/TV Shows/Recent/Search tabs still work as before
- [ ] No console errors in IINA developer console

**Step 4: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
