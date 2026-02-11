/**
 * Playback tracking, progress reporting, resume, and mark-as-watched
 */

const { debugLog, secondsToTicks, ticksToSeconds } = require('./utils.js');
const { fetchPlaybackInfo, fetchItemMetadata, fetchCurrentUserId } = require('./jellyfin-api.js');

const { core, http, preferences } = iina;

// Playback tracking state
let currentPlaybackSession = null; // Current Jellyfin playback session info
let lastReportedPosition = 0; // Last reported position in seconds
let lastProgressReportTime = 0; // Last time progress was reported (ms)
const PROGRESS_REPORT_INTERVAL = 10000; // Report progress every 10 seconds (ms)
const WATCHED_THRESHOLD = 0.95; // Consider watched if 95% complete
const END_THRESHOLD_SECONDS = 30; // Consider near end if within last 30 seconds

/**
 * Fetch the resume position for an item from Jellyfin
 * @param {string} serverBase - Jellyfin server base URL
 * @param {string} itemId - Item ID
 * @param {string} apiKey - API key
 * @returns {Promise<number|null>} Resume position in seconds, or null if not available
 */
async function fetchResumePosition(serverBase, itemId, apiKey) {
  try {
    if (!preferences.get('sync_playback_progress')) {
      debugLog('Playback progress sync disabled, skipping resume position fetch');
      return null;
    }

    const metadata = await fetchItemMetadata(serverBase, itemId, apiKey);

    if (!metadata || !metadata.UserData) {
      debugLog('No UserData found in metadata');
      return null;
    }

    const playbackPositionTicks = metadata.UserData.PlaybackPositionTicks;
    const played = metadata.UserData.Played;

    // Don't resume if already fully watched
    if (played) {
      debugLog('Item already marked as played, not resuming');
      return null;
    }

    if (!playbackPositionTicks || playbackPositionTicks === 0) {
      debugLog('No resume position available');
      return null;
    }

    const positionSeconds = ticksToSeconds(playbackPositionTicks);
    debugLog(
      `Found resume position: ${positionSeconds.toFixed(1)}s (${playbackPositionTicks} ticks)`
    );

    return positionSeconds;
  } catch (error) {
    debugLog(`Error fetching resume position: ${error.message}`);
    return null;
  }
}

/**
 * Seek to the resume position from Jellyfin
 * Called after file is loaded to restore playback position
 */
