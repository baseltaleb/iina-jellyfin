/**
 * HTTP Proxy Module
 *
 * Routes plugin-context HTTP calls through the browser WebView's fetch() API.
 * The browser runs on its own WebKit thread, so HTTP responses never contend
 * with mpv on the main thread — fixing the freeze bug when open_in_new_window is false.
 *
 * Falls back to IINA's native http.get/http.post when the browser WebView
 * hasn't loaded yet (e.g., window not opened). Combined with the 3s deferral
 * in index.js, the fallback is safe because mpv's initial buffer fill has
 * completed by the time these calls execute.
 */

const { standaloneWindow, http } = iina;
const { debugLog } = require('./utils.js');

let nextRequestId = 1;
const pendingRequests = new Map();
const requestQueue = [];
let browserReady = false;

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Initialize the HTTP proxy — registers message handlers for browser responses.
 * Must be called before standaloneWindow.loadFile().
 */
function initHttpProxy() {
  standaloneWindow.onMessage('proxy-fetch-result', (data) => {
    const { requestId, response, error } = data;
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      debugLog(`[proxy-http] Received result for unknown requestId: ${requestId}`);
      return;
    }
    pendingRequests.delete(requestId);
    clearTimeout(pending.timer);

    if (error) {
      debugLog(`[proxy-http] Request ${requestId} failed: ${error}`);
      pending.reject(new Error(error));
    } else {
      debugLog(`[proxy-http] Request ${requestId} completed, status: ${response.statusCode}`);
      pending.resolve(response);
    }
  });

  standaloneWindow.onMessage('proxy-ready', () => {
    debugLog('[proxy-http] Browser proxy is ready');
    browserReady = true;
    flushQueue();
  });

  debugLog('[proxy-http] HTTP proxy initialized');
}

/**
 * Flush queued requests that were waiting for the browser to be ready.
 */
function flushQueue() {
  debugLog(`[proxy-http] Flushing ${requestQueue.length} queued requests`);
  while (requestQueue.length > 0) {
    const msg = requestQueue.shift();
    standaloneWindow.postMessage('proxy-fetch', msg);
  }
}

/**
 * Send a proxy request to the browser WebView.
 * If the browser isn't ready yet, the request is queued.
 */
function sendProxyRequest(method, url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId++;

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      debugLog(`[proxy-http] Request ${requestId} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      reject(new Error(`Proxy request timed out: ${method} ${url}`));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, timer });

    const msg = {
      requestId,
      method,
      url,
      headers: options.headers || {},
      body: options.data || null,
    };

    if (browserReady) {
      standaloneWindow.postMessage('proxy-fetch', msg);
    } else {
      debugLog(`[proxy-http] Browser not ready, queuing request ${requestId}: ${method} ${url}`);
      requestQueue.push(msg);
    }
  });
}

/**
 * Drop-in replacement for iina's http.get().
 * Uses the browser WebView proxy when available, falls back to IINA's native http.get.
 * Returns Promise<{ data, statusCode }>.
 */
function proxyGet(url, options = {}) {
  if (browserReady) {
    return sendProxyRequest('GET', url, options);
  }
  debugLog(`[proxy-http] Fallback to http.get: ${url}`);
  try {
      return http.get(url, options);
    
  } catch (error) {
    debugLog(`ERROR: ${error}`);
  }
}

/**
 * Drop-in replacement for iina's http.post().
 * Uses the browser WebView proxy when available, falls back to IINA's native http.post.
 * Returns Promise<{ data, statusCode }>.
 */
function proxyPost(url, options = {}) {
  if (browserReady) {
    return sendProxyRequest('POST', url, options);
  }
  debugLog(`[proxy-http] Fallback to http.post: ${url}`);
  try {
      return http.post(url, options);
  } catch (error) {
    debugLog(`ERROR: ${error}`);
  }
}

module.exports = { initHttpProxy, proxyGet, proxyPost };
