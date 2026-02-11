/**
 * Jellyfin API - URL parsing and core API fetch functions
 */

const { http } = iina;
const { debugLog } = require('./utils.js');

/**
 * Parse Jellyfin URL to extract server info and item ID
 */
function parseJellyfinUrl(url) {
  try {
    debugLog(`Attempting to parse URL: "${url}"`);

    if (!url) {
      debugLog(`URL is null or undefined`);
      return null;
    }

    // Manual URL parsing since URL constructor is not available in IINA
    // Extract protocol and host
    const protocolMatch = url.match(/^(https?):\/\/([^\/]+)/);
    if (!protocolMatch) {
      debugLog(`Invalid URL format - no protocol/host found`);
      return null;
    }

    const protocol = protocolMatch[1];
    const host = protocolMatch[2];
    const serverBase = `${protocol}://${host}`;

    debugLog(`Extracted serverBase: ${serverBase}`);

    // Extract pathname and query string
    const urlParts = url.split('?');
    const pathname = urlParts[0].replace(/^https?:\/\/[^\/]+/, '');
    const queryString = urlParts[1] || '';

    debugLog(`Extracted pathname: ${pathname}`);
    debugLog(`Extracted queryString: ${queryString}`);

    // Extract item ID from path
    const pathMatch = pathname.match(/\/Items\/([^\/]+)/);
    debugLog(`Path match result: ${pathMatch ? pathMatch[0] : 'no match'}`);

    if (!pathMatch) {
      debugLog(`No /Items/ pattern found in pathname: ${pathname}`);
      return null;
    }

    const itemId = pathMatch[1];

    // Extract API key from query string
    let apiKey = null;
    if (queryString) {
      const apiKeyMatch = queryString.match(/(?:^|&)api_key=([^&]+)/);
      if (apiKeyMatch) {
        apiKey = decodeURIComponent(apiKeyMatch[1]);
      }
    }

    debugLog(
      `Extracted - itemId: ${itemId}, apiKey: ${apiKey ? 'present' : 'missing'}, serverBase: ${serverBase}`
    );

    if (!apiKey) {
      debugLog(`No API key found in URL parameters`);
      return null;
    }

    return {
      serverBase,
      itemId,
      apiKey,
    };
  } catch (error) {
    debugLog(`Error parsing Jellyfin URL: ${error.message}`);
    debugLog(`Failed URL was: "${url}"`);
    return null;
  }
}

/**
 * Check if URL looks like a Jellyfin URL
 */
function isJellyfinUrl(url) {
  return (
    url &&
    ((url.includes('/Items/') && url.includes('api_key=')) ||
      url.includes('jellyfin') ||
      url.includes('/Audio/') ||
      url.includes('/Videos/'))
  );
}

/**
 * Fetch playback info from Jellyfin API
 */
async function fetchPlaybackInfo(serverBase, itemId, apiKey) {
  try {
    const playbackUrl = `${serverBase}/Items/${itemId}/PlaybackInfo?api_key=${apiKey}`;
    debugLog(`Fetching playback info from: ${playbackUrl}`);

    const response = await http.get(playbackUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    debugLog(`Response received`);

    if (!response.data) {
      throw new Error('No data received from Jellyfin API');
    }

    // IINA automatically parses JSON responses, so response.data is already an object
    if (typeof response.data === 'object') {
      debugLog(`Response data is already parsed object`);
      debugLog(
        `MediaSources found: ${response.data.MediaSources ? response.data.MediaSources.length : 'none'}`
      );
      return response.data;
    } else {
      // Fallback: if it's still a string, parse it manually
      debugLog(`Response data is string, parsing manually`);
      debugLog(`Response.data preview: ${response.data.substring(0, 200)}`);
      return JSON.parse(response.data);
    }
  } catch (error) {
    debugLog(`Error fetching playback info: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch item metadata from Jellyfin API for title information
 */
async function fetchItemMetadata(serverBase, itemId, apiKey) {
  try {
    const metadataUrl = `${serverBase}/Items/${itemId}?api_key=${apiKey}`;
    debugLog(`Fetching item metadata from: ${metadataUrl}`);

    const response = await http.get(metadataUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    debugLog(`Metadata response received`);

    if (!response.data) {
      throw new Error('No metadata received from Jellyfin API');
    }

    // IINA automatically parses JSON responses, so response.data is already an object
    if (typeof response.data === 'object') {
      debugLog(`Metadata is already parsed object`);
      debugLog(`Item name: ${response.data.Name}`);
      debugLog(`Item type: ${response.data.Type}`);
      return response.data;
    } else {
      // Fallback: if it's still a string, parse it manually
      debugLog(`Metadata is string, parsing manually`);
      debugLog(`Metadata preview: ${response.data.substring(0, 200)}`);
      return JSON.parse(response.data);
    }
  } catch (error) {
    debugLog(`Error fetching item metadata: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch the current user's ID from Jellyfin
 * @param {string} serverBase - Jellyfin server base URL
 * @param {string} apiKey - API key
 * @returns {Promise<string|null>} User ID or null if failed
 */
async function fetchCurrentUserId(serverBase, apiKey) {
  try {
    const url = `${serverBase}/Users/Me?api_key=${apiKey}`;
    debugLog(`Fetching current user ID from: ${url}`);

    const response = await http.get(url, {
      headers: { Accept: 'application/json' },
    });

    if (response.data && response.data.Id) {
      debugLog(`Current user ID: ${response.data.Id}`);
      return response.data.Id;
    }
    return null;
  } catch (error) {
    debugLog(`Error fetching user ID: ${error.message}`);
    return null;
  }
}

module.exports = {
  parseJellyfinUrl,
  isJellyfinUrl,
  fetchPlaybackInfo,
  fetchItemMetadata,
  fetchCurrentUserId,
};
