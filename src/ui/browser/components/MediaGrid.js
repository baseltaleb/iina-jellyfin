/**
 * MediaGrid Component
 * Grid container managing a collection of MediaCard components
 */

/* global MediaCard, IntersectionObserver */

class MediaGrid {
  /**
   * @param {Object} options
   * @param {HTMLElement|string} options.container - Container element or selector
   * @param {Function} options.onItemClick - Callback when an item is clicked
   * @param {string} [options.emptyMessage='No items found'] - Message to show when grid is empty
   * @param {Function} [options.onLoadMore] - Callback to load more items (for infinite scroll)
   */
  constructor({ container, onItemClick, emptyMessage = 'No items found', onLoadMore }) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.onItemClick = onItemClick;
    this.emptyMessage = emptyMessage;
    this.onLoadMore = onLoadMore;
    this.cards = [];
    this.intersectionObserver = null;
    this.loadingMore = false;

    this.init();
  }

  /**
   * Initialize the grid
   */
  init() {
    if (this.container) {
      this.container.classList.add('media-grid');
    }
  }

  /**
   * Set items in the grid (replaces existing items)
   * @param {Array} items - Array of Jellyfin media items
   * @param {string} serverUrl - Jellyfin server URL
   * @param {string} accessToken - Jellyfin access token
   */
  setItems(items, serverUrl, accessToken) {
    this.clear();

    if (!items || items.length === 0) {
      this.showEmpty();
      return;
    }

    this.serverUrl = serverUrl;
    this.accessToken = accessToken;

    items.forEach((item) => {
      this.addCard(item);
    });

    this.setupInfiniteScroll();
  }

  /**
   * Append items to the grid (for pagination)
   * @param {Array} items - Array of Jellyfin media items
   * @param {string} serverUrl - Jellyfin server URL
   * @param {string} accessToken - Jellyfin access token
   */
  appendItems(items, serverUrl, accessToken) {
    if (!items || items.length === 0) {
      return;
    }

    this.serverUrl = serverUrl;
    this.accessToken = accessToken;

    // Remove loading indicator if present
    this.hideLoadingMore();

    items.forEach((item) => {
      this.addCard(item);
    });

    // Re-setup infinite scroll for newly added content
    this.setupInfiniteScroll();
  }

  /**
   * Add a single card to the grid
   * @param {Object} item - Jellyfin media item
   */
  addCard(item) {
    const card = new MediaCard({
      item,
      serverUrl: this.serverUrl,
      accessToken: this.accessToken,
      onClick: this.onItemClick,
    });

    const element = card.render();
    this.container.appendChild(element);
    this.cards.push(card);
  }

  /**
   * Set loading state
   * @param {boolean} loading - Whether to show loading state
   */
  setLoading(loading) {
    if (loading) {
      this.clear();
      this.container.innerHTML = `
        <div class="media-grid__loading">
          <div class="media-grid__spinner"></div>
          <div class="media-grid__loading-text">Loading...</div>
        </div>
      `;
    }
  }

  /**
   * Set error state
   * @param {string} message - Error message to display
   * @param {Function} onRetry - Callback for retry button
   */
  setError(message, onRetry) {
    this.clear();
    const errorContainer = document.createElement('div');
    errorContainer.className = 'media-grid__error';
    errorContainer.innerHTML = `
      <div class="media-grid__error-icon">⚠️</div>
      <div class="media-grid__error-message">${this.escapeHtml(message)}</div>
      <button class="media-grid__retry-btn button">Retry</button>
    `;

    const retryBtn = errorContainer.querySelector('.media-grid__retry-btn');
    if (retryBtn && onRetry) {
      retryBtn.addEventListener('click', onRetry);
    }

    this.container.appendChild(errorContainer);
  }

  /**
   * Show empty state
   */
  showEmpty() {
    this.container.innerHTML = `
      <div class="media-grid__empty">
        <div class="media-grid__empty-icon">📂</div>
        <div class="media-grid__empty-message">${this.escapeHtml(this.emptyMessage)}</div>
      </div>
    `;
  }

  /**
   * Show loading more indicator at the bottom
   */
  showLoadingMore() {
    if (this.container.querySelector('.media-grid__load-more')) {
      return;
    }

    const loadingEl = document.createElement('div');
    loadingEl.className = 'media-grid__load-more';
    loadingEl.innerHTML = `
      <div class="media-grid__spinner media-grid__spinner--small"></div>
      <span>Loading more...</span>
    `;
    this.container.appendChild(loadingEl);
  }

  /**
   * Hide loading more indicator
   */
  hideLoadingMore() {
    const loadingEl = this.container.querySelector('.media-grid__load-more');
    if (loadingEl) {
      loadingEl.remove();
    }
    this.loadingMore = false;
  }

  /**
   * Setup infinite scroll using IntersectionObserver
   */
  setupInfiniteScroll() {
    if (!this.onLoadMore) {
      return;
    }

    // Cleanup existing observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    // Create sentinel element if it doesn't exist
    let sentinel = this.container.querySelector('.media-grid__sentinel');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.className = 'media-grid__sentinel';
      this.container.appendChild(sentinel);
    } else {
      // Move sentinel to end
      this.container.appendChild(sentinel);
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.loadingMore) {
            this.loadingMore = true;
            this.showLoadingMore();
            this.onLoadMore();
          }
        });
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0,
      }
    );

    this.intersectionObserver.observe(sentinel);
  }

  /**
   * Disable infinite scroll (when all items have been loaded)
   */
  disableInfiniteScroll() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    const sentinel = this.container.querySelector('.media-grid__sentinel');
    if (sentinel) {
      sentinel.remove();
    }

    this.hideLoadingMore();
  }

  /**
   * Clear the grid
   */
  clear() {
    this.cards.forEach((card) => card.destroy());
    this.cards = [];

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    if (this.container) {
      this.container.innerHTML = '';
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

  /**
   * Cleanup the grid
   */
  destroy() {
    this.clear();
    if (this.container) {
      this.container.classList.remove('media-grid');
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.MediaGrid = MediaGrid;
