/**
 * IINA Jellyfin Plugin
 */

const {
  core,
  menu,
  event,
  http,
  utils,
  preferences,
  mpv,
  sidebar,
  global,
  standaloneWindow,
  playlist,
} = iina;

const { debugLog } = require('./utils.js');
const { parseJellyfinUrl, isJellyfinUrl, fetchItemMetadata } = require('./jellyfin-api.js');
const {
  storeJellyfinSession,
  clearJellyfinSession,
  getStoredJellyfinSession,
} = require('./session.js');
const { downloadAllSubtitles } = require('./subtitles.js');
const {
  startPlaybackTracking,
  stopPlaybackTracking,
  handlePlaybackPositionChange,
  handleEofReached,
} = require('./playback.js');

// Plugin state
let lastJellyfinUrl = null;
let lastItemId = null;
let lastProcessedEpisodeId = null; // Track last processed episode to prevent duplicates
let lastProcessedSeriesId = null; // Track last series to detect series changes
const addedEpisodeIds = new Set(); // Track episodes already added to playlist

debugLog('Jellyfin Subtitles Plugin loaded');

/**
 * Construct and set the video title from Jellyfin metadata
 */
async function setVideoTitleFromMetadata(serverBase, itemId, apiKey) {
  try {
    if (!preferences.get('set_video_title')) {
      debugLog('Video title setting is disabled in preferences');
      return;
    }

    const metadata = await fetchItemMetadata(serverBase, itemId, apiKey);

    if (!metadata || !metadata.Name) {
      debugLog('No title found in metadata');
      return;
    }

    let title = metadata.Name;

    // For TV episodes, construct a more informative title
    if (metadata.Type === 'Episode') {
      const seriesName = metadata.SeriesName;
      const seasonNumber = metadata.ParentIndexNumber;
      const episodeNumber = metadata.IndexNumber;

      if (seriesName) {
        let episodeTitle = seriesName;

        // Add season and episode numbers if available
        if (seasonNumber !== undefined && episodeNumber !== undefined) {
          episodeTitle += ` S${seasonNumber.toString().padStart(2, '0')}E${episodeNumber.toString().padStart(2, '0')}`;
        }

        // Add episode name
        episodeTitle += ` - ${metadata.Name}`;
        title = episodeTitle;
      }
    }
    // For movies, just use the name (potentially with year)
    else if (metadata.Type === 'Movie') {
      if (metadata.ProductionYear) {
        title = `${metadata.Name} (${metadata.ProductionYear})`;
      }
    }

    debugLog(`Setting video title to: "${title}"`);

    // Try to set the title in IINA
    let titleSet = false;

    // Try mpv property if available
    if (!titleSet && typeof mpv !== 'undefined' && typeof mpv.set === 'function') {
      try {
        mpv.set('force-media-title', title);
        titleSet = true;
        debugLog(`Video title set via mpv property: ${title}`);
      } catch (error) {
        debugLog(`mpv.set('force-media-title') failed: ${error.message}`);
      }
    }

    if (!titleSet) {
      debugLog(`Could not set title via IINA API, title would be: ${title}`);
    }

    if (preferences.get('show_notifications')) {
      core.osd(`Title: ${title}`);
    }
  } catch (error) {
    debugLog(`Error setting video title: ${error.message}`);
  }
}

/**
 * Fetch all episodes for a given series and current season
 * Returns array of episode URLs that can be added to the playlist
 */
