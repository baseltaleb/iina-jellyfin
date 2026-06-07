// Inafin — Screen Components
// All screens fetch real data from Jellyfin via INAFIN_API.

/* ─── Login Screen ─── */
function LoginScreen({ onLogin }) {
  var [server, setServer] = React.useState('');
  var [user, setUser] = React.useState('');
  var [pass, setPass] = React.useState('');
  var [loading, setLoading] = React.useState(false);
  var [error, setError] = React.useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!server || !user || !pass) { setError('All fields are required.'); return; }
    setLoading(true); setError('');
    INAFIN_API.login(server, user, pass)
      .then(function (s) { setLoading(false); onLogin(s); })
      .catch(function (e) { setLoading(false); setError(e.message || 'Authentication failed'); });
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="login-corner tl"></span><span className="login-corner tr"></span>
        <span className="login-corner bl"></span><span className="login-corner br"></span>
        <div className="login-scan"></div>
        <div className="login-brand">
          <span className="wordmark">inafin</span>
          <span className="tag">MEDIA</span>
        </div>
        <div className="login-field">
          <label>SERVER ADDRESS</label>
          <input type="text" placeholder="jellyfin.example.com" value={server} onChange={function (e) { setServer(e.target.value); }} />
        </div>
        <div className="login-field">
          <label>USERNAME</label>
          <input type="text" placeholder="admin" value={user} onChange={function (e) { setUser(e.target.value); }} />
        </div>
        <div className="login-field">
          <label>PASSWORD</label>
          <input type="password" placeholder="••••••••" value={pass} onChange={function (e) { setPass(e.target.value); }} />
        </div>
        <button className="login-btn" type="submit" disabled={loading}>{loading ? 'CONNECTING...' : 'CONNECT'}</button>
        {error && <div className="login-error">{error}</div>}
      </form>
    </div>
  );
}

