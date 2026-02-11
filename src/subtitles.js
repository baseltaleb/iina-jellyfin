/**
 * Subtitle downloading logic for Jellyfin media items
 */

const { http, utils, core, preferences } = iina;

const { debugLog } = require('./utils.js');
const { fetchPlaybackInfo } = require('./jellyfin-api.js');

/**
 * Download subtitle file from Jellyfin
 */
async function downloadSubtitle(serverBase, itemId, streamIndex, apiKey, language, codec) {
  try {
    const subtitleUrl = `${serverBase}/Videos/${itemId}/${streamIndex}/Subtitles.${codec}?api_key=${apiKey}`;
    // Sanitize filename components to prevent path traversal
    const sanitizedItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedLanguage = String(language).replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedCodec = String(codec).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `jellyfin_${sanitizedItemId}_${streamIndex}_${sanitizedLanguage}.${sanitizedCodec}`;
    const localPath = `@tmp/${fileName}`;

    debugLog(`Downloading subtitle: ${subtitleUrl}`);

    await http.download(subtitleUrl, localPath);

    // Load the subtitle track in IINA
    const resolvedPath = utils.resolvePath(localPath);
    core.subtitle.loadTrack(resolvedPath);

    debugLog(`Subtitle loaded: ${resolvedPath}`);

    if (preferences.get('show_notifications')) {
      core.osd(`Loaded ${language} subtitle`);
    }

    return true;
  } catch (error) {
    debugLog(`Error downloading subtitle: ${error.message}`);
    return false;
  }
}

/**
 * Process external subtitle file
 */
async function downloadExternalSubtitle(
  serverBase,
  itemId,
  streamIndex,
  subtitlePath,
  apiKey,
  language,
  codec
) {
  try {
    // Determine the proper file extension based on codec
    let extension = 'srt'; // default
    if (codec === 'subrip') extension = 'srt';
    else if (codec === 'webvtt') extension = 'vtt';
    else if (codec === 'ass') extension = 'ass';
    else if (codec === 'ssa') extension = 'ssa';
    else if (codec === 'vtt') extension = 'vtt';
    else if (codec && codec.toLowerCase().includes('srt')) extension = 'srt';
    else if (codec && codec.toLowerCase().includes('vtt')) extension = 'vtt';

    // Use the correct Jellyfin API endpoint for subtitle download
    // Format: /Videos/{itemId}/{mediaSourceId}/Subtitles/{streamIndex}/stream.{extension}
    const subtitleUrl = `${serverBase}/Videos/${itemId}/${itemId}/Subtitles/${streamIndex}/stream.${extension}?api_key=${apiKey}`;

    // Try to extract the original filename from the subtitle path
    let fileName;
    if (subtitlePath) {
      // Extract just the filename from the full path and sanitize it
      const pathParts = subtitlePath.split(/[/\\]/); // Handle both / and \ separators
      const originalName = pathParts[pathParts.length - 1];
      // Sanitize filename to prevent path traversal and invalid characters
      fileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      debugLog(`Using sanitized filename: ${fileName}`);
    } else {
      // Fallback to generated name with sanitized components
      const sanitizedItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const sanitizedLanguage = String(language).replace(/[^a-zA-Z0-9_-]/g, '_');
      fileName = `jellyfin_external_${sanitizedItemId}_${streamIndex}_${sanitizedLanguage}.${extension}`;
      debugLog(`Using generated filename: ${fileName}`);
    }

    const localPath = `@tmp/${fileName}`;

    debugLog(`Downloading external subtitle: ${subtitleUrl}`);
    debugLog(`External subtitle path: ${subtitlePath}`);
    debugLog(`Stream index: ${streamIndex}`);
    debugLog(`Language: ${language}`);
    debugLog(`Codec: ${codec} -> Extension: ${extension}`);
    debugLog(`Local filename: ${fileName}`);

    await http.download(subtitleUrl, localPath);

    // Load the subtitle track in IINA
    const resolvedPath = utils.resolvePath(localPath);
    core.subtitle.loadTrack(resolvedPath);

    debugLog(`External subtitle loaded successfully: ${resolvedPath}`);

    if (preferences.get('show_notifications')) {
      core.osd(`Loaded external ${language} subtitle`);
    }

    return true;
  } catch (error) {
    debugLog(`Error downloading external subtitle: ${error.message}`);
    return false;
  }
}

/**
 * Download all available subtitles for a Jellyfin item
 */
async function downloadAllSubtitles(serverBase, itemId, apiKey) {
  try {
    const playbackInfo = await fetchPlaybackInfo(serverBase, itemId, apiKey);

    if (!playbackInfo.MediaSources || playbackInfo.MediaSources.length === 0) {
      debugLog('No media sources found');
      return;
    }

    const mediaSource = playbackInfo.MediaSources[0];
    const mediaStreams = mediaSource.MediaStreams || [];

    const subtitleStreams = mediaStreams.filter(
      (stream) => stream.Type === 'Subtitle' && stream.IsTextSubtitleStream
    );

    debugLog(`Found ${subtitleStreams.length} subtitle streams`);

    const preferredLanguages = (preferences.get('preferred_languages') || 'en,eng')
      .split(',')
      .map((lang) => lang.trim().toLowerCase())
      .filter((lang) => lang.length > 0);
    const downloadAll = preferences.get('download_all_subtitles');

    let downloadedCount = 0;

    for (const stream of subtitleStreams) {
      const language = stream.Language || 'unknown';
      const codec = stream.Codec || 'srt';

      // Check if we should download this subtitle
      const shouldDownload =
        downloadAll ||
        preferredLanguages.some(
          (prefLang) =>
            language.toLowerCase().includes(prefLang) || prefLang.includes(language.toLowerCase())
        );

      if (!shouldDownload) {
        debugLog(`Skipping subtitle: ${language} (not in preferred languages)`);
        continue;
      }

      debugLog(
        `Processing subtitle: ${language} (${codec}) - Index: ${stream.Index}, External: ${stream.IsExternal}`
      );

      try {
        if (stream.IsExternal && stream.Path) {
          // Handle external subtitle files
          await downloadExternalSubtitle(
            serverBase,
            itemId,
            stream.Index,
            stream.Path,
            apiKey,
            language,
            codec
          );
        } else {
          // Handle embedded subtitle streams
          await downloadSubtitle(serverBase, itemId, stream.Index, apiKey, language, codec);
        }
        downloadedCount++;
      } catch (error) {
        debugLog(`Failed to download subtitle ${language}: ${error.message}`);
      }
    }

    if (downloadedCount > 0 && preferences.get('show_notifications')) {
      core.osd(`Downloaded ${downloadedCount} subtitle(s)`);
    } else if (downloadedCount === 0) {
      debugLog('No subtitles downloaded');
      if (preferences.get('show_notifications')) {
        core.osd('No matching subtitles found');
      }
    }
  } catch (error) {
    debugLog(`Error downloading subtitles: ${error.message}`);
    if (preferences.get('show_notifications')) {
      core.osd('Failed to download subtitles');
    }
  }
}

module.exports = { downloadAllSubtitles };