async function fetchSeriesEpisodes(serverBase, seriesId, seasonId, apiKey) {
  try {
    debugLog(`Fetching episodes for series: ${seriesId}, season: ${seasonId}`);

    const queryParams = [
      'seasonId=' + encodeURIComponent(seasonId),
      'fields=' + encodeURIComponent('MediaSources,Path,LocationType,IsFolder,CanDownload'),
    ].join('&');

    const response = await http.get(
      `${serverBase}/Shows/${seriesId}/Episodes?${queryParams}&api_key=${apiKey}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.data) {
      throw new Error('No data received from Jellyfin API');
    }

    const episodeData =
      typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

    if (!episodeData.Items) {
      debugLog('No episodes found in response');
      return [];
    }

    // Filter out unavailable episodes (those without MediaSources or with CanDownload=false)
    const episodes = episodeData.Items.filter((ep) => {
      const hasMediaSources = ep.MediaSources && ep.MediaSources.length > 0;
      const canDownload = ep.CanDownload !== false; // Default to true if not explicitly set to false
      return hasMediaSources && canDownload;
    }).map((ep) => ({
      id: ep.Id,
      name: ep.Name,
      indexNumber: Number(ep.IndexNumber) || 0, // Ensure it's a number
      duration: ep.RunTimeTicks,
      playUrl: `${serverBase}/Items/${ep.Id}/Download?api_key=${apiKey}`,
    }));

    // Sort episodes by index number for consistent ordering
    episodes.sort((a, b) => a.indexNumber - b.indexNumber);

    debugLog(
      `Fetched ${episodes.length} episodes from series: ${episodes.map((e) => `E${e.indexNumber}`).join(', ')}`
    );
    return episodes;
  } catch (error) {
    debugLog(`Error fetching series episodes: ${error.message}`);
    return [];
  }
}

/**
 * Get series info from episode metadata
 * Returns the series ID and season ID
 */
async function getSeriesInfoFromEpisode(serverBase, episodeId, apiKey) {
  try {
    debugLog(`Getting series info from episode: ${episodeId}`);

    const metadata = await fetchItemMetadata(serverBase, episodeId, apiKey);

    if (metadata.Type !== 'Episode') {
      debugLog(`Item ${episodeId} is not an episode, it's a ${metadata.Type}`);
      return null;
    }

    const seriesId = metadata.SeriesId;
    const seasonId = metadata.SeasonId;
    const seasonNumber = Number(metadata.ParentIndexNumber) || 1;
    const episodeIndexNumber = Number(metadata.IndexNumber) || 0;

    if (!seriesId || !seasonId) {
      debugLog(`Missing series info - SeriesId: ${seriesId}, SeasonId: ${seasonId}`);
      return null;
    }

    debugLog(
      `Series info: SeriesId=${seriesId}, SeasonId=${seasonId}, SeasonNumber=${seasonNumber}, EpisodeNumber=${episodeIndexNumber}`
    );

    return {
      seriesId,
      seasonId,
      seasonNumber,
      currentEpisodeNumber: episodeIndexNumber,
    };
  } catch (error) {
    debugLog(`Error getting series info from episode: ${error.message}`);
    return null;
  }
}

/**
 * Add episodes to the IINA playlist starting from the next episode
 * This creates a playlist of remaining episodes in the series
 */
