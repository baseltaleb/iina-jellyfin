/**
 * HTTP Proxy Handler
 *
 * Runs immediately at script parse (before DOMContentLoaded) so the proxy is
 * available as soon as the browser WebView loads. The plugin sends proxy-fetch
 * messages; we execute fetch() on the WebKit thread and send results back.
 */
(function initProxyHandler() {
  if (typeof iina === 'undefined' || !iina.onMessage || !iina.postMessage) {
    return;
  }

  iina.onMessage('proxy-fetch', async (data) => {
    const { requestId, method, url, headers, body } = data;
    try {
      const fetchOptions = { method, headers: headers || {} };
      if (body && method !== 'GET') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const text = await response.text();

      let parsedData;
      try {
        parsedData = JSON.parse(text);
      } catch {
        parsedData = text;
      }

      iina.postMessage('proxy-fetch-result', {
        requestId,
        response: { data: parsedData, statusCode: response.status },
      });
    } catch (error) {
      iina.postMessage('proxy-fetch-result', {
        requestId,
        error: error.message || 'Proxy fetch failed',
      });
    }
  });

  iina.postMessage('proxy-ready', {});
})();

/**
 * Screen Info
 *
 * The plugin cannot read the screen size when no player window is loaded, so the
 * WebView sends the usable screen area (without the menu bar and the Dock).
 */
(function sendScreenInfo() {
  if (typeof iina === 'undefined' || !iina.postMessage) {
    return;
  }

  const { availWidth, availHeight, availLeft, availTop, height } = window.screen;
  iina.postMessage('screen-info', { availWidth, availHeight, availLeft, availTop, height });
})();
