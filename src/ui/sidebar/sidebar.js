/**
 * Jellyfin Sidebar Interface
 * Handles media browsing, search, and playback
 */

class JellyfinSidebar {
  constructor() {
    debugLog('JellyfinSidebar constructor called');

    this.currentUser = null;
    this.currentServer = null;
    this.selectedItem = null;
    this.selectedSeason = null;
    this.selectedEpisode = null;
    this.searchTimeout = null;

    this.init();
  }

  getHttpClient() {
    // Use browser fetch API since sidebar runs in webview context
    return {
      get: (url, options = {}) => this.fetchHttpRequest('GET', url, options),
      post: (url, options = {}) => this.fetchHttpRequest('POST', url, options),
    };
  }

  async fetchHttpRequest(method, url, options = {}) {
    try {
      const fetchOptions = {
        method,
        headers: options.headers || {},
      };

      if (method === 'POST' && options.data) {
        fetchOptions.body = options.data;
      }

      debugLog(`${method} request to: ${url}`);
      const response = await fetch(url, fetchOptions);

      const responseData = await response.text();
      let parsedData;
      try {
        parsedData = JSON.parse(responseData);
      } catch (parseError) {
        debugLog('Failed to parse JSON response:', parseError);
        parsedData = responseData;
      }

      return {
        data: parsedData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      debugLog('HTTP request failed:', error);
      throw {
        message: error.message,
        status: 0,
        statusText: 'Network Error',
      };
    }
  }

  init() {
    this.setupEventListeners();
    this.setupTabNavigation();
    this.initLibraryTabs();

    this.auth = new Authentication({
      getHttpClient: () => this.getHttpClient(),
      onAuthSuccess: ({ currentServer, currentUser }) => {
        this.currentServer = currentServer;
        this.currentUser = currentUser;
        this.showMainContent();
        if (this.libraryTabs && this.libraryTabs.recent) {
          this.libraryTabs.recent.onActivate();
        }
      },
      onLogout: () => {
        this.currentServer = null;
        this.currentUser = null;
        this.hideMainContent();
      },
    });
    this.auth.init();
  }

  initLibraryTabs() {
    this.libraryTabs = {
      recent: new RecentTab({
        containerSelector: '#recentList',
        getSidebar: () => this,
      }),
      movies: new LibraryTab({
        tabId: 'movies',
        containerSelector: '#moviesGrid',
        itemType: 'Movie',
        getSidebar: () => this,
      }),
      tvshows: new LibraryTab({
        tabId: 'tvshows',
        containerSelector: '#tvshowsGrid',
        itemType: 'Series',
        getSidebar: () => this,
      }),
    };
  }

  setupEventListeners() {
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.debounceSearch(e.target.value);
    });

    // Episode selection
    document.getElementById('seasonSelect').addEventListener('change', (e) => {
      this.loadEpisodes(e.target.value);
    });

    document.getElementById('playEpisodeBtn').addEventListener('click', () => {
      this.playSelectedEpisode();
    });

