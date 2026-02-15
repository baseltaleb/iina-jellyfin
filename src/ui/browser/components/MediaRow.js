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
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
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
