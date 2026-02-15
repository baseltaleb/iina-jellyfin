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
      console.error(`RecentlyAddedRow: Container not found: ${this.containerSelector}`);
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
