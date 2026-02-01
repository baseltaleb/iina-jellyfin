/**
 * MediaCard Component
 * Reusable card component for displaying media items with thumbnails
 */

class MediaCard {
  /**
   * @param {Object} options
   * @param {Object} options.item - Jellyfin media item
   * @param {string} options.serverUrl - Jellyfin server URL
   * @param {string} options.accessToken - Jellyfin access token
   * @param {Function} options.onClick - Click handler callback
   */
  constructor({ item, serverUrl, accessToken, onClick }) {
    this.item = item;
    this.serverUrl = serverUrl;
    this.accessToken = accessToken;
    this.onClick = onClick;
    this.element = null;
    this.selected = false;
  }

  /**
   * Get the thumbnail URL for the media item
   * @returns {string|null} Thumbnail URL or null if no image available
   */
  getThumbnailUrl() {
    if (!this.item.ImageTags?.Primary) {
      return null;
    }

    const imageTag = this.item.ImageTags.Primary;
    return `${this.serverUrl}/Items/${this.item.Id}/Images/Primary?maxWidth=200&quality=90&tag=${imageTag}`;
  }

  /**
   * Render the card element
   * @returns {HTMLElement} The card DOM element
   */
  render() {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.itemId = this.item.Id;
    card.dataset.itemType = this.item.Type;

    const thumbnailUrl = this.getThumbnailUrl();
    const title = this.item.Name || 'Unknown Title';
    const year = this.item.ProductionYear || '';
    const type = this.item.Type === 'Series' ? 'TV' : this.item.Type;

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
        ${year ? `<span class="media-card__year">${year}</span>` : ''}
        <span class="media-card__badge">${type}</span>
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
   * Set the selected state of the card
   * @param {boolean} selected - Whether the card is selected
   */
  setSelected(selected) {
    this.selected = selected;
    if (this.element) {
      if (selected) {
        this.element.classList.add('media-card--selected');
      } else {
        this.element.classList.remove('media-card--selected');
      }
    }
  }

  /**
   * Cleanup the card
   */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.MediaCard = MediaCard;
