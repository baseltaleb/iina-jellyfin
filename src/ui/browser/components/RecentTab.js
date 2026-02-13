/**
 * RecentTab Component
 * Tab controller for Recently Added items
 */

/* global MediaGrid, debugLog */

class RecentTab {
  /**
   * @param {Object} options
   * @param {string} options.containerSelector - CSS selector for the grid container
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ containerSelector, getBrowser }) {
    this.containerSelector = containerSelector;
    this.getBrowser = getBrowser;

    this.grid = null;
    this.loaded = false;
    this.loading = false;
    this.limit = 20;
  }

  /**
   * Called when the tab becomes active
   */
  onActivate() {
    if (!this.loaded && !this.loading) {
      this.loadItems();
    }
  }

  /**
   * Initialize the grid component
   */
  initGrid() {
    const container = document.querySelector(this.containerSelector);
    if (!container) {
      console.error(`RecentTab: Container not found: ${this.containerSelector}`);
      return;
    }

    const browser = this.getBrowser();

    this.grid = new MediaGrid({
      container,
      onItemClick: (item) => {
        if (browser && browser.selectMediaItem) {
          browser.selectMediaItem(item);
        }
      },
      emptyMessage: 'No recent items found',
    });
  }

  /**
   * Load recent items from Jellyfin API
   */
  async loadItems() {
    const browser = this.getBrowser();

    if (!browser || !browser.currentServer || !browser.currentUser) {
      debugLog('RecentTab: Missing server or user, skipping loadItems');
      return;
    }

    this.loading = true;

    // Initialize grid if needed
    if (!this.grid) {
      this.initGrid();
    }

    if (!this.grid) {
      this.loading = false;
      return;
    }

    this.grid.setLoading(true);

    try {
      const response = await this.fetchItems(browser);

      if (response.data && Array.isArray(response.data)) {
        this.grid.setItems(
          response.data,
          browser.currentServer.url,
          browser.currentServer.accessToken
        );

        // No pagination for Latest endpoint
        this.grid.disableInfiniteScroll();
        this.loaded = true;
      } else {
        this.grid.showEmpty();
      }
    } catch (error) {
      console.error('RecentTab: Error loading recent items:', error);
      this.grid.setError('Failed to load recent items', () => this.loadItems());
    } finally {
      this.loading = false;
    }
  }

  /**
   * Fetch recent items from Jellyfin API
   * Uses /Items/Latest endpoint which returns a flat array (not paginated)
   * @param {Object} browser - JellyfinBrowser instance
   * @returns {Promise<Object>} API response
   */
  async fetchItems(browser) {
    const params = new URLSearchParams({
      userId: browser.currentUser.Id,
      limit: this.limit.toString(),
      fields:
        'BasicSyncInfo,CanDelete,PrimaryImageAspectRatio,ProductionYear,Status,EndDate,ImageTags',
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
   * Force reload the tab content
   */
  refresh() {
    this.loaded = false;
    this.loadItems();
  }

  /**
   * Reset the tab state
   */
  reset() {
    this.loaded = false;
    this.loading = false;

    if (this.grid) {
      this.grid.clear();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.RecentTab = RecentTab;
