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
   * @param {Function} options.getSidebar - Function that returns the JellyfinSidebar instance
   */
  constructor({ tabId, containerSelector, itemType, getSidebar }) {
    this.tabId = tabId;
    this.containerSelector = containerSelector;
    this.itemType = itemType;
    this.getSidebar = getSidebar;

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

    const sidebar = this.getSidebar();

    this.grid = new MediaGrid({
      container,
      onItemClick: (item) => {
        if (sidebar && sidebar.selectMediaItem) {
          sidebar.selectMediaItem(item);
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
    const sidebar = this.getSidebar();

    if (!sidebar || !sidebar.currentServer || !sidebar.currentUser) {
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
      const response = await this.fetchItems(sidebar);

      if (response.data && response.data.Items) {
        this.totalCount = response.data.TotalRecordCount || response.data.Items.length;
        this.startIndex = response.data.Items.length;
        this.hasMore = this.startIndex < this.totalCount;

        this.grid.setItems(
          response.data.Items,
          sidebar.currentServer.url,
          sidebar.currentServer.accessToken
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

    const sidebar = this.getSidebar();

    if (!sidebar || !sidebar.currentServer || !sidebar.currentUser) {
      if (this.grid) {
        this.grid.hideLoadingMore();
      }
      return;
    }

    this.loading = true;

    try {
      const response = await this.fetchItems(sidebar, this.startIndex);

      if (response.data && response.data.Items && response.data.Items.length > 0) {
        this.startIndex += response.data.Items.length;
        this.hasMore = this.startIndex < this.totalCount;

        this.grid.appendItems(
          response.data.Items,
          sidebar.currentServer.url,
          sidebar.currentServer.accessToken
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
   * @param {Object} sidebar - JellyfinSidebar instance
   * @param {number} [startIndex=0] - Starting index for pagination
   * @returns {Promise<Object>} API response
   */
  async fetchItems(sidebar, startIndex = 0) {
    const params = new URLSearchParams({
      userId: sidebar.currentUser.Id,
      includeItemTypes: this.itemType,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      fields: 'PrimaryImageAspectRatio,ProductionYear,ImageTags',
      recursive: 'true',
      limit: this.limit.toString(),
      startIndex: startIndex.toString(),
    });

    const fullUrl = `${sidebar.currentServer.url}/Users/${sidebar.currentUser.Id}/Items?${params.toString()}`;

    return sidebar.getHttpClient().get(fullUrl, {
      headers: {
        'X-Emby-Token': sidebar.currentServer.accessToken,
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
    this.startIndex = 0;
    this.hasMore = true;

    if (this.grid) {
      this.grid.clear();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.LibraryTab = LibraryTab;
