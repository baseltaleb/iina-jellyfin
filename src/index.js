/**
 * IINA Jellyfin Plugin
 */

const { core, menu, event, utils, preferences, global, standaloneWindow } = iina;

const { debugLog } = require('./utils.js');
const { parseJellyfinUrl, isJellyfinUrl } = require('./jellyfin-api.js');
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
const { setVideoTitleFromMetadata } = require('./metadata.js');
const { setupAutoplayForEpisode, resetAutoplayState } = require('./autoplay.js');

// Plugin state
let lastJellyfinUrl = null;
let lastItemId = null;
let standaloneWindowInitialized = false;

debugLog('Jellyfin Subtitles Plugin loaded');

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
        debugLog('Playback sync disabled');
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
        // Reset autoplay state to allow processing new episode
        resetAutoplayState();
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
 * Show Jellyfin Browser in a standalone window
 */
function showJellyfinBrowser() {
  debugLog('Attempting to show Jellyfin browser');
  const sessionData = getStoredJellyfinSession();

  if (!standaloneWindowInitialized) {
    debugLog('Initializing standalone Jellyfin browser window');

    standaloneWindow.loadFile('src/ui/browser/index.html');
    standaloneWindow.setFrame({ x: 100, y: 100, width: 400, height: 600 });
    standaloneWindow.setProperty('title', 'Jellyfin Browser');
    standaloneWindow.setProperty('resizable', true);
    standaloneWindow.setProperty('minimizable', true);

    standaloneWindow.onMessage('get-session', () => {
      const currentSession = getStoredJellyfinSession();
      standaloneWindow.postMessage('session-data', currentSession);
    });

    standaloneWindow.onMessage('play-media', (data) => {
      handlePlayMedia(data);
    });

    standaloneWindow.onMessage('clear-session', () => {
      clearJellyfinSession();
    });

    standaloneWindow.onMessage('store-session', (data) => {
      if (data && data.serverUrl && data.accessToken) {
        storeJellyfinSession(data.serverUrl, data.accessToken, data.username, data.password);
      }
    });

    standaloneWindowInitialized = true;
  }

  standaloneWindow.open();

  setTimeout(() => {
    if (sessionData) {
      standaloneWindow.postMessage('session-available', sessionData);
    }
  }, 1000);

  if (sessionData) {
    core.osd(
      `Jellyfin Browser opened\nServer: ${sessionData.serverUrl.replace(/^https?:\/\//, '')}`
    );
  } else {
    core.osd('Jellyfin Browser opened\nPlease login to access your media');
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
 * Handle media playback requests
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

// Auto-open Jellyfin browser on startup if enabled
if (preferences.get('auto_open_browser')) {
  debugLog('Auto-opening Jellyfin browser on startup');
  showJellyfinBrowser();
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