async function addEpisodesToPlaylist(
  serverBase,
  seriesId,
  seasonId,
  seasonNumber,
  currentEpisodeNumber,
  apiKey
) {
  try {
    debugLog(`Adding episodes to playlist AFTER episode ${currentEpisodeNumber}`);

    // Ensure currentEpisodeNumber is a number
    const currentEpNum = Number(currentEpisodeNumber);
    debugLog(`Current episode number (type: ${typeof currentEpNum}): ${currentEpNum}`);

    // Fetch all episodes for this season
    const episodes = await fetchSeriesEpisodes(serverBase, seriesId, seasonId, apiKey);

    if (episodes.length === 0) {
      debugLog('No episodes found to add to playlist');
      return 0;
    }

    debugLog(`Total episodes fetched: ${episodes.length}, current episode: ${currentEpNum}`);
    debugLog(`Episode index numbers available: ${episodes.map((e) => e.indexNumber).join(', ')}`);

    // Filter to episodes AFTER the current one (not including current)
    const remainingEpisodes = episodes.filter((ep) => {
      const include = ep.indexNumber > currentEpNum;
      if (ep.indexNumber >= currentEpNum - 1 && ep.indexNumber <= currentEpNum + 1) {
        debugLog(
          `Filtering: E${ep.indexNumber} (${typeof ep.indexNumber}) > ${currentEpNum} (${typeof currentEpNum}) = ${include}`
        );
      }
      return include;
    });

    debugLog(
      `After filtering (indexNumber > ${currentEpisodeNumber}): ${remainingEpisodes.map((e) => `E${e.indexNumber}`).join(', ')}`
    );

    if (remainingEpisodes.length === 0) {
      debugLog('No remaining episodes after the current one');
      return 0;
    }

    // Clear existing playlist items for this series to avoid stale titles
    // This ensures we rebuild the playlist from scratch when moving to a new episode
    try {
      if (playlist && typeof playlist.clear === 'function') {
        debugLog('Clearing existing playlist');
        playlist.clear();
        addedEpisodeIds.clear(); // Clear our tracking too
      }
    } catch (error) {
      debugLog(`Could not clear playlist (API might not support it): ${error.message}`);
      // Continue anyway - we'll just skip already-added items
    }

    debugLog(`Adding ${remainingEpisodes.length} episodes to playlist`);

    let addedCount = 0;
    for (const episode of remainingEpisodes) {
      try {
        // Skip if already added in this session (in case clear didn't work)
        if (addedEpisodeIds.has(episode.id)) {
          debugLog(`Episode ${episode.indexNumber} (${episode.id}) already in playlist, skipping`);
          continue;
        }

        debugLog(`Adding episode ${episode.indexNumber}: ${episode.name} to playlist`);

        // Add to playlist - IINA will display whatever it can extract from the URL
        // Note: IINA's playlist UI has limitations and may only show URLs regardless of title parameter
        try {
          playlist.add(episode.playUrl);
          debugLog(`Added episode: ${episode.playUrl}`);
        } catch (error) {
          debugLog(`Failed to add episode: ${error.message}`);
        }

        // Track this episode as added
        addedEpisodeIds.add(episode.id);
        addedCount++;
      } catch (error) {
        debugLog(`Failed to add episode ${episode.indexNumber} to playlist: ${error.message}`);
      }
    }

    if (addedCount > 0 && preferences.get('show_notifications')) {
      core.osd(`Added ${addedCount} episodes to playlist`);
    }

    return addedCount;
  } catch (error) {
    debugLog(`Error adding episodes to playlist: ${error.message}`);
    return 0;
  }
}

/**
 * Store the current episode info for autoplay handling
 */
function storeCurrentEpisodeInfo(episodeId, seriesInfo) {
  try {
    if (!seriesInfo) {
      debugLog('Series info is null, clearing stored episode info');
      preferences.set('last_episode_id', '');
      preferences.set('last_series_id', '');
      preferences.set('last_season_id', '');
      preferences.set('last_episode_number', 0);
      return;
    }

    debugLog(
      `Storing episode info for autoplay - Episode: ${episodeId}, Series: ${seriesInfo.seriesId}`
    );
    preferences.set('last_episode_id', episodeId);
    preferences.set('last_series_id', seriesInfo.seriesId);
    preferences.set('last_season_id', seriesInfo.seasonId);
    preferences.set('last_episode_number', seriesInfo.currentEpisodeNumber);
    preferences.sync();
  } catch (error) {
    debugLog(`Error storing episode info: ${error.message}`);
  }
}

/**
 * Handle file loaded event
 */
