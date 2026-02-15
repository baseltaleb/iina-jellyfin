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
