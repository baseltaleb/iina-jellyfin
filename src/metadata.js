/**
 * Video title/metadata logic for Jellyfin media items
 */

const { preferences, mpv, core } = iina;

const { debugLog } = require('./utils.js');
const { fetchItemMetadata } = require('./jellyfin-api.js');

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

module.exports = { setVideoTitleFromMetadata };
