// Inafin — Jellyfin API bridge
// Replaces the static mock data with real Jellyfin API calls.
// Sets window.INAFIN (visual utilities) and window.INAFIN_API (async data fetchers).

(function () {

  // ── Visual utilities (same as design prototype) ──────────────────────────

  function posterGradient(title) {
    let h = 0;
    for (let i = 0; i < title.length; i++) h = ((h << 5) - h) + title.charCodeAt(i);
    h = Math.abs(h);
    const hue = h % 360;
    const hue2 = (hue + 40) % 360;
    const angle = 140 + ((h >> 4) % 50);
    return 'linear-gradient(' + angle + 'deg, hsl(' + hue + ', 30%, 12%), hsl(' + hue2 + ', 40%, 22%))';
  }

  function getInitials(title) {
    return title.replace(/^(The |A |An )/i, '').split(/[\s:\-–]+/).map(function (w) { return w[0]; }).filter(function (c) { return c && /[A-Za-z0-9]/.test(c); }).slice(0, 2).join('').toUpperCase();
  }

  function getImageUrl(session, itemId, maxWidth) {
    return session.url + '/Items/' + itemId + '/Images/Primary?maxWidth=' + (maxWidth || 300) + '&api_key=' + session.accessToken;
  }

  // ── Data helpers ──────────────────────────────────────────────────────────

  function ticksToRuntime(ticks) {
    if (!ticks) return '';
    const totalMinutes = Math.round(ticks / 600000000);
    if (totalMinutes >= 60) {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return h + 'h' + (m > 0 ? ' ' + m + 'm' : '');
    }
    return totalMinutes + 'm';
  }

  function ticksToTimeLeft(totalTicks, playedTicks) {
    if (!totalTicks) return '';
    const remaining = totalTicks - (playedTicks || 0);
    const mins = Math.round(remaining / 600000000);
    if (mins <= 0) return '';
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h + 'h' + (m > 0 ? ' ' + m + 'm' : '') + ' remaining';
    }
    return mins + 'm remaining';
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    const weeks = Math.floor(days / 7);
    if (weeks === 1) return '1 week ago';
    if (weeks < 4) return weeks + ' weeks ago';
    const months = Math.floor(days / 30);
    if (months === 1) return '1 month ago';
    return months + ' months ago';
  }

  function normalizeUrl(url) {
    url = url.trim().replace(/\/$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    return url;
  }

  // ── API plumbing ──────────────────────────────────────────────────────────

  function apiGet(session, path, params) {
    const qs = new URLSearchParams(Object.assign({ api_key: session.accessToken }, params || {}));
    return fetch(session.url + path + '?' + qs.toString()).then(function (r) {
      if (!r.ok) throw new Error('API error ' + r.status);
      return r.json();
    });
  }

  // ── Public API functions ──────────────────────────────────────────────────

  async function login(serverInput, username, password) {
    const url = normalizeUrl(serverInput);
    const res = await fetch(url + '/Users/AuthenticateByName', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Authorization': 'MediaBrowser Client="Inafin", Device="Browser", DeviceId="inafin-browser", Version="1.0"',
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.Message || 'Authentication failed';
      throw new Error(msg + ' (' + res.status + ')');
    }
    const data = await res.json();
    return {
      url: url,
      server: url.replace(/^https?:\/\//, ''),
      user: data.User.Name,
      userId: data.User.Id,
      accessToken: data.AccessToken,
      initials: data.User.Name.slice(0, 2).toUpperCase(),
    };
  }

  async function fetchContinueWatching(session) {
    const data = await apiGet(session, '/Users/' + session.userId + '/Items', {
      Filters: 'IsResumable',
      Recursive: true,
      IncludeItemTypes: 'Movie,Episode',
      Fields: 'UserData,RunTimeTicks',
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Limit: 10,
    });
    return (data.Items || []).map(function (item) {
      const pct = (item.UserData && item.UserData.PlayedPercentage) ? item.UserData.PlayedPercentage / 100 : 0;
      const played = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;
      if (item.Type === 'Episode') {
        return {
          type: 'episode',
          id: item.SeriesId || item.Id,
          episodeId: item.Id,
          showTitle: item.SeriesName || item.Name,
          season: item.ParentIndexNumber || 1,
          episode: item.IndexNumber || 1,
          epTitle: item.Name,
          progress: pct,
          timeLeft: ticksToTimeLeft(item.RunTimeTicks, played),
        };
      }
      return {
        type: 'movie',
        id: item.Id,
        title: item.Name,
        year: item.ProductionYear,
        progress: pct,
        timeLeft: ticksToTimeLeft(item.RunTimeTicks, played),
      };
    });
  }

  async function fetchNextUp(session) {
    const data = await apiGet(session, '/Shows/NextUp', {
      userId: session.userId,
      Fields: 'UserData,RunTimeTicks',
      Limit: 10,
    });
    return (data.Items || []).map(function (item) {
      return {
        id: item.SeriesId || item.Id,
        episodeId: item.Id,
        showTitle: item.SeriesName || item.Name,
        season: item.ParentIndexNumber || 1,
        episode: item.IndexNumber || 1,
        epTitle: item.Name,
        runtime: ticksToRuntime(item.RunTimeTicks),
      };
    });
  }

  async function fetchRecentlyAdded(session) {
    const data = await apiGet(session, '/Users/' + session.userId + '/Items/Latest', {
      IncludeItemTypes: 'Movie,Series',
      Fields: 'DateCreated,UserData',
      Limit: 12,
    });
    return (data || []).map(function (item) {
      if (item.Type === 'Series') {
        return { type: 'show', id: item.Id, title: item.Name, year: item.ProductionYear, addedAgo: timeAgo(item.DateCreated) };
      }
      return { type: 'movie', id: item.Id, title: item.Name, year: item.ProductionYear, addedAgo: timeAgo(item.DateCreated) };
    });
  }

  async function fetchMovies(session, sortBy) {
    const sortMap = { title: 'SortName', year: 'ProductionYear', recent: 'DateCreated' };
    const data = await apiGet(session, '/Users/' + session.userId + '/Items', {
      IncludeItemTypes: 'Movie',
      Recursive: true,
      Fields: 'Genres,UserData,RunTimeTicks',
      SortBy: sortMap[sortBy] || 'SortName',
      SortOrder: (sortBy === 'year' || sortBy === 'recent') ? 'Descending' : 'Ascending',
      Limit: 200,
    });
    return (data.Items || []).map(function (m) {
      return {
        id: m.Id,
        title: m.Name,
        year: m.ProductionYear,
        runtime: ticksToRuntime(m.RunTimeTicks),
        genres: m.Genres || [],
        watched: (m.UserData && m.UserData.Played) ? 1 : 0,
      };
    });
  }

  async function fetchShows(session, sortBy) {
    const sortMap = { title: 'SortName', year: 'ProductionYear' };
    const data = await apiGet(session, '/Users/' + session.userId + '/Items', {
      IncludeItemTypes: 'Series',
      Recursive: true,
      Fields: 'Genres,UserData,ChildCount',
      SortBy: sortMap[sortBy] || 'SortName',
      SortOrder: sortBy === 'year' ? 'Descending' : 'Ascending',
      Limit: 200,
    });
    return (data.Items || []).filter(function (s) {
      return !s.ChildCount || s.ChildCount > 0;
    }).map(function (s) {
      return {
        id: s.Id,
        title: s.Name,
        year: s.ProductionYear,
        genres: s.Genres || [],
        seasonCount: s.ChildCount || 0,
      };
    });
  }

  async function fetchSeriesDetail(session, showId) {
    const showData = await apiGet(session, '/Users/' + session.userId + '/Items/' + showId, {
      Fields: 'Genres,Overview',
    });
    const seasonsData = await apiGet(session, '/Shows/' + showId + '/Seasons', {
      userId: session.userId,
      Fields: 'UserData',
    });

    const seasons = await Promise.all((seasonsData.Items || []).map(async function (season) {
      const epData = await apiGet(session, '/Shows/' + showId + '/Episodes', {
        seasonId: season.Id,
        userId: session.userId,
        Fields: 'UserData,RunTimeTicks',
      });
      return {
        num: season.IndexNumber || 1,
        id: season.Id,
        year: season.ProductionYear,
        episodes: (epData.Items || []).map(function (ep) {
          const pct = (ep.UserData && ep.UserData.PlayedPercentage) ? ep.UserData.PlayedPercentage / 100 : 0;
          return {
            num: ep.IndexNumber || 1,
            id: ep.Id,
            title: ep.Name,
            runtime: ticksToRuntime(ep.RunTimeTicks),
            watched: (ep.UserData && ep.UserData.Played) ? 1.0 :
                     (ep.UserData && ep.UserData.PlaybackPositionTicks > 0) ? pct : 0,
          };
        }),
      };
    }));

    return {
      id: showId,
      title: showData.Name,
      year: showData.ProductionYear,
      genres: showData.Genres || [],
      overview: showData.Overview || '',
      seasons: seasons,
    };
  }

  async function searchItems(session, query) {
    const data = await apiGet(session, '/Search/Hints', {
      userId: session.userId,
      searchTerm: query,
      IncludeItemTypes: 'Movie,Series',
      Limit: 10,
    });
    const movies = [];
    const shows = [];
    (data.SearchHints || []).forEach(function (item) {
      if (item.Type === 'Movie') {
        movies.push({ id: item.ItemId, title: item.Name, year: item.ProductionYear, runtime: '', genres: [] });
      } else if (item.Type === 'Series') {
        shows.push({ id: item.ItemId, title: item.Name, year: item.ProductionYear, genres: [], seasonCount: 0 });
      }
    });
    return { movies: movies, shows: shows };
  }

  function getStreamUrl(session, itemId) {
    return session.url + '/Videos/' + itemId + '/stream?Static=true&api_key=' + session.accessToken;
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  window.INAFIN = {
    posterGradient: posterGradient,
    getInitials: getInitials,
    getImageUrl: getImageUrl,
  };

  window.INAFIN_API = {
    login: login,
    fetchContinueWatching: fetchContinueWatching,
    fetchNextUp: fetchNextUp,
    fetchRecentlyAdded: fetchRecentlyAdded,
    fetchMovies: fetchMovies,
    fetchShows: fetchShows,
    fetchSeriesDetail: fetchSeriesDetail,
    search: searchItems,
    getStreamUrl: getStreamUrl,
  };

})();
