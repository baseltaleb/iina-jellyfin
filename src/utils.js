/**
 * Utility functions for IINA Jellyfin Plugin
 */

const { console, preferences } = iina;

/**
 * Base64 encode a string (simple implementation for plugin environment)
 * @param {string} str - String to encode
 * @returns {string} Base64 encoded string
 */
function base64Encode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += chars[(triplet >> 18) & 0x3f];
    result += chars[(triplet >> 12) & 0x3f];
    result += i > str.length + 1 ? '=' : chars[(triplet >> 6) & 0x3f];
    result += i > str.length ? '=' : chars[triplet & 0x3f];
  }
  return result;
}

/**
 * Base64 decode a string (simple implementation for plugin environment)
 * @param {string} str - Base64 encoded string to decode
 * @returns {string} Decoded string
 */
function base64Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  str = str.replace(/=+$/, '');
  for (let i = 0; i < str.length; i += 4) {
    const a = chars.indexOf(str[i]);
    const b = chars.indexOf(str[i + 1]);
    const c = chars.indexOf(str[i + 2]);
    const d = chars.indexOf(str[i + 3]);
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== -1) result += String.fromCharCode(((b & 0x0f) << 4) | (c >> 2));
    if (d !== -1) result += String.fromCharCode(((c & 0x03) << 6) | d);
  }
  return result;
}

/**
 * Debug logging helper function
 * Only logs if debug logging is enabled in preferences
 */
function debugLog(message) {
  if (preferences.get('debug_logging')) {
    console.log(`DEBUG: ${message}`);
  }
}

/**
 * Convert seconds to Jellyfin ticks (1 tick = 10000 ms = 0.00001 seconds)
 * @param {number} seconds - Time in seconds
 * @returns {number} Time in ticks
 */
function secondsToTicks(seconds) {
  return Math.round(seconds * 10000000);
}

/**
 * Convert Jellyfin ticks to seconds
 * @param {number} ticks - Time in ticks
 * @returns {number} Time in seconds
 */
function ticksToSeconds(ticks) {
  return ticks / 10000000;
}

module.exports = { base64Encode, base64Decode, debugLog, secondsToTicks, ticksToSeconds };