function onFileLoaded(fileUrl) {
  debugLog(`File loaded: ${fileUrl}`);

  // Stop any existing playback tracking from previous file
  stopPlaybackTracking();

  // Always check if it's a Jellyfin URL and store it for manual download
  if (isJellyfinUrl(fileUrl)) {
    const jellyfinInfo = parseJellyfinUrl(fileUrl);
    if (jellyfinInfo) {
      // Store for manual download option
      lastJellyfinUrl = fileUrl;
      lastItemId = jellyfinInfo.itemId;
      debugLog(`Stored Jellyfin media for manual download: ${jellyfinInfo.itemId}`);

      // Store session data for auto-login if enabled
      storeJellyfinSession(jellyfinInfo.serverBase, jellyfinInfo.apiKey);

      // Start playback tracking for progress sync
      if (preferences.get('sync_playback_progress')) {
        debugLog(`Starting playback tracking for: ${jellyfinInfo.itemId}`);
        startPlaybackTracking(jellyfinInfo.serverBase, jellyfinInfo.itemId, jellyfinInfo.apiKey);
      } else {
        debugLog("Playback sync disabled");
      }

      // Set video title from metadata if enabled
      if (preferences.get('set_video_title')) {
        debugLog(`Setting video title from metadata for: ${jellyfinInfo.itemId}`);
        setVideoTitleFromMetadata(
          jellyfinInfo.serverBase,
          jellyfinInfo.itemId,
          jellyfinInfo.apiKey
        );
      }

      // Setup autoplay for TV episodes if enabled
      if (preferences.get('autoplay_next_episode')) {
        debugLog(`Setting up autoplay for episode (itemId): ${jellyfinInfo.itemId}`);
        // Reset lastProcessedEpisodeId to allow processing new episode
        lastProcessedEpisodeId = null;
        setupAutoplayForEpisode(jellyfinInfo.serverBase, jellyfinInfo.itemId, jellyfinInfo.apiKey);
      }

      // Only auto-download if enabled
      if (preferences.get('auto_download_enabled')) {
        debugLog(`Auto-downloading subtitles for: ${jellyfinInfo.itemId}`);
        downloadAllSubtitles(jellyfinInfo.serverBase, jellyfinInfo.itemId, jellyfinInfo.apiKey);
      } else {
        debugLog('Auto download disabled, but Jellyfin URL stored for manual download');
      }
    } else {
      debugLog('Failed to parse Jellyfin URL');
    }
  } else {
    // Clear stored Jellyfin URL when loading non-Jellyfin content
    debugLog('Non-Jellyfin URL loaded, clearing stored Jellyfin data');
    lastJellyfinUrl = null;
    lastItemId = null;
    debugLog('Not a Jellyfin URL, skipping subtitle download');
  }
}

/**
 * Setup autoplay for a TV episode
 * This fetches series info and adds remaining episodes to the playlist
 */
function setupAutoplayForEpisode(serverBase, episodeId, apiKey) {
  // Check if we're already processing this episode (prevents duplicates)
  if (lastProcessedEpisodeId === episodeId) {
    debugLog(`Episode ${episodeId} already being processed, skipping duplicate setup`);
    return;
  }

  // Mark this episode as being processed
  lastProcessedEpisodeId = episodeId;

  // Run async operation without blocking
  (async () => {
    try {
      debugLog(`Setting up autoplay for episode: ${episodeId}`);

      // Get series and season info from episode metadata
      const seriesInfo = await getSeriesInfoFromEpisode(serverBase, episodeId, apiKey);

      if (!seriesInfo) {
        debugLog('Could not get series info, autoplay not available');
        return;
      }

      debugLog(
        `Got series info: series=${seriesInfo.seriesId}, season=${seriesInfo.seasonId}, seasonNum=${seriesInfo.seasonNumber}, currentEp=${seriesInfo.currentEpisodeNumber}`
      );

      // If we switched to a different series, clear the episode tracking
      if (lastProcessedSeriesId !== seriesInfo.seriesId) {
        debugLog(
          `Series changed from ${lastProcessedSeriesId} to ${seriesInfo.seriesId}, clearing episode tracking`
        );
        addedEpisodeIds.clear();
        lastProcessedSeriesId = seriesInfo.seriesId;
      }

      // Store episode info for later reference
      storeCurrentEpisodeInfo(episodeId, seriesInfo);

      // Add remaining episodes to playlist (pass season number for proper formatting)
      const addedCount = await addEpisodesToPlaylist(
        serverBase,
        seriesInfo.seriesId,
        seriesInfo.seasonId,
        seriesInfo.seasonNumber,
        seriesInfo.currentEpisodeNumber,
        apiKey
      );

      debugLog(`Autoplay setup complete, added ${addedCount} episodes to playlist`);
    } catch (error) {
      debugLog(`Error setting up autoplay: ${error.message}`);
    }
  })();
}

