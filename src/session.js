/**
 * Jellyfin Session - Session storage, retrieval, and clearing
 */

const { preferences } = iina;
const { debugLog, base64Encode, base64Decode } = require('./utils.js');

/**
 * Store Jellyfin session data for auto-login
 */
function storeJellyfinSession(serverBase, apiKey, username = null, password = null, userId = null) {
  try {
    if (!preferences.get('auto_login_enabled')) {
      debugLog('Auto-login disabled, not storing session data');
      return;
    }

    debugLog(`Storing Jellyfin session data for: ${serverBase}`);

    // Store session data in preferences
    preferences.set('jellyfin_session_server', serverBase);
    preferences.set('jellyfin_session_token', apiKey);
    preferences.set('jellyfin_session_userid', userId || '');
    preferences.set('jellyfin_session_timestamp', Date.now());

    // Store credentials if provided and persistence is enabled
    if (username && password && preferences.get('jellyfin_persist_credentials')) {
      preferences.set('jellyfin_session_username', username);
      // Obfuscate password with base64 encoding
      preferences.set('jellyfin_session_password', base64Encode(password));
      debugLog('Credentials stored for automatic re-authentication');
    }

    preferences.sync();

    debugLog('Jellyfin session data stored successfully');
  } catch (error) {
    debugLog(`Error storing Jellyfin session: ${error.message}`);
  }
}

/**
 * Clear stored Jellyfin session data
 */
function clearJellyfinSession() {
  try {
    debugLog('Clearing Jellyfin session data');
    preferences.set('jellyfin_session_server', '');
    preferences.set('jellyfin_session_token', '');
    preferences.set('jellyfin_session_timestamp', 0);
    preferences.set('jellyfin_session_username', '');
    preferences.set('jellyfin_session_password', '');
    preferences.sync();
  } catch (error) {
    debugLog(`Error clearing Jellyfin session: ${error.message}`);
  }
}

/**
 * Get stored Jellyfin session data if valid
 */
function getStoredJellyfinSession() {
  try {
    if (!preferences.get('auto_login_enabled')) {
      debugLog('Auto-login disabled, not retrieving session data');
      return null;
    }

    const serverUrl = preferences.get('jellyfin_session_server');
    const accessToken = preferences.get('jellyfin_session_token');
    const userId = preferences.get('jellyfin_session_userid') || '';
    const timestamp = preferences.get('jellyfin_session_timestamp') || 0;
    const username = preferences.get('jellyfin_session_username');
    const encodedPassword = preferences.get('jellyfin_session_password');

    if (!serverUrl) {
      debugLog('No valid session data found');
      return null;
    }

    // Decode password if stored
    let password = null;
    if (encodedPassword) {
      try {
        password = base64Decode(encodedPassword);
      } catch (decodeError) {
        debugLog('Failed to decode stored password: ' + decodeError.message);
      }
    }

    const hasCredentials = !!(username && password);

    // If no token but has credentials, still return session data for re-authentication
    if (!accessToken && !hasCredentials) {
      debugLog('No token or credentials found');
      return null;
    }

    debugLog(`Retrieved session data for: ${serverUrl} (hasCredentials: ${hasCredentials})`);
    return {
      serverUrl,
      accessToken,
      userId,
      timestamp,
      username,
      password,
      hasCredentials,
    };
  } catch (error) {
    debugLog(`Error retrieving Jellyfin session: ${error.message}`);
    return null;
  }
}

module.exports = { storeJellyfinSession, clearJellyfinSession, getStoredJellyfinSession };