async function resumeFromJellyfin(serverBase, itemId, apiKey) {
  try {
    const resumePosition = await fetchResumePosition(serverBase, itemId, apiKey);

    if (resumePosition === null || resumePosition < 15) {
      // Don't seek if position is less than 15 seconds
      debugLog('No significant resume position, starting from beginning');
      return;
    }

    // Wait a bit for the video to load properly before seeking
    setTimeout(() => {
      try {
        debugLog(`Resuming playback at ${resumePosition.toFixed(1)}s`);
        core.seekTo(resumePosition);

        if (preferences.get('show_notifications')) {
          const minutes = Math.floor(resumePosition / 60);
          const seconds = Math.floor(resumePosition % 60);
          core.osd(`Resuming at ${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      } catch (error) {
        debugLog(`Error seeking to resume position: ${error.message}`);
      }
    }, 1000); // 1 second delay to let video initialize
  } catch (error) {
    debugLog(`Error resuming from Jellyfin: ${error.message}`);
  }
}

/**
 * Report playback start to Jellyfin
 * POST /Sessions/Playing
 */
async function reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId) {
  try {
    if (!preferences.get('sync_playback_progress')) {
      debugLog('Playback progress sync disabled, skipping playback start report');
      return false;
    }

    const url = `${serverBase}/Sessions/Playing?api_key=${apiKey}`;
    debugLog(`Reporting playback start for item: ${itemId}`);

    const response = await http.post(url, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: {
        ItemId: itemId,
        MediaSourceId: mediaSourceId || itemId,
        PlaySessionId: playSessionId,
        CanSeek: true,
        PlayMethod: 'DirectPlay',
        PositionTicks: 0,
      },
    });

    if (response.statusCode >= 400) {
      debugLog(`Playback start failed with status: ${response.statusCode}`);
      return false;
    }

    debugLog(`Playback start reported, status: ${response.statusCode}`);
    return response.statusCode === 204 || response.statusCode === 200;
  } catch (error) {
    debugLog(
      `Error reporting playback start: ${error && error.message ? error.message : JSON.stringify(error)}`
    );
    return false;
  }
}

/**
 * Report playback progress to Jellyfin
 * POST /Sessions/Playing/Progress
 * @param {string} serverBase - Jellyfin server base URL
 * @param {string} itemId - Item ID
 * @param {string} apiKey - API key
 * @param {number} positionSeconds - Current playback position in seconds
 * @param {string} playSessionId - Play session ID
 * @param {string} mediaSourceId - Media source ID
 * @param {boolean} isPaused - Whether playback is paused
 */
async function reportPlaybackProgress(
  serverBase,
  itemId,
  apiKey,
  positionSeconds,
  playSessionId,
  mediaSourceId,
  isPaused = false
) {
  try {
    if (!preferences.get('sync_playback_progress')) {
      return false;
    }

    const positionTicks = secondsToTicks(positionSeconds);
    const url = `${serverBase}/Sessions/Playing/Progress?api_key=${apiKey}`;

    const response = await http.post(url, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: {
        ItemId: itemId,
        MediaSourceId: mediaSourceId || itemId,
        PlaySessionId: playSessionId,
        PositionTicks: positionTicks,
        IsPaused: isPaused,
        CanSeek: true,
        PlayMethod: 'DirectPlay',
      },
    });

    if (response.statusCode >= 400) {
      debugLog(`Progress report failed with status: ${response.statusCode}`);
      return false;
    }

    return response.statusCode === 204 || response.statusCode === 200;
  } catch (error) {
    debugLog(
      `Error reporting playback progress: ${error && error.message ? error.message : JSON.stringify(error)}`
    );
    return false;
  }
}

/**
 * Report playback stop to Jellyfin
 * POST /Sessions/Playing/Stopped
 * @param {string} serverBase - Jellyfin server base URL
 * @param {string} itemId - Item ID
 * @param {string} apiKey - API key
 * @param {number} positionSeconds - Final playback position in seconds
 */
async function reportPlaybackStop(
  serverBase,
  itemId,
  apiKey,
  positionSeconds,
  playSessionId,
  mediaSourceId
) {
  try {
    if (!preferences.get('sync_playback_progress')) {
      debugLog('Playback progress sync disabled, skipping playback stop report');
      return false;
    }

    const positionTicks = secondsToTicks(positionSeconds);
    const url = `${serverBase}/Sessions/Playing/Stopped?api_key=${apiKey}`;

    debugLog(`Reporting playback stop: position=${positionSeconds}s (${positionTicks} ticks)`);

    const response = await http.post(url, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: {
        ItemId: itemId,
        MediaSourceId: mediaSourceId || itemId,
        PlaySessionId: playSessionId,
        PositionTicks: positionTicks,
      },
    });

    if (response.statusCode >= 400) {
      debugLog(`Playback stop failed with status: ${response.statusCode}`);
      return false;
    }

    debugLog(`Playback stop reported, status: ${response.statusCode}`);
    return response.statusCode === 204 || response.statusCode === 200;
  } catch (error) {
    debugLog(
      `Error reporting playback stop: ${error && error.message ? error.message : JSON.stringify(error)}`
    );
    return false;
  }
}

/**
 * Mark item as watched/played in Jellyfin
 * POST /UserPlayedItems/{itemId}
 * @param {string} serverBase - Jellyfin server base URL
 * @param {string} itemId - Item ID
 * @param {string} apiKey - API key
 * @param {string} userId - User ID (required by Jellyfin API)
 */
async function markAsWatched(serverBase, itemId, apiKey, userId) {
  try {
    if (!preferences.get('sync_playback_progress')) {
      debugLog('Playback progress sync disabled, skipping mark as watched');
      return false;
    }

    if (!userId) {
      debugLog('No userId available, cannot mark as watched');
      return false;
    }

    // Use UserPlayedItems endpoint with userId - required by Jellyfin API
    const url = `${serverBase}/UserPlayedItems/${itemId}?userId=${userId}&api_key=${apiKey}`;
    debugLog(`Marking item as watched: ${itemId} for user: ${userId}`);

    const response = await http.post(url, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (response.statusCode >= 400) {
      debugLog(`Mark as watched failed with status: ${response.statusCode}`);
      return false;
    }

    debugLog(`Item marked as watched, status: ${response.statusCode}`);

    if (
      (response.statusCode === 200 || response.statusCode === 204) &&
      preferences.get('show_notifications')
    ) {
      core.osd('Marked as watched in Jellyfin');
    }

    return response.statusCode === 200 || response.statusCode === 204;
  } catch (error) {
    debugLog(
      `Error marking item as watched: ${error && error.message ? error.message : JSON.stringify(error)}`
    );
    return false;
  }
}

/**
 * Start playback tracking for Jellyfin content
 * Uses mpv events to track position changes
 */
async function startPlaybackTracking(serverBase, itemId, apiKey) {
  // Stop any existing tracking
  stopPlaybackTracking();

  if (!preferences.get('sync_playback_progress')) {
    debugLog('Playback progress sync disabled');
    return;
  }

  debugLog(`Starting playback tracking for item: ${itemId}`);

  // Fetch playback info to get PlaySessionId and MediaSourceId
  let playSessionId = null;
  let mediaSourceId = null;
  let userId = null;
  try {
    const playbackInfo = await fetchPlaybackInfo(serverBase, itemId, apiKey);
    if (playbackInfo) {
      playSessionId = playbackInfo.PlaySessionId || null;
      if (playbackInfo.MediaSources && playbackInfo.MediaSources.length > 0) {
        mediaSourceId = playbackInfo.MediaSources[0].Id || null;
      }
      debugLog(`PlaySessionId: ${playSessionId}, MediaSourceId: ${mediaSourceId}`);
    }
  } catch (error) {
    debugLog(`Could not fetch playback info for session: ${error.message}`);
  }

  // Fetch current user ID (required for marking items as watched)
  try {
    userId = await fetchCurrentUserId(serverBase, apiKey);
    debugLog(`Fetched userId for playback session: ${userId}`);
  } catch (error) {
    debugLog(`Could not fetch user ID: ${error.message}`);
  }

  // Store current session info
  currentPlaybackSession = {
    serverBase,
    itemId,
    apiKey,
    playSessionId,
    mediaSourceId,
    userId,
    startTime: Date.now(),
    duration: null,
    hasReportedWatched: false,
  };

  // Report playback start
  reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId);

  // Resume from Jellyfin position if available
  resumeFromJellyfin(serverBase, itemId, apiKey);

  // Get duration from IINA
  try {
    const duration = core.status.duration;
    if (duration) {
      currentPlaybackSession.duration = duration;
      debugLog(`Media duration: ${duration}s`);
    }
  } catch (error) {
    debugLog(`Could not get duration: ${error.message}`);
  }

  debugLog('Playback tracking started');
}

/**
 * Handle playback position change
 * Called by mpv.time-pos.changed event
 * Reports progress to Jellyfin periodically and checks watched threshold.
 */
function handlePlaybackPositionChange() {
  if (!currentPlaybackSession) return;

  try {
    const currentTime = Date.now();
    const position = core.status.position;
    const duration = core.status.duration || currentPlaybackSession.duration;
    const isPaused = core.status.paused || false;

    // Throttle progress reports to avoid excessive API calls
    if (currentTime - lastProgressReportTime < PROGRESS_REPORT_INTERVAL) {
      return;
    }

    if (
      position !== null &&
      position !== undefined &&
      Math.abs(position - lastReportedPosition) > 1
    ) {
      const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;

      // Report progress to Jellyfin
      reportPlaybackProgress(
        serverBase,
        itemId,
        apiKey,
        position,
        playSessionId,
        mediaSourceId,
        isPaused
      );

      lastReportedPosition = position;
      lastProgressReportTime = currentTime;

      // Check if we should mark as watched (95% threshold by default)
      if (duration && !currentPlaybackSession.hasReportedWatched) {
        const percentComplete = position / duration;
        debugLog(`Playback progress: ${(percentComplete * 100).toFixed(1)}%`);

        if (percentComplete >= WATCHED_THRESHOLD) {
          debugLog(`Reached ${WATCHED_THRESHOLD * 100}% threshold, marking as watched`);
          markAsWatched(serverBase, itemId, apiKey, currentPlaybackSession.userId);
          currentPlaybackSession.hasReportedWatched = true;
        }
      }
    }
  } catch (error) {
    debugLog(`Error in position change handler: ${error.message}`);
  }
}

/**
 * Stop playback tracking and report final position
 */
function stopPlaybackTracking() {
  if (currentPlaybackSession) {
    const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;

    // Report final position
    try {
      const position = core.status.position ?? lastReportedPosition;
      reportPlaybackStop(serverBase, itemId, apiKey, position, playSessionId, mediaSourceId);
    } catch (error) {
      debugLog(`Error reporting final position: ${error.message}`);
      // Try with last known position
      reportPlaybackStop(
        serverBase,
        itemId,
        apiKey,
        lastReportedPosition,
        playSessionId,
        mediaSourceId
      );
    }

    currentPlaybackSession = null;
    lastReportedPosition = 0;
    lastProgressReportTime = 0;
    debugLog('Playback session ended');
  }
}

/**
 * Handle end-of-file reached event
 * Checks if near end and marks as watched, then stops tracking
 */
function handleEofReached() {
  debugLog('End of file reached');
  // Mark as watched if we haven't already (in case we didn't hit 95% threshold)
  if (currentPlaybackSession && currentPlaybackSession.itemId) {
    const duration = core.status.duration || 0;
    const position = core.status.position || 0;
    // If near the end (within last 30 seconds or 95%+), mark as watched
    if (
      duration > 0 &&
      (position >= duration - END_THRESHOLD_SECONDS || position / duration >= WATCHED_THRESHOLD)
    ) {
      markAsWatched(
        currentPlaybackSession.serverBase,
        currentPlaybackSession.itemId,
        currentPlaybackSession.apiKey,
        currentPlaybackSession.userId
      );
    }
  }
  stopPlaybackTracking();
}

/**
 * Get the current playback session info
 * @returns {object|null} Current playback session or null
 */
function getCurrentPlaybackSession() {
  return currentPlaybackSession;
}

module.exports = {
  startPlaybackTracking,
  stopPlaybackTracking,
  handlePlaybackPositionChange,
  handleEofReached,
  getCurrentPlaybackSession,
};
