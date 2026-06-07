// Inafin — Reusable UI Components
// Adapted from the design prototype to support real Jellyfin poster images.

/* ─── Poster Art (with real image + gradient fallback) ─── */
function PosterArt({ title, itemId, session }) {
  var [imgFailed, setImgFailed] = React.useState(false);
  var grad = INAFIN.posterGradient(title);
  var ini = INAFIN.getInitials(title);
  var imgUrl = (session && itemId && !imgFailed) ? INAFIN.getImageUrl(session, itemId) : null;

  return (
    <div className="poster-art-inner" style={{ background: grad }}>
      {imgUrl ? (
        <img src={imgUrl} alt={title} onError={function () { setImgFailed(true); }} />
      ) : (
        <span className="poster-mono">{ini}</span>
      )}
    </div>
  );
}

/* ─── Poster Card ─── */
function PosterCard({ title, year, genres, progress, watched, size = 'md', onClick, showPlay = true, subtitle, itemId, session }) {
  return (
    <div className={'poster-card sz-' + size} onClick={onClick}>
      <div className="poster-art">
        <PosterArt title={title} itemId={itemId} session={session} />
        {showPlay && (
          <div className="poster-play">
            <div className="poster-play-icon"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8,5 19,12 8,19"/></svg></div>
          </div>
        )}
        <div className="poster-brackets">
          <span className="b-tl"></span><span className="b-tr"></span>
          <span className="b-bl"></span><span className="b-br"></span>
        </div>
        {typeof progress === 'number' && progress > 0 && progress < 1 && (
          <div className="poster-progress"><div className="poster-progress-fill" style={{ width: (progress * 100) + '%' }}></div></div>
        )}
        {watched === 1 && (
          <div className="poster-watched"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
        )}
      </div>
      <div className="poster-info">
        <div className="poster-title">{title}</div>
        <div className="poster-meta">{subtitle || [year, genres && genres[0]].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

/* ─── Continue Watching Card ─── */
function ContinueCard({ item, size = 'md', onClick, session }) {
  var displayTitle = item.type === 'movie' ? item.title : item.showTitle;
  var sub = item.type === 'movie' ? item.year : ('S' + item.season + ' · E' + item.episode);
  var imgId = item.type === 'movie' ? item.id : (item.episodeId || item.id);

  return (
    <div className={'poster-card cw-card sz-' + size} onClick={onClick}>
      <div className="poster-art">
        <PosterArt title={displayTitle} itemId={imgId} session={session} />
        <div className="poster-play">
          <div className="poster-play-icon"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8,5 19,12 8,19"/></svg></div>
        </div>
        <div className="poster-brackets">
          <span className="b-tl"></span><span className="b-tr"></span>
          <span className="b-bl"></span><span className="b-br"></span>
        </div>
        <div className="cw-label">
          <div className="cw-title">{displayTitle}</div>
          <div className="cw-sub">{sub}{item.timeLeft ? ' · ' + item.timeLeft : ''}</div>
        </div>
        {item.progress > 0 && (
          <div className="poster-progress"><div className="poster-progress-fill" style={{ width: (item.progress * 100) + '%' }}></div></div>
        )}
      </div>
    </div>
  );
}

/* ─── Episode Card (for Next Up rows) ─── */
function EpisodeCard({ item, onClick, session }) {
  var [imgFailed, setImgFailed] = React.useState(false);
  var grad = INAFIN.posterGradient(item.showTitle);
  var ini = INAFIN.getInitials(item.showTitle);
  var imgUrl = (session && item.episodeId && !imgFailed) ? INAFIN.getImageUrl(session, item.episodeId, 400) : null;

  return (
    <div className="ep-card" onClick={onClick}>
      <div className="ep-thumb" style={{ background: grad }}>
        {imgUrl ? (
          <img src={imgUrl} alt={item.showTitle} onError={function () { setImgFailed(true); }} />
        ) : (
          <span className="poster-mono">{ini}</span>
        )}
      </div>
      <div className="ep-info">
        <div className="ep-show">{item.showTitle}</div>
        <div className="ep-title">S{item.season}E{item.episode} · {item.epTitle}</div>
        <div className="ep-meta">{item.runtime}</div>
      </div>
    </div>
  );
}

/* ─── Section Header ─── */
function SectionHeader({ label, meta, onSeeAll }) {
  return (
    <div className="section-hdr">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="eyebrow">{'◇ ' + label}</span>
        {meta && <span className="meta">{meta}</span>}
      </div>
      {onSeeAll && <button className="see-all" onClick={onSeeAll}>VIEW ALL →</button>}
    </div>
  );
}

/* ─── Loading State ─── */
function LoadingState({ message }) {
  return (
    <div className="loading-state">{message || 'LOADING'}</div>
  );
}

/* ─── Top Bar ─── */
function InafinTopBar({ page, onNav, onSearch, session, onUserMenu }) {
  var [showMenu, setShowMenu] = React.useState(false);
  var menuRef = React.useRef(null);

  React.useEffect(function () {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    }
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return function () { document.removeEventListener('mousedown', handleClick); };
  }, [showMenu]);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-wordmark">inafin</span>
        <span className="topbar-tag">MEDIA</span>
        <span className="topbar-div"></span>
        <span className="topbar-status"><span className="dot"></span>CONNECTED</span>
      </div>
      <div className="topbar-mid">
        <div className="topbar-nav">
          {['home','movies','shows','recent'].map(function (p) {
            var labels = { home: 'Home', movies: 'Movies', shows: 'Shows', recent: 'Recent' };
            return <button key={p} className={'topbar-nav-item' + (page === p ? ' on' : '')} onClick={function() { onNav(p); }}>{labels[p]}</button>;
          })}
        </div>
        <button className="search-trigger" onClick={onSearch}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Search library</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>
      <div className="topbar-right" style={{ position: 'relative' }} ref={menuRef}>
        <span className="topbar-meta">SERVER <b>{session.server || '—'}</b></span>
        <div className="topbar-avatar" onClick={function () { setShowMenu(!showMenu); }}>{session.initials || '?'}</div>
        {showMenu && (
          <div className="user-menu">
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>{session.user}</div>
              <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginTop: 2 }}>{session.server}</div>
            </div>
            <div className="user-menu-sep"></div>
            <button className="user-menu-item" onClick={function () { setShowMenu(false); onUserMenu('settings'); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              Settings
            </button>
            <div className="user-menu-sep"></div>
            <button className="user-menu-item danger" onClick={function () { setShowMenu(false); onUserMenu('logout'); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sidebar ─── */
function InafinSidebar({ page, onNav }) {
  var items = [
    { id: 'home',   icon: 'home',    label: 'Home' },
    { id: 'movies', icon: 'film',    label: 'Movies' },
    { id: 'shows',  icon: 'tv',      label: 'TV Shows' },
    { id: 'recent', icon: 'clock',   label: 'Recent' },
  ];

  React.useEffect(function () { if (window.lucide) window.lucide.createIcons(); });

  return (
    <aside className="sidebar">
      <nav>
        {items.map(function (it) {
          return (
            <button key={it.id} className={'sidebar-item' + (page === it.id ? ' on' : '')}
                    onClick={function () { onNav(it.id); }}>
              <i data-lucide={it.icon}></i>
              <span className="sidebar-label">{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-count">JELLYFIN</div>
      </div>
    </aside>
  );
}

/* ─── Search Palette ─── */
function SearchPalette({ open, onClose, onSelect, session }) {
  var [query, setQuery] = React.useState('');
  var [focusIdx, setFocusIdx] = React.useState(0);
  var [results, setResults] = React.useState({ movies: [], shows: [] });
  var [searching, setSearching] = React.useState(false);
  var inputRef = React.useRef(null);

  React.useEffect(function () {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setFocusIdx(0);
      setResults({ movies: [], shows: [] });
    }
  }, [open]);

  // Debounced search
  React.useEffect(function () {
    if (!query.trim() || !session) { setResults({ movies: [], shows: [] }); return; }
    var cancelled = false;
    var timer = setTimeout(function () {
      setSearching(true);
      INAFIN_API.search(session, query)
        .then(function (r) { if (!cancelled) { setResults(r); setSearching(false); setFocusIdx(0); } })
        .catch(function () { if (!cancelled) setSearching(false); });
    }, 300);
    return function () { cancelled = true; clearTimeout(timer); };
  }, [query]);

  if (!open) return null;

  var allResults = results.movies.map(function (m) { return { type: 'movie', data: m }; })
    .concat(results.shows.map(function (s) { return { type: 'show', data: s }; }));

  function handleKey(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(function (i) { return Math.min(i + 1, allResults.length - 1); }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(function (i) { return Math.max(i - 1, 0); }); }
    if (e.key === 'Enter' && allResults[focusIdx]) { onSelect(allResults[focusIdx]); onClose(); }
  }

  return (
    <div className="search-shroud" onClick={function (e) { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-box" onKeyDown={handleKey}>
        <div className="search-input-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={query} onChange={function (e) { setQuery(e.target.value); setFocusIdx(0); }} placeholder="Search movies and series..." />
          <button className="search-esc" onClick={onClose}>ESC</button>
        </div>
        <div className="search-results">
          {searching && <div className="search-empty">SEARCHING…</div>}
          {!searching && !query && <div className="search-empty">Type to search your library</div>}
          {!searching && query && allResults.length === 0 && <div className="search-empty">No results for "{query}"</div>}
          {!searching && results.movies.length > 0 && <div className="search-group-label">MOVIES</div>}
          {!searching && results.movies.map(function (m, i) {
            var idx = i;
            return (
              <button key={m.id} className={'search-item' + (focusIdx === idx ? ' on' : '')}
                      onClick={function () { onSelect({ type: 'movie', data: m }); onClose(); }}
                      onMouseEnter={function () { setFocusIdx(idx); }}>
                <div className="search-item-poster" style={{ background: INAFIN.posterGradient(m.title) }}>
                  {session && <img src={INAFIN.getImageUrl(session, m.id, 64)} alt="" onError={function(e) { e.target.style.display='none'; }} />}
                  <span className="poster-mono">{INAFIN.getInitials(m.title)}</span>
                </div>
                <div className="search-item-info">
                  <div className="search-item-title">{m.title}</div>
                  <div className="search-item-meta">{[m.year, m.genres && m.genres[0]].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            );
          })}
          {!searching && results.shows.length > 0 && <div className="search-group-label">SERIES</div>}
          {!searching && results.shows.map(function (s, j) {
            var idx = results.movies.length + j;
            return (
              <button key={s.id} className={'search-item' + (focusIdx === idx ? ' on' : '')}
                      onClick={function () { onSelect({ type: 'show', data: s }); onClose(); }}
                      onMouseEnter={function () { setFocusIdx(idx); }}>
                <div className="search-item-poster" style={{ background: INAFIN.posterGradient(s.title) }}>
                  {session && <img src={INAFIN.getImageUrl(session, s.id, 64)} alt="" onError={function(e) { e.target.style.display='none'; }} />}
                  <span className="poster-mono">{INAFIN.getInitials(s.title)}</span>
                </div>
                <div className="search-item-info">
                  <div className="search-item-title">{s.title}</div>
                  <div className="search-item-meta">{[s.year, s.seasonCount > 0 ? s.seasonCount + ' season' + (s.seasonCount > 1 ? 's' : '') : null].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="search-foot">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Toast System ─── */
var ToastContext = React.createContext(null);

function ToastProvider({ children }) {
  var [toasts, setToasts] = React.useState([]);
  var idRef = React.useRef(0);

  function addToast(msg) {
    var id = ++idRef.current;
    setToasts(function (t) { return t.concat({ id: id, msg: msg }); });
    setTimeout(function () {
      setToasts(function (t) { return t.map(function (x) { return x.id === id ? Object.assign({}, x, { leaving: true }) : x; }); });
      setTimeout(function () { setToasts(function (t) { return t.filter(function (x) { return x.id !== id; }); }); }, 200);
    }, 2500);
  }

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(function (t) {
          return <div key={t.id} className={'toast' + (t.leaving ? ' leaving' : '')}><span className="toast-dot"></span>{t.msg}</div>;
        })}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() { return React.useContext(ToastContext); }

/* ─── Error Banner ─── */
function ErrorBanner({ message, onRetry }) {
  return (
    <div className="error-banner">
      <span className="error-icon">✕</span>
      <span className="error-msg">{message}</span>
      {onRetry && <button className="retry-btn" onClick={onRetry}>RETRY</button>}
    </div>
  );
}

// Export all
Object.assign(window, {
  PosterArt: PosterArt,
  PosterCard: PosterCard,
  ContinueCard: ContinueCard,
  EpisodeCard: EpisodeCard,
  SectionHeader: SectionHeader,
  LoadingState: LoadingState,
  InafinTopBar: InafinTopBar,
  InafinSidebar: InafinSidebar,
  SearchPalette: SearchPalette,
  ToastProvider: ToastProvider,
  ToastContext: ToastContext,
  useToast: useToast,
  ErrorBanner: ErrorBanner,
});