/**
 * Manual subtitle download function
 */
function manualDownloadSubtitles() {
  debugLog(`Manual download requested`);
  debugLog(`lastJellyfinUrl = "${lastJellyfinUrl}"`);

  let currentUrl = lastJellyfinUrl;

  // If no stored URL, try to get the current file URL from IINA
  if (!currentUrl) {
    try {
      debugLog(`No stored URL, checking core.status`);
      // Try to get the current file path/URL from IINA core
      const currentFile = core.status.url || core.status.path;
      debugLog(`core.status.url = "${core.status.url}"`);
      debugLog(`core.status.path = "${core.status.path}"`);
      debugLog(`currentFile = "${currentFile}"`);

      if (currentFile && isJellyfinUrl(currentFile)) {
        currentUrl = currentFile;
        debugLog(`Using current file URL: ${currentUrl}`);
      } else {
        debugLog(`Current file is not a Jellyfin URL or is empty`);
      }
    } catch (error) {
      debugLog(`Error getting current file URL: ${error.message}`);
    }
  }

  if (!currentUrl) {
    debugLog('No Jellyfin URL found - checking for Jellyfin URL in current file');
    core.osd('No Jellyfin media detected. Please open a Jellyfin URL first.');
    return;
  }

  debugLog(`Attempting to download subtitles for: ${currentUrl}`);

  if (!isJellyfinUrl(currentUrl)) {
    debugLog(`URL is not a Jellyfin URL: ${currentUrl}`);
    core.osd('Current media is not from Jellyfin');
    return;
  }

  const jellyfinInfo = parseJellyfinUrl(currentUrl);
  if (!jellyfinInfo) {
    debugLog(`Failed to parse Jellyfin URL: ${currentUrl}`);
    core.osd('Failed to parse Jellyfin URL - check console for details');
    return;
  }

  // Store the URL for future use
  lastJellyfinUrl = currentUrl;
  lastItemId = jellyfinInfo.itemId;

  debugLog(`Downloading subtitles for item: ${jellyfinInfo.itemId}`);
  core.osd('Downloading subtitles...');
  downloadAllSubtitles(jellyfinInfo.serverBase, jellyfinInfo.itemId, jellyfinInfo.apiKey);
}

/**
 * Manual title setting function
 */
function manualSetTitle() {
  debugLog(`Manual title setting requested`);
  debugLog(`lastJellyfinUrl = "${lastJellyfinUrl}"`);

  let currentUrl = lastJellyfinUrl;

  // If no stored URL, try to get the current file URL from IINA
  if (!currentUrl) {
    try {
      debugLog(`No stored URL, checking core.status`);
      // Try to get the current file path/URL from IINA core
      const currentFile = core.status.url || core.status.path;
      debugLog(`core.status.url = "${core.status.url}"`);
      debugLog(`core.status.path = "${core.status.path}"`);
      debugLog(`currentFile = "${currentFile}"`);

      if (currentFile && isJellyfinUrl(currentFile)) {
        currentUrl = currentFile;
        debugLog(`Using current file URL: ${currentUrl}`);
      } else {
        debugLog(`Current file is not a Jellyfin URL or is empty`);
      }
    } catch (error) {
      debugLog(`Error getting current file URL: ${error.message}`);
    }
  }

  if (!currentUrl) {
    debugLog('No Jellyfin URL found - checking for Jellyfin URL in current file');
    core.osd('No Jellyfin media detected. Please open a Jellyfin URL first.');
    return;
  }

  debugLog(`Attempting to set title for: ${currentUrl}`);

  if (!isJellyfinUrl(currentUrl)) {
    debugLog(`URL is not a Jellyfin URL: ${currentUrl}`);
    core.osd('Current media is not from Jellyfin');
    return;
  }

  const jellyfinInfo = parseJellyfinUrl(currentUrl);
  if (!jellyfinInfo) {
    debugLog(`Failed to parse Jellyfin URL: ${currentUrl}`);
    core.osd('Failed to parse Jellyfin URL - check console for details');
    return;
  }

  // Store the URL for future use
  lastJellyfinUrl = currentUrl;
  lastItemId = jellyfinInfo.itemId;

  debugLog(`Setting title for item: ${jellyfinInfo.itemId}`);
  core.osd('Fetching title...');
  setVideoTitleFromMetadata(jellyfinInfo.serverBase, jellyfinInfo.itemId, jellyfinInfo.apiKey);
}