    document.getElementById('cancelEpisodeBtn').addEventListener('click', () => {
      this.hideEpisodeSelection();
    });
  }

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        // Update active button
        tabButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');

        // Update active content
        tabContents.forEach((content) => content.classList.remove('active'));
        document.getElementById(tabName + 'Tab').classList.add('active');

        // Trigger library tab lifecycle
        if (this.libraryTabs && this.libraryTabs[tabName]) {
          this.libraryTabs[tabName].onActivate();
        }
      });
    });
  }

  // UI Management
  showMainContent() {
    document.getElementById('mainContent').style.display = 'block';
  }

  hideMainContent() {
    document.getElementById('mainContent').style.display = 'none';
    this.hideEpisodeSelection();
  }

  debounceSearch(term) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.search(term);
    }, 500);
  }

  async search(term) {
    if (!this.currentServer || !this.currentUser || !term.trim()) {
      document.getElementById('searchResults').innerHTML =
        '<div class="empty-state">Enter a search term above</div>';
      return;
    }

    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '<div class="loading">Searching...</div>';

    try {
      const params = new URLSearchParams({
        userId: this.currentUser.Id,
        searchTerm: term,
        limit: 20,
        includeItemTypes: 'Movie,Series',
      });

      const fullUrl = `${this.currentServer.url}/Search/Hints?${params.toString()}`;

      const response = await this.getHttpClient().get(fullUrl, {
        headers: {
          'X-Emby-Token': this.currentServer.accessToken,
        },
      });

      if (response.data && response.data.SearchHints) {
        this.renderSearchResults(response.data.SearchHints, searchResults);
      } else {
        searchResults.innerHTML = '<div class="empty-state">No results found</div>';
      }
    } catch (error) {
      debugLog('Search error:', error);
      searchResults.innerHTML = '<div class="error">Search failed</div>';
    }
  }

  renderSearchResults(hints, container) {
    if (!hints || hints.length === 0) {
      container.innerHTML = '<div class="empty-state">No results found</div>';
      return;
    }

    container.innerHTML = '';
    hints.forEach((hint) => {
      const itemEl = this.createSearchItemElement(hint);
      container.appendChild(itemEl);
    });
  }

  createSearchItemElement(hint) {
    const itemEl = document.createElement('div');
    itemEl.className = 'media-item';
    itemEl.dataset.itemId = hint.ItemId;
    itemEl.dataset.itemType = hint.Type;

    const title = hint.Name || 'Unknown Title';
    const year = hint.ProductionYear ? ` (${hint.ProductionYear})` : '';
    const type = hint.Type;

    itemEl.innerHTML = `
            <div class="media-title">${title}${year}</div>
            <div class="media-meta">${type}</div>
        `;

    itemEl.addEventListener('click', () => {
      this.selectSearchItem(hint);
    });

    return itemEl;
  }

  selectMediaItem(item) {
    debugLog('selectMediaItem called with: ' + JSON.stringify(item));
    this.selectedItem = item;

    // Update selection UI
    document.querySelectorAll('.media-item').forEach((el) => el.classList.remove('selected'));
    document.querySelector(`[data-item-id="${item.Id}"]`).classList.add('selected');

    if (item.Type === 'Series') {
      debugLog('Item is a Series, showing episode selection');
      this.showEpisodeSelection(item);
    } else {
      debugLog('Item is not a Series, playing media: ' + item.Type);
      this.playMedia(item);
    }
  }

  async selectSearchItem(hint) {
    // Need to get full item details from search hint
    try {
      const params = new URLSearchParams({
        userId: this.currentUser.Id,
      });

      const response = await this.getHttpClient().get(
        `${this.currentServer.url}/Items/${hint.ItemId}?${params.toString()}`,
        {
          headers: {
            'X-Emby-Token': this.currentServer.accessToken,
          },
        }
      );

      if (response.data) {
        this.selectMediaItem(response.data);
      }
    } catch (error) {
      debugLog('Error getting item details:', error);
      iina.core.osd('Failed to get item details');
    }
  }

  // Episode Selection
  async showEpisodeSelection(series) {
    document.getElementById('episodeSection').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';

    // Load seasons
    try {
      const params = new URLSearchParams({
        userId: this.currentUser.Id,
      });

      const response = await this.getHttpClient().get(
        `${this.currentServer.url}/Shows/${series.Id}/Seasons?${params.toString()}`,
        {
          headers: {
            'X-Emby-Token': this.currentServer.accessToken,
          },
        }
      );

      const seasonSelect = document.getElementById('seasonSelect');
      seasonSelect.innerHTML = '<option value="">Select a season...</option>';

      if (response.data && response.data.Items) {
        response.data.Items.forEach((season) => {
          if (season.IndexNumber !== undefined) {
            const option = document.createElement('option');
            option.value = season.Id;
            option.textContent = `Season ${season.IndexNumber}`;
            seasonSelect.appendChild(option);
          }
        });
      }
    } catch (error) {
      debugLog('Error loading seasons:', error);
      document.getElementById('episodeList').innerHTML =
        '<div class="error">Failed to load seasons</div>';
    }
  }

  async loadEpisodes(seasonId) {
    if (!seasonId) {
      document.getElementById('episodeList').innerHTML =
        '<div class="loading">Select a season</div>';
      return;
    }

    const episodeList = document.getElementById('episodeList');
    episodeList.innerHTML = '<div class="loading">Loading episodes...</div>';

    try {
      const params = new URLSearchParams({
        userId: this.currentUser.Id,
        seasonId: seasonId,
        fields: 'MediaSources,Path,LocationType,IsFolder,CanDownload,UserData,BasicSyncInfo',
      });

      const response = await this.getHttpClient().get(
        `${this.currentServer.url}/Shows/${this.selectedItem.Id}/Episodes?${params.toString()}`,
        {
          headers: {
            'X-Emby-Token': this.currentServer.accessToken,
          },
        }
      );

      if (response.data && response.data.Items) {
        episodeList.innerHTML = '';
        response.data.Items.forEach((episode) => {
          const episodeEl = document.createElement('div');
          const isAvailable = this.isEpisodeAvailable(episode);

          episodeEl.className = `episode-item ${!isAvailable ? 'unavailable' : ''}`;
          episodeEl.dataset.episodeId = episode.Id;
          episodeEl.dataset.available = isAvailable.toString();

          const episodeNum = episode.IndexNumber || '?';
          const title = episode.Name || `Episode ${episodeNum}`;

          // Add availability indicator
          const availabilityIcon = isAvailable
            ? ''
            : ' <span class="unavailable-icon" title="Episode not available on server">⚠️</span>';

          episodeEl.innerHTML = `${episodeNum}. ${title}${availabilityIcon}`;

          if (isAvailable) {
            episodeEl.addEventListener('click', () => {
              document
                .querySelectorAll('.episode-item')
                .forEach((el) => el.classList.remove('selected'));
              episodeEl.classList.add('selected');
              this.selectedEpisode = episode;
              document.getElementById('playEpisodeBtn').disabled = false;
            });
          } else {
            // Add cursor indicator for unavailable episodes
            episodeEl.style.cursor = 'not-allowed';
            episodeEl.title = 'This episode is not available on the server';
          }

          episodeList.appendChild(episodeEl);
        });
      } else {
        episodeList.innerHTML = '<div class="empty-state">No episodes found</div>';
      }
    } catch (error) {
      debugLog('Error loading episodes:', error);
      episodeList.innerHTML = '<div class="error">Failed to load episodes</div>';
    }
  }

  playSelectedEpisode() {
    if (this.selectedEpisode) {
      this.playMedia(this.selectedEpisode);
    }
  }

  hideEpisodeSelection() {
    document.getElementById('episodeSection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    this.selectedEpisode = null;
    this.selectedSeason = null;
    document.getElementById('playEpisodeBtn').disabled = true;
  }

  /**
   * Check if an episode is available on the server
   * @param {Object} episode - The episode object from Jellyfin API
   * @returns {boolean} - True if episode is available, false otherwise
   */
  isEpisodeAvailable(episode) {
    try {
      // Check multiple indicators of availability

      // 1. Check if LocationType exists and is not Virtual
      if (episode.LocationType && episode.LocationType === 'Virtual') {
        debugLog(`Episode ${episode.Name} marked as Virtual (unavailable)`);
        return false;
      }

      // 2. Check if MediaSources exist and have valid data
      if (!episode.MediaSources || episode.MediaSources.length === 0) {
        debugLog(`Episode ${episode.Name} has no MediaSources`);
        return false;
      }

      // 3. Check if any MediaSource has a valid Path
      const hasValidPath = episode.MediaSources.some((source) => {
        return source.Path && source.Path.trim() !== '';
      });

      if (!hasValidPath) {
        debugLog(`Episode ${episode.Name} has no valid media paths`);
        return false;
      }

      // 4. Check if episode has a direct Path property
      if (!episode.Path || episode.Path.trim() === '') {
        debugLog(`Episode ${episode.Name} has no direct path`);
        return false;
      }

      // 5. Additional check: if CanDownload is explicitly false
      if (episode.CanDownload === false) {
        debugLog(`Episode ${episode.Name} marked as not downloadable`);
        return false;
      }

      // 6. Check if it's marked as a folder (shouldn't be for episodes)
      if (episode.IsFolder === true) {
        debugLog(`Episode ${episode.Name} marked as folder`);
        return false;
      }

      debugLog(`Episode ${episode.Name} appears to be available`);
      return true;
    } catch (error) {
      debugLog(`Error checking episode availability for ${episode.Name}: ${error.message}`);
      // If we can't determine availability, assume it's unavailable for safety
      return false;
    }
  }

  // Media Playback
  async playMedia(item) {
    debugLog('playMedia called with item type:', item.Type, 'name:', item.Name, 'id:', item.Id);
    try {
      // Build playback URL - use Download endpoint that works manually
      const streamUrl = `${this.currentServer.url}/Items/${item.Id}/Download?api_key=${this.currentServer.accessToken}`;
      debugLog('Built download URL:', streamUrl);
      debugLog('Item details:', {
        Type: item.Type,
        Name: item.Name,
        Id: item.Id,
        Path: item.Path,
        MediaSources: item.MediaSources,
      });

      if (typeof iina !== 'undefined' && iina.postMessage) {
        debugLog('Sending play-media message to main plugin');
        iina.postMessage('play-media', {
          streamUrl: streamUrl,
          title: item.Name || 'Unknown Title',
        });

        // Hide episode selection if showing
        if (document.getElementById('episodeSection').style.display !== 'none') {
          this.hideEpisodeSelection();
        }
      } else {
        debugLog('iina.postMessage not available, trying global object');
        // Try using global object for communication
        if (typeof window !== 'undefined' && window.jellyfinPlugin) {
          debugLog('Using window.jellyfinPlugin for communication');
          // Try calling a method on the global plugin object
          if (window.jellyfinPlugin.playMedia) {
            window.jellyfinPlugin.playMedia(streamUrl, item.Name || 'Unknown Title');
          } else {
            debugLog('window.jellyfinPlugin.playMedia not available');
          }
        } else {
          debugLog('No communication method available, opening in new window');
          window.open(streamUrl, '_blank');
        }
      }
    } catch (error) {
      debugLog('Error playing media:', error);
    }
  }
}

// Initialize sidebar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  debugLog('DOM loaded, initializing Jellyfin sidebar');
  window.jellyfinSidebar = new JellyfinSidebar();
  debugLog('Jellyfin sidebar initialized');
});

// Expose for main plugin communication
window.JellyfinSidebar = JellyfinSidebar;

// Also try to initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
  debugLog('DOM still loading, waiting for DOMContentLoaded');
} else {
  debugLog('DOM already loaded, initializing immediately');
  window.jellyfinSidebar = new JellyfinSidebar();
}
