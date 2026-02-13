/**
 * Authentication Component
 * Manages Jellyfin server authentication, session persistence, and auto-login
 */

/* global debugLog */

class Authentication {
  /**
   * @param {Object} options
   * @param {Function} options.getHttpClient - Returns HTTP client { get, post } for API calls
   * @param {Function} options.onAuthSuccess - Called with { currentServer, currentUser } on login
   * @param {Function} options.onLogout - Called when user logs out
   */
  constructor({ getHttpClient, onAuthSuccess, onLogout }) {
    this.getHttpClient = getHttpClient;
    this.onAuthSuccess = onAuthSuccess;
    this.onLogout = onLogout;

    this._currentUser = null;
    this._currentServer = null;
  }

  get currentServer() {
    return this._currentServer;
  }

  get currentUser() {
    return this._currentUser;
  }

  get isAuthenticated() {
    return !!(this._currentServer && this._currentUser);
  }

  init() {
    this._setupEventListeners();
    this._setupMessageHandlers();
    this._requestSessionData();
    this._showLoginForm();
  }

  _setupEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', () => {
      this._showLoginForm();
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
      this.logout();
    });

    document.getElementById('loginBtn').addEventListener('click', () => {
      this.login();
    });

    document.getElementById('cancelLoginBtn').addEventListener('click', () => {
      this._hideLoginForm();
    });

    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.login();
      }
    });

    document.getElementById('clearSessionBtn').addEventListener('click', () => {
      this.clearStoredSession();
    });
  }

  _setupMessageHandlers() {
    if (typeof iina !== 'undefined' && iina.onMessage) {
      iina.onMessage('session-available', (data) => {
        debugLog('Received session-available message: ' + JSON.stringify(data));
        this._handleSessionAvailable(data);
      });

      iina.onMessage('session-data', (data) => {
        debugLog('Received session-data message: ' + JSON.stringify(data));
        this._handleSessionData(data);
      });

      iina.onMessage('session-cleared', () => {
        debugLog('Received session-cleared message');
        this._handleSessionCleared();
      });
    } else {
      debugLog('iina.onMessage not available, session auto-login disabled');
    }
  }

  _requestSessionData() {
    debugLog('Requesting session data from main plugin');
    if (typeof iina !== 'undefined' && iina.postMessage) {
      iina.postMessage('get-session');
    } else {
      debugLog('iina.postMessage not available, cannot request session data');
    }
  }

  _handleSessionAvailable(sessionData) {
    if (!sessionData || !sessionData.serverUrl || !sessionData.accessToken) {
      debugLog('Invalid session data received');
      return;
    }

    debugLog('Attempting auto-login with session data');
    this._attemptAutoLogin(sessionData);
  }

  _handleSessionData(sessionData) {
    if (!sessionData) {
      debugLog('No stored session data available');
      return;
    }

    debugLog('Retrieved stored session data, attempting auto-login');
    this._attemptAutoLogin(sessionData);
  }

  _handleSessionCleared() {
    debugLog('Session cleared, logging out if currently logged in');
    if (this._currentServer) {
      this.logout();
    }
  }

  async _attemptAutoLogin(sessionData) {
    try {
      debugLog('Attempting auto-login to: ' + sessionData.serverUrl);

      this._updateServerStatus('Auto-connecting...', 'connecting');

      if (sessionData.accessToken) {
        try {
          const response = await this.getHttpClient().get(`${sessionData.serverUrl}/System/Info`, {
            headers: {
              'X-Emby-Token': sessionData.accessToken,
            },
          });

          if (response.status === 200 && response.data) {
            const userResponse = await this.getHttpClient().get(
              `${sessionData.serverUrl}/Users/Me`,
              {
                headers: {
                  'X-Emby-Token': sessionData.accessToken,
                },
              }
            );

            if (userResponse.status === 200 && userResponse.data) {
              this._currentServer = {
                name: response.data.ServerName || sessionData.serverUrl,
                url: sessionData.serverUrl,
                userId: userResponse.data.Id,
                accessToken: sessionData.accessToken,
              };

              this._currentUser = userResponse.data;

              debugLog('Auto-login successful for user: ' + this._currentUser.Name);

              this._hideLoginForm();
              this._showLogoutButton();
              this._updateServerStatus(`Auto-connected as ${this._currentUser.Name}`, 'connected');
              this.onAuthSuccess({
                currentServer: this._currentServer,
                currentUser: this._currentUser,
              });

              return;
            }
          }
        } catch (tokenError) {
          debugLog('Token validation failed: ' + tokenError.message);
        }
      }

      if (sessionData.hasCredentials && sessionData.username && sessionData.password) {
        debugLog('Token expired or invalid, attempting re-authentication with stored credentials');
        await this._attemptReauthentication(sessionData);
        return;
      }
    } catch (error) {
      debugLog('Auto-login failed: ' + error.message);
    }

    debugLog('Auto-login failed, no stored credentials available');
    this.clearStoredSession();
    this._updateServerStatus('Session expired - please login', 'error');
  }

  async _attemptReauthentication(sessionData) {
    try {
      this._updateServerStatus('Re-authenticating...', 'connecting');
      debugLog('Re-authenticating with stored credentials for: ' + sessionData.serverUrl);

      const authResult = await this._authenticateUser(
        sessionData.serverUrl,
        sessionData.username,
        sessionData.password
      );

      if (authResult.success) {
        debugLog('Re-authentication successful');

        this._currentServer = {
          name: authResult.serverName || sessionData.serverUrl,
          url: sessionData.serverUrl,
          userId: authResult.user.Id,
          accessToken: authResult.accessToken,
        };
        this._currentUser = authResult.user;

        this._storeSessionData(
          sessionData.serverUrl,
          authResult.accessToken,
          sessionData.username,
          sessionData.password
        );

        this._hideLoginForm();
        this._showLogoutButton();
        this._updateServerStatus(`Reconnected as ${authResult.user.Name}`, 'connected');
        this.onAuthSuccess({
          currentServer: this._currentServer,
          currentUser: this._currentUser,
        });
        return;
      }

      debugLog('Re-authentication failed: ' + authResult.error);
    } catch (error) {
      debugLog('Re-authentication error: ' + error.message);
    }

    debugLog('Re-authentication failed, clearing credentials and showing login form');
    this.clearStoredSession();
    this._updateServerStatus('Re-authentication failed - please login', 'error');
  }

  clearStoredSession() {
    debugLog('Requesting session clear from main plugin');
    if (typeof iina !== 'undefined' && iina.postMessage) {
      iina.postMessage('clear-session');
    }

    this.logout();
  }

  _storeSessionData(serverUrl, accessToken, username = null, password = null) {
    debugLog('Requesting session storage from main plugin');
    if (typeof iina !== 'undefined' && iina.postMessage) {
      iina.postMessage('store-session', {
        serverUrl: serverUrl,
        accessToken: accessToken,
        username: username,
        password: password,
      });
    }
  }

  logout() {
    debugLog('Logging out user');
    this._currentUser = null;
    this._currentServer = null;
    this._updateServerStatus('Not connected');
    this._showConnectButton();
    this._clearLoginForm();
    this.onLogout();
  }

  async login() {
    debugLog('Login function called');
    const serverUrl = document.getElementById('serverUrl').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');

    debugLog('Login inputs: ' + JSON.stringify({ serverUrl, username, password: '[HIDDEN]' }));

    if (!serverUrl || !username || !password) {
      errorEl.textContent = 'Please fill in all fields';
      return;
    }

    const normalizedUrl = this._normalizeServerUrl(serverUrl);
    debugLog('Normalized URL: ' + normalizedUrl);

    try {
      document.getElementById('loginBtn').disabled = true;
      document.getElementById('loginBtn').textContent = 'Logging in...';
      errorEl.textContent = '';

      debugLog('Starting authentication...');
      const authResult = await this._authenticateUser(normalizedUrl, username, password);
      debugLog('Authentication result: ' + JSON.stringify(authResult));

      if (authResult.success) {
        debugLog('Authentication successful');

        this._currentServer = {
          name: authResult.serverName || normalizedUrl,
          url: normalizedUrl,
          userId: authResult.user.Id,
          accessToken: authResult.accessToken,
        };

        this._currentUser = authResult.user;

        this._storeSessionData(normalizedUrl, authResult.accessToken, username, password);

        this._hideLoginForm();
        this._showLogoutButton();
        this._updateServerStatus(`Connected as ${authResult.user.Name}`, 'connected');
        this.onAuthSuccess({
          currentServer: this._currentServer,
          currentUser: this._currentUser,
        });
      } else {
        debugLog('Authentication failed: ' + authResult.error);
        errorEl.textContent = authResult.error || 'Login failed';
      }
    } catch (error) {
      debugLog('Login error: ' + error);
      errorEl.textContent = 'Connection failed. Please check your server URL.';
    } finally {
      document.getElementById('loginBtn').disabled = false;
      document.getElementById('loginBtn').textContent = 'Login';
    }
  }

  _normalizeServerUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid server URL');
    }

    url = url.trim();
    if (!url) {
      throw new Error('Server URL cannot be empty');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }

    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
    if (!urlPattern.test(url)) {
      throw new Error('Invalid server URL format');
    }

    return url.replace(/\/$/, '');
  }

  async _authenticateUser(serverUrl, username, password) {
    try {
      debugLog('Starting authentication for: ' + serverUrl);
      const authUrl = `${serverUrl}/Users/AuthenticateByName`;

      if (!username || !password) {
        throw new Error('Username and password are required');
      }

      const authData = {
        Username: username,
        Pw: password,
      };

      debugLog('Auth URL: ' + authUrl);
      debugLog(
        'Auth data: ' +
          JSON.stringify({
            Username: username,
            Pw: '[HIDDEN]',
          })
      );

      const httpClient = this.getHttpClient();
      try {
        debugLog('Checking server reachability...');
        const publicInfoResponse = await httpClient.get(`${serverUrl}/System/Info/Public`);
        debugLog('Server public info: ' + JSON.stringify(publicInfoResponse));
        debugLog('Server is reachable');
      } catch (serverError) {
        debugLog('Server reachability check failed: ' + serverError);
        debugLog(
          'Error details: ' +
            JSON.stringify({
              message: serverError.message,
              status: serverError.status,
              statusText: serverError.statusText,
            })
        );
        debugLog('Warning: Server reachability check failed, but proceeding with authentication');
      }

      const response = await httpClient.post(authUrl, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Emby-Authorization': `Emby UserId="${username}", Client="IINA Jellyfin Plugin", Device="IINA", DeviceId="IINA-${Date.now()}", Version="0.0.1", Token=""`,
        },
        data: JSON.stringify(authData),
      });

      debugLog('Auth response status: ' + response.status);
      debugLog('Auth response data: ' + JSON.stringify(response.data));
      debugLog('Auth response headers: ' + JSON.stringify(response.headers));

      if (response.data && response.data.AccessToken) {
        debugLog('Authentication successful');
        let serverName = serverUrl;
        try {
          const infoResponse = await httpClient.get(`${serverUrl}/System/Info/Public`);
          if (infoResponse.data && infoResponse.data.ServerName) {
            serverName = infoResponse.data.ServerName;
          }
        } catch (infoError) {
          debugLog('Could not get server info: ' + infoError);
        }

        return {
          success: true,
          user: response.data.User,
          accessToken: response.data.AccessToken,
          serverName: serverName,
        };
      } else {
        debugLog('Authentication failed - no access token in response');
        debugLog('Response data details: ' + JSON.stringify(response.data, null, 2));

        if (response.data && response.data.error) {
          return {
            success: false,
            error: `Authentication failed: ${response.data.error}`,
          };
        } else if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid username or password',
          };
        } else if (response.status === 403) {
          return {
            success: false,
            error: 'Access forbidden - check user permissions',
          };
        } else {
          return {
            success: false,
            error: `Authentication failed with status ${response.status}`,
          };
        }
      }
    } catch (error) {
      debugLog('Auth error details:', error);
      debugLog('Auth error message:', error.message);
      debugLog('Auth error status:', error.status);
      debugLog('Auth error statusText:', error.statusText);

      if (error.status === 401) {
        return {
          success: false,
          error: 'Invalid username or password',
        };
      } else if (error.status === 403) {
        return {
          success: false,
          error: 'Access forbidden - check user permissions',
        };
      } else if (error.status === 404) {
        return {
          success: false,
          error: 'Authentication endpoint not found - check server URL',
        };
      } else if (error.message && error.message.includes('Network')) {
        return {
          success: false,
          error: 'Network error - check server URL and connectivity',
        };
      } else {
        return {
          success: false,
          error: `Authentication failed: ${error.message || 'Unknown error'}`,
        };
      }
    }
  }

  // DOM helpers

  _updateServerStatus(message, status = '') {
    const statusEl = document.getElementById('serverStatus');
    statusEl.textContent = message;
    statusEl.className = `server-status ${status}`;
  }

  _showConnectButton() {
    document.getElementById('connectBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'none';
  }

  _showLogoutButton() {
    document.getElementById('connectBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
  }

  _showLoginForm() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('serverUrl').focus();
  }

  _hideLoginForm() {
    document.getElementById('loginSection').style.display = 'none';
    this._clearLoginForm();
  }

  _clearLoginForm() {
    document.getElementById('serverUrl').value = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').textContent = '';
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.Authentication = Authentication;
