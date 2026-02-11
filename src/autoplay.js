/**
 * Autoplay - Episode fetching, playlist building, and autoplay setup
 */

const { debugLog } = require('./utils.js');
const { fetchItemMetadata } = require('./jellyfin-api.js');
const { http, preferences, playlist, core } = iina;

// State variables
let lastProcessedEpisodeId = null; // Track last processed episode to prevent duplicates
let lastProcessedSeriesId = null; // Track last series to detect series changes
const addedEpisodeIds = new Set(); // Track episodes already added to playlist

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
 * Reset autoplay state to allow processing a new episode
 */
function resetAutoplayState() {
  lastProcessedEpisodeId = null;
}

module.exports = { setupAutoplayForEpisode, resetAutoplayState };