/* ─── Home Screen ─── */
function HomeScreen({ session, onItemPlay, onShowSelect, onNav }) {
  var toast = useToast();
  var [cw, setCw] = React.useState([]);
  var [nu, setNu] = React.useState([]);
  var [ra, setRa] = React.useState([]);
  var [cwLoading, setCwLoading] = React.useState(true);
  var [cwError, setCwError] = React.useState(null);
  var [nuLoading, setNuLoading] = React.useState(true);
  var [raLoading, setRaLoading] = React.useState(true);

  function loadCw() {
    setCwLoading(true); setCwError(null);
    INAFIN_API.fetchContinueWatching(session)
      .then(function (d) { setCw(d); setCwLoading(false); })
      .catch(function (e) { setCwError(e.message || 'Failed to load'); setCwLoading(false); });
  }

  React.useEffect(function () {
    loadCw();
    INAFIN_API.fetchNextUp(session)
      .then(function (d) { setNu(d); setNuLoading(false); })
      .catch(function () { setNuLoading(false); });
    INAFIN_API.fetchRecentlyAdded(session)
      .then(function (d) { setRa(d); setRaLoading(false); })
      .catch(function () { setRaLoading(false); });
  }, []);

  return (
    <div className="page-enter" key="home">
      {/* Continue Watching */}
      <SectionHeader label="CONTINUE WATCHING" meta={cw.length > 0 ? cw.length + ' ITEMS' : ''} />
      {cwLoading && <LoadingState />}
      {cwError && <ErrorBanner message={cwError} onRetry={loadCw} />}
      {!cwLoading && !cwError && cw.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.08em', padding: '16px 0' }}>Nothing in progress</div>
      )}
      {!cwLoading && !cwError && cw.length > 0 && (
        <div className="media-row">
          {cw.map(function (item, i) {
            return <ContinueCard key={i} item={item} size="md" session={session} onClick={function () {
              if (item.type === 'movie') onItemPlay(item.id, item.title);
              else onShowSelect(item.id);
            }} />;
          })}
        </div>
      )}

      {/* Next Up */}
      {(nuLoading || nu.length > 0) && <SectionHeader label="NEXT UP" meta="EPISODES" />}
      {nuLoading && <LoadingState />}
      {!nuLoading && nu.length > 0 && (
        <div className="media-row">
          {nu.map(function (item, i) {
            return <EpisodeCard key={i} item={item} session={session} onClick={function () { onShowSelect(item.id); }} />;
          })}
        </div>
      )}

      {/* Recently Added */}
      <SectionHeader label="RECENTLY ADDED" onSeeAll={function () { onNav('recent'); }} />
      {raLoading && <LoadingState />}
      {!raLoading && ra.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', letterSpacing: '0.08em', padding: '16px 0' }}>Nothing recently added</div>
      )}
      {!raLoading && ra.length > 0 && (
        <div className="media-row">
          {ra.map(function (item, i) {
            if (item.type === 'show') {
              return <PosterCard key={i} title={item.title} year={item.year} size="md"
                       itemId={item.id} session={session}
                       subtitle={item.addedAgo} showPlay={false}
                       onClick={function () { onShowSelect(item.id); }} />;
            }
            return <PosterCard key={i} title={item.title} year={item.year} size="md"
                     itemId={item.id} session={session}
                     subtitle={item.addedAgo}
                     onClick={function () { onItemPlay(item.id, item.title); }} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Movies Screen ─── */
function MoviesScreen({ session, onItemPlay }) {
  var [items, setItems] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [error, setError] = React.useState(null);
  var [sort, setSort] = React.useState('title');

  function load() {
    setLoading(true); setError(null);
    INAFIN_API.fetchMovies(session, sort)
      .then(function (d) { setItems(d); setLoading(false); })
      .catch(function (e) { setError(e.message || 'Failed to load'); setLoading(false); });
  }

  React.useEffect(function () { load(); }, [sort]);

  return (
    <div className="page-enter" key="movies">
      <div className="page-head">
        <div>
          <span className="eyebrow-top">LIBRARY · FILMS</span>
          <h2>Movies</h2>
        </div>
        <div className="sort-controls">
          <button className={'sort-btn' + (sort === 'title' ? ' on' : '')} onClick={function () { setSort('title'); }}>A→Z</button>
          <button className={'sort-btn' + (sort === 'year' ? ' on' : '')} onClick={function () { setSort('year'); }}>YEAR</button>
          <button className={'sort-btn' + (sort === 'recent' ? ' on' : '')} onClick={function () { setSort('recent'); }}>ADDED</button>
        </div>
      </div>
      {loading && <LoadingState />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', letterSpacing: '0.08em', textAlign: 'center', padding: '60px 0' }}>NO MOVIES FOUND</div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="media-grid">
          {items.map(function (m) {
            return <PosterCard key={m.id} title={m.title} year={m.year} genres={m.genres}
                     itemId={m.id} session={session} watched={m.watched}
                     onClick={function () { onItemPlay(m.id, m.title); }} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Shows Screen ─── */
function ShowsScreen({ session, onShowSelect }) {
  var [items, setItems] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [error, setError] = React.useState(null);
  var [sort, setSort] = React.useState('title');

  function load() {
    setLoading(true); setError(null);
    INAFIN_API.fetchShows(session, sort)
      .then(function (d) { setItems(d); setLoading(false); })
      .catch(function (e) { setError(e.message || 'Failed to load'); setLoading(false); });
  }

  React.useEffect(function () { load(); }, [sort]);

  return (
    <div className="page-enter" key="shows">
      <div className="page-head">
        <div>
          <span className="eyebrow-top">LIBRARY · SERIES</span>
          <h2>TV Shows</h2>
        </div>
        <div className="sort-controls">
          <button className={'sort-btn' + (sort === 'title' ? ' on' : '')} onClick={function () { setSort('title'); }}>A→Z</button>
          <button className={'sort-btn' + (sort === 'year' ? ' on' : '')} onClick={function () { setSort('year'); }}>YEAR</button>
        </div>
      </div>
      {loading && <LoadingState />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', letterSpacing: '0.08em', textAlign: 'center', padding: '60px 0' }}>NO SHOWS FOUND</div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="media-grid">
          {items.map(function (s) {
            return <PosterCard key={s.id} title={s.title} year={s.year} genres={s.genres}
                     itemId={s.id} session={session}
                     subtitle={s.seasonCount > 0 ? s.seasonCount + ' season' + (s.seasonCount > 1 ? 's' : '') : ''}
                     showPlay={false}
                     onClick={function () { onShowSelect(s.id); }} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Recent Screen ─── */
function RecentScreen({ session, onItemPlay, onShowSelect }) {
  var [items, setItems] = React.useState([]);
  var [loading, setLoading] = React.useState(true);
  var [error, setError] = React.useState(null);

  function load() {
    setLoading(true); setError(null);
    INAFIN_API.fetchRecentlyAdded(session)
      .then(function (d) { setItems(d); setLoading(false); })
      .catch(function (e) { setError(e.message || 'Failed to load'); setLoading(false); });
  }

  React.useEffect(function () { load(); }, []);

  return (
    <div className="page-enter" key="recent">
      <div className="page-head">
        <div>
          <span className="eyebrow-top">LIBRARY · RECENT</span>
          <h2>Recently added</h2>
        </div>
      </div>
      {loading && <LoadingState />}
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!loading && !error && (
        <div className="media-grid">
          {items.map(function (item, i) {
            if (item.type === 'show') {
              return <PosterCard key={i} title={item.title} year={item.year}
                       itemId={item.id} session={session}
                       subtitle={item.addedAgo} showPlay={false}
                       onClick={function () { onShowSelect(item.id); }} />;
            }
            return <PosterCard key={i} title={item.title} year={item.year}
                     itemId={item.id} session={session}
                     subtitle={item.addedAgo}
                     onClick={function () { onItemPlay(item.id, item.title); }} />;
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Series Detail ─── */
function SeriesDetail({ session, showId, onBack, onItemPlay }) {
  var [show, setShow] = React.useState(null);
  var [loading, setLoading] = React.useState(true);
  var [error, setError] = React.useState(null);
  var [activeSeason, setActiveSeason] = React.useState(0);
  var toast = useToast();

  function load() {
    setLoading(true); setError(null);
    INAFIN_API.fetchSeriesDetail(session, showId)
      .then(function (d) { setShow(d); setLoading(false); setActiveSeason(0); })
      .catch(function (e) { setError(e.message || 'Failed to load'); setLoading(false); });
  }

  React.useEffect(function () { load(); }, [showId]);

  if (loading) return (
    <div className="page-enter">
      <button className="series-back" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <LoadingState />
    </div>
  );

  if (error) return (
    <div className="page-enter">
      <button className="series-back" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <ErrorBanner message={error} onRetry={load} />
    </div>
  );

  if (!show) return null;

  var season = show.seasons[activeSeason] || { episodes: [] };

  // Find next unwatched episode
  var nextEp = null;
  for (var s = 0; s < show.seasons.length && !nextEp; s++) {
    for (var e = 0; e < show.seasons[s].episodes.length; e++) {
      if (show.seasons[s].episodes[e].watched < 1) {
        nextEp = {
          season: show.seasons[s].num,
          episode: show.seasons[s].episodes[e].num,
          id: show.seasons[s].episodes[e].id,
          title: show.seasons[s].episodes[e].title,
        };
        break;
      }
    }
  }

  return (
    <div className="page-enter" key={'series-' + showId}>
      <button className="series-back" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>

      <div className="series-hero" style={{ background: INAFIN.posterGradient(show.title) }}>
        <h2 className="series-title">{show.title}</h2>
        <div className="series-meta-row">
          <span className="series-meta-item">{show.year}</span>
          <span className="series-meta-item">{show.seasons.length} SEASON{show.seasons.length > 1 ? 'S' : ''}</span>
          {show.genres.map(function (g) { return <span key={g} className="series-genre">{g}</span>; })}
        </div>
        {show.overview && <p className="series-overview">{show.overview}</p>}
        {nextEp && (
          <button className="series-play-btn" onClick={function () {
            onItemPlay(nextEp.id, show.title + ' S' + nextEp.season + 'E' + nextEp.episode);
          }}>
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8,5 19,12 8,19"/></svg>
            PLAY S{nextEp.season}E{nextEp.episode}
          </button>
        )}
      </div>

      <div className="season-tabs">
        {show.seasons.map(function (s, idx) {
          return <button key={s.num} className={'season-tab' + (activeSeason === idx ? ' on' : '')}
                        onClick={function () { setActiveSeason(idx); }}>Season {s.num}</button>;
        })}
      </div>

      <div className="episode-list">
        {season.episodes.map(function (ep) {
          return (
            <div key={ep.num} className="episode-row" onClick={function () {
              onItemPlay(ep.id, show.title + ' S' + season.num + 'E' + ep.num);
            }}>
              <span className="ep-num">{String(ep.num).padStart(2, '0')}</span>
              <span className="ep-row-title">{ep.title}</span>
              <span className="ep-row-runtime">{ep.runtime}</span>
              <span className="ep-row-status">
                {ep.watched >= 1 ? <span className="ep-watched-dot"></span>
                  : ep.watched > 0 ? <div className="ep-partial-bar"><div className="ep-partial-fill" style={{ width: (ep.watched * 100) + '%' }}></div></div>
                  : <span className="ep-unplayed-dot"></span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Settings Screen ─── */
function SettingsScreen({ tweaks, setTweak, session, onLogout }) {
  var accentOptions = [
    { id: 'plasma',  label: 'PLASMA',  color: '#14c2ee' },
    { id: 'ember',   label: 'EMBER',   color: '#ff7a2e' },
    { id: 'ion',     label: 'ION',     color: '#6f4cf5' },
    { id: 'verdant', label: 'VERDANT', color: '#16c98a' },
  ];

  React.useEffect(function () { if (window.lucide) window.lucide.createIcons(); });

  return (
    <div className="page-enter" key="settings">
      <div className="page-head">
        <div>
          <span className="eyebrow-top">SYSTEM · PREFERENCES</span>
          <h2>Settings</h2>
        </div>
      </div>

      <div className="settings-grid">
        {/* Appearance */}
        <div className="settings-card">
          <div className="settings-card-head">
            <i data-lucide="palette"></i>
            <span>Appearance</span>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Accent color</span>
              <span className="settings-label-desc">Interface highlight color</span>
            </div>
            <div className="accent-swatches">
              {accentOptions.map(function (opt) {
                return (
                  <button key={opt.id}
                    className={'accent-swatch' + (tweaks.accentColor === opt.id ? ' on' : '')}
                    onClick={function () { setTweak('accentColor', opt.id); }}
                    title={opt.label}>
                    <span className="swatch-fill" style={{ background: opt.color }}></span>
                    <span className="swatch-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-sep"></div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Background pattern</span>
              <span className="settings-label-desc">Dotted grid overlay on surfaces</span>
            </div>
            <button className={'settings-toggle' + (tweaks.showPattern ? ' on' : '')}
                    onClick={function () { setTweak('showPattern', !tweaks.showPattern); }}>
              <span className="settings-toggle-knob"></span>
            </button>
          </div>
        </div>

        {/* Library */}
        <div className="settings-card">
          <div className="settings-card-head">
            <i data-lucide="layout-grid"></i>
            <span>Library</span>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Poster style</span>
              <span className="settings-label-desc">Artwork aspect ratio in grids</span>
            </div>
            <div className="settings-seg">
              {['portrait', 'landscape'].map(function (v) {
                return <button key={v} className={'settings-seg-btn' + (tweaks.posterAspect === v ? ' on' : '')}
                              onClick={function () { setTweak('posterAspect', v); }}>{v === 'portrait' ? '2:3' : '16:9'}</button>;
              })}
            </div>
          </div>

          <div className="settings-sep"></div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Grid density</span>
              <span className="settings-label-desc">Content spacing in catalogue views</span>
            </div>
            <div className="settings-seg">
              {['compact', 'balanced', 'spacious'].map(function (v) {
                return <button key={v} className={'settings-seg-btn' + (tweaks.gridDensity === v ? ' on' : '')}
                              onClick={function () { setTweak('gridDensity', v); }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>;
              })}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="settings-card">
          <div className="settings-card-head">
            <i data-lucide="panel-left"></i>
            <span>Navigation</span>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Nav layout</span>
              <span className="settings-label-desc">Position and style of the navigation bar</span>
            </div>
            <div className="settings-seg">
              {[{v:'sidebar',l:'Sidebar'},{v:'compact',l:'Compact'},{v:'topnav',l:'Top'}].map(function (opt) {
                return <button key={opt.v} className={'settings-seg-btn' + (tweaks.navStyle === opt.v ? ' on' : '')}
                              onClick={function () { setTweak('navStyle', opt.v); }}>{opt.l}</button>;
              })}
            </div>
          </div>
        </div>

        {/* Connection */}
        <div className="settings-card">
          <div className="settings-card-head">
            <i data-lucide="server"></i>
            <span>Connection</span>
          </div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Server</span>
              <span className="settings-label-desc">{session.server}</span>
            </div>
            <span className="settings-status-badge"><span className="dot"></span>CONNECTED</span>
          </div>

          <div className="settings-sep"></div>

          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-label-title">Account</span>
              <span className="settings-label-desc">{session.user}</span>
            </div>
            <button className="settings-logout-btn" onClick={onLogout}>
              <i data-lucide="log-out"></i>
              LOG OUT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export
Object.assign(window, {
  LoginScreen: LoginScreen,
  HomeScreen: HomeScreen,
  MoviesScreen: MoviesScreen,
  ShowsScreen: ShowsScreen,
  RecentScreen: RecentScreen,
  SeriesDetail: SeriesDetail,
  SettingsScreen: SettingsScreen,
});
