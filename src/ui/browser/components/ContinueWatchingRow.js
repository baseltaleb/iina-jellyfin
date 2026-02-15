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
      console.error(`ContinueWatchingRow: Container not found: ${this.containerSelector}`);
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
