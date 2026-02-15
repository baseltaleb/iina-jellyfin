/**
 * HomeTab Component
 * Thin orchestrator that composes ContinueWatchingRow, NextUpRow, and RecentlyAddedRow
 */

/* global ContinueWatchingRow, NextUpRow, RecentlyAddedRow, debugLog */

class HomeTab {
  /**
   * @param {Object} options
   * @param {string} options.containerSelector - CSS selector for the home tab container
   * @param {Function} options.getBrowser - Function that returns the JellyfinBrowser instance
   */
  constructor({ containerSelector, getBrowser }) {
    this.containerSelector = containerSelector;
    this.getBrowser = getBrowser;

    this.rows = null;
    this.loaded = false;
  }

  /**
   * Called when the tab becomes active
   */
  onActivate() {
    if (!this.rows) {
      this.initRows();
    }

    if (this.rows) {
      this.rows.continueWatching.onActivate();
      this.rows.nextUp.onActivate();
      this.rows.recentlyAdded.onActivate();
    }
  }

  /**
   * Initialize the data row components
   */
  initRows() {
    this.rows = {
      continueWatching: new ContinueWatchingRow({
        containerSelector: `${this.containerSelector} #continueWatchingRow`,
        getBrowser: this.getBrowser,
      }),
      nextUp: new NextUpRow({
        containerSelector: `${this.containerSelector} #nextUpRow`,
        getBrowser: this.getBrowser,
      }),
      recentlyAdded: new RecentlyAddedRow({
        containerSelector: `${this.containerSelector} #recentlyAddedRow`,
        getBrowser: this.getBrowser,
      }),
    };

    debugLog('HomeTab: Initialized all rows');
  }

  /**
   * Force reload all rows
   */
  refresh() {
    if (this.rows) {
      this.rows.continueWatching.refresh();
      this.rows.nextUp.refresh();
      this.rows.recentlyAdded.refresh();
    }
  }

  /**
   * Reset all rows
   */
  reset() {
    this.loaded = false;

    if (this.rows) {
      this.rows.continueWatching.reset();
      this.rows.nextUp.reset();
      this.rows.recentlyAdded.reset();
    }
  }
}

// Expose for global access (IINA webview doesn't support ES modules)
window.HomeTab = HomeTab;
