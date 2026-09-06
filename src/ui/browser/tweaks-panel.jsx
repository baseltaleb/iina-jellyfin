// tweaks-panel.jsx — Reusable Tweaks shell + form-control helpers.
// Provides useTweaks() hook and TweaksPanel component.
// Used by Inafin for the in-app settings system.

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
function useTweaks(defaults) {
  const [values, setValues] = React.useState(() => {
    try {
      const stored = localStorage.getItem('inafin_tweaks');
      if (stored) return Object.assign({}, defaults, JSON.parse(stored));
    } catch {}
    return defaults;
  });

  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits =
      typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => {
      const next = { ...prev, ...edits };
      try {
        localStorage.setItem('inafin_tweaks', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return [values, setTweak];
}

// ── TweaksPanel (stub) ───────────────────────────────────────────────────────
// Not rendered in Inafin — settings are in the Settings page.
function TweaksPanel({ title = 'Tweaks', children }) {
  return null;
}

Object.assign(window, {
  useTweaks,
  TweaksPanel,
});