/**
 * Show Jellyfin Browser - handles the case when no window is available
 */
function showJellyfinBrowser() {
  try {
    debugLog('Attempting to show Jellyfin browser');

    // Try to show sidebar directly first
    if (sidebar && sidebar.show) {
      sidebar.show();
      debugLog('Sidebar shown successfully');
      return;
    }
  } catch (error) {
    debugLog(`Direct sidebar.show() failed: ${error.message}`);

    // Check if we have stored session data that could be useful
    const sessionData = getStoredJellyfinSession();

    // Always open in standalone window when sidebar isn't available
    debugLog('Opening Jellyfin browser in standalone window');
    openJellyfinStandaloneWindow(sessionData);
  }
}

/**
 * Open Jellyfin browser in a standalone window
 */
function openJellyfinStandaloneWindow(sessionData) {
  try {
    debugLog('Creating standalone Jellyfin browser window');

    // Load the same sidebar HTML in standalone window
    standaloneWindow.loadFile('src/ui/sidebar/index.html');

    // Set window properties
    standaloneWindow.setFrame({ x: 100, y: 100, width: 400, height: 600 });
    standaloneWindow.setProperty('title', 'Jellyfin Browser');
    standaloneWindow.setProperty('resizable', true);
    standaloneWindow.setProperty('minimizable', true);

    // Set up message handlers for standalone window
    standaloneWindow.onMessage('get-session', () => {
      standaloneWindow.postMessage('session-data', sessionData);
    });

    standaloneWindow.onMessage('play-media', (data) => {
      handlePlayMedia(data);
      // Close standalone window after starting playback
      standaloneWindow.close();
    });

    standaloneWindow.onMessage('clear-session', () => {
      clearJellyfinSession();
    });

    standaloneWindow.onMessage('store-session', (data) => {
      if (data && data.serverUrl && data.accessToken) {
        storeJellyfinSession(data.serverUrl, data.accessToken, data.username, data.password);
      }
    });

    // Open the window
    standaloneWindow.open();

    // Send session data after a brief delay
    setTimeout(() => {
      standaloneWindow.postMessage('session-available', sessionData);
    }, 1000);

    debugLog('Standalone Jellyfin browser window opened successfully');
    if (sessionData) {
      core.osd(
        `Jellyfin Browser opened in standalone window\nServer: ${sessionData.serverUrl.replace(/^https?:\/\//, '')}`
      );
    } else {
      core.osd('Jellyfin Browser opened in standalone window\nPlease login to access your media');
    }
  } catch (error) {
    debugLog(`Failed to create standalone window: ${error.message}`);
  }
}

// Menu items
menu.addItem(menu.item('Download Jellyfin Subtitles', manualDownloadSubtitles));
menu.addItem(menu.item('Set Jellyfin Title', manualSetTitle));
menu.addItem(
  menu.item(
    'Show Jellyfin Browser',
    () => {
      showJellyfinBrowser();
    },
    { keyBinding: 'Cmd+Shift+J' }
  )
);

/**
 * Open media in a new IINA instance
 */
