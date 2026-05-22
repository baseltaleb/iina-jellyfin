/**
 * LibraryTab Component
 * Reusable tab controller for Movies and TV Shows tabs
 */

/* global MediaGrid */

class LibraryTab {
  /**
   * @param {Object} options
   * @param {string} options.tabId - Tab identifier (e.g., 'movies', 'tvshows')
   * @param {string} options.containerSelector - CSS selector for the grid container
   * @param {string} options.itemType - Jellyfin item type ('Movie' or 'Series')
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ tabId, containerSelector, itemType, getBrowser }) {
    this.tabId = tabId;
    this.containerSelector = containerSelector;
    this.itemType = itemType;
    this.getBrowser = getBrowser;

    this.grid = null;
    this.loaded = false;
    this.loading = false;
    this.startIndex = 0;
    this.limit = 50;
    this.totalCount = 0;
    this.hasMore = true;
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
      console.error(`LibraryTab: Container not found: ${this.containerSelector}`);
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
      emptyMessage: `No ${this.itemType === 'Movie' ? 'movies' : 'TV shows'} found`,
      onLoadMore: () => this.loadMore(),
    });
  }

  /**
   * Load items from Jellyfin API
   */
  async loadItems() {
    const browser = this.getBrowser();

    if (!browser || !browser.currentServer || !browser.currentUser) {
      return;
    }

    this.loading = true;
    this.startIndex = 0;
    this.hasMore = true;

    // Initialize grid if needed
    if (!this.grid) {
      this.initGrid();
    }

    if (!this.grid) {
      return;
    }

    this.grid.setLoading(true);

    try {
      const response = await this.fetchItems(browser);

      if (response.data && response.data.Items) {
        this.totalCount = response.data.TotalRecordCount || response.data.Items.length;
        this.startIndex = response.data.Items.length;
        this.hasMore = this.startIndex < this.totalCount;

        this.grid.setItems(
          this.filterEmptyShows(response.data.Items),
          browser.currentServer.url,
          browser.currentServer.accessToken
        );

        if (!this.hasMore) {
          this.grid.disableInfiniteScroll();
        }

        this.loaded = true;
      } else {
        this.grid.showEmpty();
      }
    } catch (error) {
      console.error(`LibraryTab: Error loading ${this.itemType}:`, error);
      this.grid.setError(
        `Failed to load ${this.itemType === 'Movie' ? 'movies' : 'TV shows'}`,
        () => this.loadItems()
      );
    } finally {
      this.loading = false;
    }
  }

  /**
   * Load more items (pagination)
   */
  async loadMore() {
    if (!this.hasMore || this.loading) {
      if (this.grid) {
        this.grid.hideLoadingMore();
      }
      return;
    }

    const browser = this.getBrowser();

    if (!browser || !browser.currentServer || !browser.currentUser) {
      if (this.grid) {
        this.grid.hideLoadingMore();
      }
      return;
    }

    this.loading = true;

    try {
      const response = await this.fetchItems(browser, this.startIndex);

      if (response.data && response.data.Items && response.data.Items.length > 0) {
        this.startIndex += response.data.Items.length;
        this.hasMore = this.startIndex < this.totalCount;

        this.grid.appendItems(
          this.filterEmptyShows(response.data.Items),
          browser.currentServer.url,
          browser.currentServer.accessToken
        );

        if (!this.hasMore) {
          this.grid.disableInfiniteScroll();
        }
      } else {
        this.hasMore = false;
        this.grid.disableInfiniteScroll();
      }
    } catch (error) {
      console.error(`LibraryTab: Error loading more ${this.itemType}:`, error);
      this.grid.hideLoadingMore();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Fetch items from Jellyfin API
   * @param {Object} browser - JellyfinBrowser instance
   * @param {number} [startIndex=0] - Starting index for pagination
   * @returns {Promise<Object>} API response
   */
  async fetchItems(browser, startIndex = 0) {
    const params = new URLSearchParams({
      userId: browser.currentUser.Id,
      includeItemTypes: this.itemType,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      fields: 'PrimaryImageAspectRatio,ProductionYear,ImageTags,RecursiveItemCount',
      recursive: 'true',
      limit: this.limit.toString(),
      startIndex: startIndex.toString(),
    });

    const fullUrl = `${browser.currentServer.url}/Users/${browser.currentUser.Id}/Items?${params.toString()}`;

    return browser.getHttpClient().get(fullUrl, {
      headers: {
        'X-Emby-Token': browser.currentServer.accessToken,
      },
    });
  }

  /**
   * Hide TV shows that have no episodes (e.g. series folders whose episodes
   * were deleted on the server but the directory remains). Only applies to
   * Series — movies pass through unchanged. Fails open: a show is hidden only
   * when the server explicitly reports zero episodes via RecursiveItemCount,
   * so older servers that omit the field still display everything.
   * @param {Array<Object>} items - Raw items from the Jellyfin API
   * @returns {Array<Object>} Filtered items
   */
  filterEmptyShows(items) {
    if (this.itemType !== 'Series') {
      return items;
    }
    return items.filter((item) => item.RecursiveItemCount !== 0);
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
    this.startIndex = 0;
    this.hasMore = true;

    if (this.grid) {
      this.grid.clear();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.LibraryTab = LibraryTab;