function openInNewInstance(streamUrl, title) {
  if (typeof global !== 'undefined' && global.postMessage) {
    debugLog('Requesting new player instance from global entry');

    // Listen for response from global entry
    const messageHandler = (name, data) => {
      if (name === 'player-created') {
        debugLog('New player instance created: ' + JSON.stringify(data));
        core.osd(`Opened in new window: ${data.title}`);
      } else if (name === 'player-creation-failed') {
        debugLog('Failed to create new player instance: ' + data.error);
        core.osd('Failed to open new window - opening in current window');
        // Fallback to current window
        core.open(streamUrl);
      }
    };

    // Set up temporary listener (IINA doesn't have off() so we use this pattern)
    const originalHandler = global.onMessage;
    global.onMessage = (name, callback) => {
      if (name === 'player-created' || name === 'player-creation-failed') {
        return messageHandler(name, callback);
      }
      return originalHandler?.call(global, name, callback);
    };

    // Request new instance creation
    global.postMessage('create-player', { url: streamUrl, title: title });

    // Clean up listener after 5 seconds
    setTimeout(() => {
      global.onMessage = originalHandler;
    }, 5000);
  } else {
    debugLog('Global entry not available, opening in current window');
    core.open(streamUrl);
  }
}

/**
 * Handle media playback requests from sidebar
 */
function handlePlayMedia(message) {
  debugLog('HANDLE PLAY MEDIA CALLED');
  debugLog('handlePlayMedia called with message: ' + JSON.stringify(message));
  const { streamUrl, title } = message;
  debugLog(`Opening media: ${title} - ${streamUrl}`);

  try {
    const openInNewWindow = preferences.get('open_in_new_window');
    debugLog('open_in_new_window preference: ' + openInNewWindow);

    if (openInNewWindow) {
      debugLog('Opening media in new instance: ' + streamUrl);
      core.osd(`Opening in new window: ${title}`);
      openInNewInstance(streamUrl, title);
    } else {
      debugLog('Opening media in current window: ' + streamUrl);
      core.osd(`Opening: ${title}`);
      core.open(streamUrl);
    }

    debugLog('Successfully initiated media opening: ' + streamUrl);
  } catch (error) {
    debugLog('Error opening media: ' + error);
    core.osd('Failed to open media');

    // Fallback: copy to clipboard as backup
    try {
      if (typeof core !== 'undefined' && core.setClipboard) {
        core.setClipboard(streamUrl);
        core.osd('Error opening - URL copied to clipboard');
      } else if (typeof utils !== 'undefined' && utils.setClipboard) {
        utils.setClipboard(streamUrl);
        core.osd('Error opening - URL copied to clipboard');
      } else {
        core.osd('Failed to open - check console for URL');
      }
    } catch (clipboardError) {
      debugLog('Both open and clipboard failed: ' + clipboardError);
      core.osd('Failed to open media - check console');
    }
  }
}

// Event handlers
event.on('iina.file-loaded', onFileLoaded);

// Playback tracking events for Jellyfin progress sync
event.on('mpv.time-pos.changed', handlePlaybackPositionChange);

// Stop tracking when window closes
event.on('iina.window-will-close', () => {
  debugLog('Window closing, stopping playback tracking');
  stopPlaybackTracking();
});

// Also handle file ended event
event.on('mpv.eof-reached', () => {
  handleEofReached();
});

// Initialize sidebar when window is loaded
event.on('iina.window-loaded', () => {
  sidebar.loadFile('src/ui/sidebar/index.html');

  // Set up message handler for sidebar playback requests
  sidebar.onMessage('play-media', handlePlayMedia);

  // Handle session requests from sidebar
  sidebar.onMessage('get-session', () => {
    const sessionData = getStoredJellyfinSession();
    sidebar.postMessage('session-data', sessionData);
  });

  // Handle session clear requests from sidebar
  sidebar.onMessage('clear-session', () => {
    clearJellyfinSession();
  });

  // Handle session storage requests from sidebar (manual login)
  sidebar.onMessage('store-session', (data) => {
    if (data && data.serverUrl && data.accessToken) {
      storeJellyfinSession(data.serverUrl, data.accessToken, data.username, data.password);
    }
  });

  // Also expose a global method for sidebar communication
  global.playMedia = (streamUrl, title) => {
    debugLog('Global playMedia called with:', streamUrl, title);
    handlePlayMedia({ streamUrl, title });
  };

  // Send initial session data to sidebar after a brief delay
  setTimeout(() => {
    const sessionData = getStoredJellyfinSession();
    if (sessionData) {
      sidebar.postMessage('session-available', sessionData);
    }
  }, 500);
});
