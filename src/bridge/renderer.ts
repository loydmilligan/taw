// Render functions extracted from server.ts in plan 999.4-02
// No runtime imports needed — all content is template literals

export function renderMobilePage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TAW Mobile Ingest</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe6;
      --panel: #fffaf2;
      --line: #d8c7ae;
      --ink: #1f1b16;
      --muted: #6a5f52;
      --accent: #b85c38;
      --accent-ink: #fffaf2;
    }
    body {
      margin: 0;
      font-family: Georgia, "Iowan Old Style", serif;
      background: linear-gradient(180deg, #efe3d1 0%, var(--bg) 100%);
      color: var(--ink);
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      padding: 20px 16px 40px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 8px 24px rgba(31, 27, 22, 0.08);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 1.8rem;
    }
    p {
      color: var(--muted);
      line-height: 1.45;
    }
    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 6px;
      font-weight: 700;
    }
    input, select, textarea, button {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      border-radius: 12px;
      border: 1px solid var(--line);
      padding: 14px;
      background: #fffdfa;
      color: var(--ink);
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .row {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-top: 14px;
    }
    .row input[type="checkbox"] {
      width: auto;
      transform: scale(1.2);
    }
    button {
      margin-top: 18px;
      font-weight: 700;
      background: var(--accent);
      color: var(--accent-ink);
      border: 0;
    }
    #status {
      margin-top: 16px;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .hidden { display: none; }
    code { font-size: 0.92em; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1>TAW Mobile Ingest</h1>
      <p>Paste a URL from your phone, choose a wiki, and queue it for ingest through the local bridge.</p>
      <form id="form">
        <label for="url">URL</label>
        <input id="url" name="url" type="url" inputmode="url" placeholder="https://example.com/article" required />

        <label for="topic">Wiki Topic</label>
        <select id="topic" name="topic">
          <option value="">Loading topics...</option>
        </select>

        <div id="newTopicWrap" class="hidden">
          <label for="newTopic">New Topic</label>
          <input id="newTopic" name="newTopic" type="text" placeholder="vibecoding" />
        </div>

        <label for="userNote">Note</label>
        <textarea id="userNote" name="userNote" placeholder="Optional context, why this matters, what to focus on..."></textarea>

        <label class="row"><input id="autoRun" name="autoRun" type="checkbox" /> Auto-run ingest in the background</label>

        <button type="submit">Queue Wiki Ingest</button>
      </form>
      <div id="status"></div>
    </div>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const statusEl = document.getElementById('status');
    const topicEl = document.getElementById('topic');
    const newTopicWrapEl = document.getElementById('newTopicWrap');
    const newTopicEl = document.getElementById('newTopic');
    const formEl = document.getElementById('form');
    const topicStorageKey = 'taw-mobile-topic';

    function setStatus(message, isError = false) {
      statusEl.textContent = message;
      statusEl.style.color = isError ? '#9f2d2d' : '#3f4f2f';
    }

    function selectedTopic() {
      return topicEl.value === '__new__' ? newTopicEl.value.trim() : topicEl.value.trim();
    }

    function syncTopicMode() {
      const isNew = topicEl.value === '__new__';
      newTopicWrapEl.classList.toggle('hidden', !isNew);
      if (!isNew) {
        newTopicEl.value = '';
      }
    }

    async function loadTopics() {
      const response = await fetch('/wiki/topics', {
        headers: { 'x-taw-token': token }
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load wiki topics.');
      }
      const saved = localStorage.getItem(topicStorageKey);
      const topics = body.topics || [];
      topicEl.innerHTML = ['<option value="__new__">New Topic...</option>']
        .concat(topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>'))
        .join('');
      topicEl.value = saved && topics.includes(saved) ? saved : (topics[0] || '__new__');
      syncTopicMode();
    }

    topicEl.addEventListener('change', syncTopicMode);

    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const topic = selectedTopic();
      if (!topic) {
        setStatus('Choose an existing wiki topic or enter a new one.', true);
        return;
      }

      const payload = {
        topic,
        url: document.getElementById('url').value.trim(),
        userNote: document.getElementById('userNote').value.trim() || null,
        autoRun: document.getElementById('autoRun').checked
      };

      localStorage.setItem(topicStorageKey, topic);
      setStatus('Fetching page and queueing ingest...');

      try {
        const response = await fetch('/session/new-mobile-wiki-ingest', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-taw-token': token
          },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Could not queue ingest.');
        }
        setStatus(
          [
            'Queued successfully.',
            'Topic: ' + body.topic,
            'Title: ' + body.pageTitle,
            'Source File: ' + body.sourceFilePath,
            body.autoRun ? 'Background ingest started.' : 'Open TAW to run the queued ingest.'
          ].join('\\n')
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Request failed.', true);
      }
    });

    loadTopics().catch((error) => {
      setStatus(error instanceof Error ? error.message : 'Failed to load topics.', true);
    });
  </script>
</body>
</html>`;
}

export function renderPwaAppPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="/app/manifest.webmanifest" />
  <link rel="icon" href="/app/icon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <title>TAW Companion</title>
  <style>
    :root {
      --bg: #080e1a;
      --bg-grid: rgba(34,197,94,0.03);
      --surface: #111827;
      --surface-2: #1a2336;
      --surface-3: #202d42;
      --line: #2d3f55;
      --line-soft: #1a2336;
      --ink: #f1f5f9;
      --muted: #7c8fa6;
      --accent: #22c55e;
      --accent-dim: rgba(34,197,94,0.12);
      --accent-glow: rgba(34,197,94,0.3);
      --accent-glow-sm: rgba(34,197,94,0.15);
      --ok: #22c55e;
      --error: #f87171;
      --warn: #fbbf24;
      --hint-bg: rgba(34,197,94,0.07);
      --hint-border: rgba(34,197,94,0.22);
      --scan-line: rgba(255,255,255,0.015);
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { height: 100%; }
    body {
      margin: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 16px;
      background-color: var(--bg);
      /* Subtle grid + radial accent glow */
      background-image:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,197,94,0.07) 0%, transparent 70%),
        linear-gradient(var(--bg-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px);
      background-size: auto, 32px 32px, 32px 32px;
      color: var(--ink);
      min-height: 100dvh;
      overscroll-behavior-y: contain;
      -webkit-font-smoothing: antialiased;
    }
    a, button, [role="button"], input, select, textarea {
      touch-action: manipulation;
    }
    /* ── Top App Bar ── */
    .app-bar {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(8,14,26,0.93);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--line);
      padding-top: env(safe-area-inset-top);
      box-shadow: 0 1px 0 rgba(34,197,94,0.08);
    }
    .app-bar-inner {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 56px;
      padding: 0 16px;
    }
    .app-bar-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .app-bar-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .app-bar-badge {
      margin-left: 6px;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--accent-dim);
      border: 1px solid var(--hint-border);
      color: var(--accent);
    }
    /* ── Page Content ── */
    main {
      max-width: 680px;
      margin: 0 auto;
      padding: 16px 16px 96px;
    }
    /* ── Bottom Nav ── */
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 20;
      background: rgba(8,14,26,0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid var(--line);
      box-shadow: 0 -1px 0 rgba(34,197,94,0.08), 0 -8px 32px rgba(0,0,0,0.4);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .bottom-nav-inner {
      display: flex;
      height: 60px;
    }
    .nav-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border: none;
      background: none;
      color: #64748b;
      font-family: inherit;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
      min-height: 48px;
      position: relative;
      transition: color 150ms ease;
    }
    .nav-btn.active {
      color: var(--accent);
    }
    .nav-btn.active::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: var(--accent);
    }
    .nav-btn svg {
      width: 22px;
      height: 22px;
      transition: transform 150ms ease;
    }
    .nav-btn.active svg {
      transform: scale(1.1);
    }
    /* ── Panels ── */
    .panel {
      animation: fadeIn 180ms ease;
      will-change: transform, opacity;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    main {
      overflow-x: hidden;
    }
    /* ── Auth Screen ── */
    .auth-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 28px 24px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
      margin-top: 8px;
    }
    .auth-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .auth-logo-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(34,197,94,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(34,197,94,0.15);
    }
    .auth-title { font-size: 1.4rem; font-weight: 700; margin: 0; }
    .auth-sub { color: var(--muted); font-size: 0.875rem; margin: 4px 0 0; }
    /* ── Typography ── */
    h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 0 0 4px;
      letter-spacing: -0.01em;
    }
    h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 6px;
    }
    p { margin: 0; line-height: 1.5; }
    /* ── Hint Chips ── */
    .hint {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: var(--hint-bg);
      border: 1px solid var(--hint-border);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 18px;
      font-size: 0.82rem;
      color: #86efac;
      line-height: 1.45;
    }
    .hint-icon { font-size: 14px; flex: none; margin-top: 1px; }
    /* ── Section header ── */
    .panel-header {
      margin-bottom: 18px;
    }
    .panel-header p {
      color: var(--muted);
      font-size: 0.875rem;
      margin-top: 3px;
    }
    /* ── Cards / Surfaces ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .card + .card { margin-top: 10px; }
    .surface, .action-item {
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .surface + .surface, .action-item + .action-item { margin-top: 8px; }
    .surface .meta {
      color: var(--muted);
      font-size: 0.82rem;
      margin-top: 5px;
      line-height: 1.4;
    }
    .section-grid { display: grid; gap: 10px; }
    /* ── Form elements ── */
    label {
      display: block;
      margin-top: 16px;
      margin-bottom: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    input, textarea, select {
      width: 100%;
      font-family: inherit;
      font-size: 1rem;
      border-radius: 10px;
      border: 1px solid var(--line);
      padding: 12px 14px;
      background: var(--surface-2);
      color: var(--ink);
      outline: none;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-dim);
    }
    input::placeholder, textarea::placeholder { color: #475569; }
    select { appearance: none; cursor: pointer; }
    textarea { min-height: 100px; resize: vertical; }
    .row {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      align-items: center;
    }
    .row input[type="checkbox"] { width: auto; transform: scale(1.2); accent-color: var(--accent); }
    .row label { margin: 0; text-transform: none; font-size: 0.875rem; font-weight: 400; color: var(--muted); }
    /* ── Buttons ── */
    .btn {
      appearance: none;
      border: none;
      border-radius: 10px;
      padding: 13px 20px;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 100ms ease, box-shadow 100ms ease, opacity 150ms ease;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn:active { transform: scale(0.96); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: #052e16;
      box-shadow: 0 4px 16px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.25);
      text-shadow: 0 1px 0 rgba(0,0,0,0.15);
    }
    .btn-primary:hover { box-shadow: 0 6px 24px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.25); }
    .btn-secondary {
      background: linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%);
      color: var(--ink);
      border: 1px solid var(--line);
      box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .btn-ghost {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--line);
    }
    .btn-sm {
      padding: 8px 14px;
      font-size: 0.82rem;
      min-height: 36px;
      border-radius: 8px;
    }
    .btn-full { width: 100%; }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    /* ── Tab pills (within panel) ── */
    .tab-pills {
      display: flex;
      gap: 6px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 4px;
    }
    .tab-pill {
      flex: 1;
      border: none;
      border-radius: 7px;
      padding: 9px 12px;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      background: transparent;
      color: var(--muted);
      transition: background 150ms ease, color 150ms ease;
      min-height: 44px;
    }
    .tab-pill.active {
      background: var(--accent);
      color: #052e16;
    }
    /* ── Status / Message ── */
    .message {
      margin-top: 14px;
      font-size: 0.875rem;
      line-height: 1.5;
      border-radius: 8px;
      padding: 0;
      color: var(--muted);
    }
    .message:not(:empty) {
      padding: 10px 12px;
      background: var(--surface-2);
      border: 1px solid var(--line);
    }
    .message.tone-ok { color: var(--ok); border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.08); }
    .message.tone-error { color: var(--error); border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.08); }
    /* ── Markdown Output ── */
    .md-output {
      margin-top: 16px;
      font-size: 0.9rem;
      line-height: 1.65;
      color: var(--ink);
    }
    .md-output:not(:empty) {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
    }
    .md-output h1, .md-output h2, .md-output h3, .md-output h4 {
      margin: 1em 0 0.4em;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--ink);
    }
    .md-output h1 { font-size: 1.15rem; }
    .md-output h2 { font-size: 1.05rem; }
    .md-output h3 { font-size: 0.95rem; }
    .md-output p { margin: 0.6em 0; }
    .md-output ul, .md-output ol { margin: 0.6em 0; padding-left: 1.4em; }
    .md-output li { margin: 0.3em 0; }
    .md-output code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.82em;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 1px 5px;
      color: #a5f3c0;
    }
    .md-output pre {
      background: #0d1117;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      overflow-x: auto;
      margin: 0.8em 0;
    }
    .md-output pre code {
      background: none;
      border: none;
      padding: 0;
      font-size: 0.82rem;
      color: #e2e8f0;
    }
    .md-output blockquote {
      border-left: 3px solid var(--accent);
      margin: 0.8em 0;
      padding: 6px 14px;
      color: var(--muted);
      font-style: italic;
    }
    .md-output strong { font-weight: 700; color: var(--ink); }
    .md-output em { font-style: italic; color: #cbd5e1; }
    .md-output hr { border: none; border-top: 1px solid var(--line); margin: 1em 0; }
    /* ── Preview box ── */
    .preview-box {
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px 14px;
      margin-top: 10px;
      font-size: 0.875rem;
      color: var(--muted);
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .preview-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--ink);
      margin: 14px 0 0;
    }
    /* ── Loading spinner ── */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    /* ── Misc ── */
    .hidden { display: none !important; }
    .secure-hint {
      background: rgba(245,158,11,0.08);
      border: 1px solid rgba(245,158,11,0.2);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 0.82rem;
      color: #fcd34d;
      margin-bottom: 14px;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--line);
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <!-- Top App Bar -->
  <header class="app-bar">
    <div class="app-bar-inner">
      <div class="app-bar-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
          <path d="M8 9l3 3-3 3M13 15h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>
      <span class="app-bar-title">TAW</span>
      <span class="app-bar-badge">Companion</span>
    </div>
  </header>

  <main>
    <!-- Auth Screen -->
    <div id="authBlock">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.75">
              <path d="M8 9l3 3-3 3M13 15h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <p class="auth-title">TAW Companion</p>
            <p class="auth-sub">Terminal AI Workspace — mobile interface</p>
          </div>
        </div>
        <div class="hint">
          <span class="hint-icon">🔑</span>
          <span>Paste the bridge token shown in your TAW terminal session to unlock this companion app. The token persists in this browser until you clear it.</span>
        </div>
        <div id="secureHint" class="secure-hint hidden">
          ⚠️ <strong>Secure context required</strong> for PWA install and share-target on Android Chrome. <code>http://127.0.0.1</code> is fine locally; use HTTPS or a tunnel for LAN access.
        </div>
        <label for="bridgeToken">Bridge Token</label>
        <input id="bridgeToken" type="password" placeholder="Paste token from TAW terminal" autocomplete="current-password" />
        <div class="actions">
          <button id="bootstrapBtn" type="button" class="btn btn-primary btn-full">Unlock App</button>
        </div>
        <div id="captureStatus" class="message"></div>
      </div>
    </div>

    <!-- App Panels -->
    <div id="appBlock" class="hidden">

      <section id="panel-capture" class="panel">
        <div class="panel-header">
          <h2>Capture</h2>
          <p>Send a URL or content to your wiki or research inbox.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">💡</span>
          <span>Share links directly from Chrome → <em>Share → TAW</em> — auto-fills this form. Wiki mode adds to an existing topic; Research Inbox queues it for deeper investigation.</span>
        </div>
        <div class="tab-pills">
          <button id="captureWikiTab" class="tab-pill active" type="button">Wiki</button>
          <button id="captureResearchTab" class="tab-pill" type="button">Research Inbox</button>
        </div>
        <label for="url">URL</label>
        <input id="url" type="url" inputmode="url" placeholder="https://example.com/article" />
        <div id="wikiTopicWrap">
          <label for="topic">Wiki Topic</label>
          <select id="topic"><option value="">Loading topics...</option></select>
          <div id="newTopicWrap" class="hidden">
            <label for="newTopic">New Topic Name</label>
            <input id="newTopic" type="text" placeholder="e.g. vibecoding" />
          </div>
        </div>
        <div id="researchQuestionWrap" class="hidden">
          <label for="initialQuestion">Initial Question</label>
          <input id="initialQuestion" type="text" placeholder="What should TAW investigate here?" />
        </div>
        <label for="userNote">Note (optional)</label>
        <textarea id="userNote" placeholder="Why this matters, what to focus on, or any extra context…"></textarea>
        <div class="row">
          <input id="autoRun" type="checkbox" checked />
          <label for="autoRun">Auto-run ingest after confirm</label>
        </div>
        <div class="actions">
          <button id="previewBtn" type="button" class="btn btn-primary">Preview Capture</button>
        </div>
        <div id="preview" class="hidden">
          <hr class="divider" />
          <p class="preview-title" id="previewTitle"></p>
          <div class="preview-box" id="previewExcerpt"></div>
          <div class="actions">
            <button id="confirmBtn" type="button" class="btn btn-primary">Confirm &amp; Submit</button>
            <button id="cancelBtn" type="button" class="btn btn-ghost">Cancel</button>
          </div>
        </div>
        <div id="captureStatusApp" class="message"></div>
      </section>

      <section id="panel-ask" class="panel hidden">
        <div class="panel-header">
          <h2>Ask TAWD</h2>
          <p>Get a concise answer from your AI workspace.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">🤖</span>
          <span>TAWD has context about your sessions and wiki. Try: <em>"What changed in vibecoding recently?"</em> or <em>"Summarize what I know about agentic loops."</em></span>
        </div>
        <label for="askPrompt">Your Question</label>
        <textarea id="askPrompt" placeholder="What changed in this wiki recently?"></textarea>
        <div class="actions">
          <button id="askBtn" type="button" class="btn btn-primary">Ask TAWD</button>
        </div>
        <div id="askOutput" class="md-output"></div>
      </section>

      <section id="panel-actions" class="panel hidden">
        <div class="panel-header">
          <h2>Actions</h2>
          <p>Review queued work and trigger wiki maintenance.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">⚡</span>
          <span>Actions appear here when TAW has pending work — like pages needing link review, index updates, or ingest jobs waiting to run. Tap to execute.</span>
        </div>
        <div id="actionsWrap" class="section-grid"></div>
      </section>

      <section id="panel-status" class="panel hidden">
        <div class="panel-header">
          <h2>Status</h2>
          <p>What the bridge and session have been doing.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">📡</span>
          <span>Background jobs run TAW commands asynchronously. Check here after capturing a URL to see if the ingest finished successfully.</span>
        </div>
        <div id="statusWrap" class="section-grid"></div>
      </section>

      <section id="panel-topics" class="panel hidden">
        <div class="panel-header">
          <h2>Topics</h2>
          <p>Explore, summarize, and analyze your wiki topics.</p>
        </div>
        <div class="hint">
          <span class="hint-icon">🗂️</span>
          <span><strong>Summarize</strong> gives a quick overview. <strong>Research Seeds</strong> finds gaps and open questions. <strong>Run Analysis</strong> asks TAWD to reason deeply about a specific note.</span>
        </div>
        <label for="topicsTopic">Topic</label>
        <select id="topicsTopic"><option value="">Loading topics…</option></select>
        <div class="row">
          <input id="wikiOnly" type="checkbox" checked />
          <label for="wikiOnly">Wiki-only for summarize (exclude raw research)</label>
        </div>
        <div class="actions">
          <button id="topicSummaryBtn" type="button" class="btn btn-primary">Summarize</button>
          <button id="topicSeedsBtn" type="button" class="btn btn-secondary">Research Seeds</button>
        </div>
        <hr class="divider" />
        <h3>Deep Analysis</h3>
        <label for="topicsNote">Source Note</label>
        <select id="topicsNote"><option value="">Choose a note…</option></select>
        <label for="topicsQuestion">Analysis Question</label>
        <textarea id="topicsQuestion" placeholder="What tension or gap should TAW analyze here?"></textarea>
        <div class="actions">
          <button id="topicAnalysisBtn" type="button" class="btn btn-primary">Run Analysis</button>
        </div>
        <div id="topicsOutput" class="md-output"></div>
        <div class="card" id="flashcard-section">
          <h3>Flashcards</h3>
          <div class="meta" style="margin-bottom:12px">Study Q&amp;A pairs extracted from your wiki notes.</div>
          <button class="btn" id="loadFlashcardsBtn" onclick="loadFlashcards()">Load Flashcards</button>
          <div id="flashcard-list" style="margin-top:12px"></div>
        </div>
      </section>

    </div>
  </main>

  <!-- Bottom Navigation Bar -->
  <nav class="bottom-nav" id="bottomNav" style="display:none">
    <div class="bottom-nav-inner">
      <button class="nav-btn active" data-panel="capture" type="button" aria-label="Capture">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
        </svg>
        <span>Capture</span>
      </button>
      <button class="nav-btn" data-panel="ask" type="button" aria-label="Ask TAWD">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.862 9.862 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Ask</span>
      </button>
      <button class="nav-btn" data-panel="actions" type="button" aria-label="Actions">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Actions</span>
      </button>
      <button class="nav-btn" data-panel="status" type="button" aria-label="Status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Status</span>
      </button>
      <button class="nav-btn" data-panel="topics" type="button" aria-label="Topics">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Topics</span>
      </button>
    </div>
  </nav>

  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/app/sw.js').catch(() => {});
    }

    const authBlock = document.getElementById('authBlock');
    const appBlock = document.getElementById('appBlock');
    const bottomNav = document.getElementById('bottomNav');
    const secureHintEl = document.getElementById('secureHint');
    const topicStorageKey = 'taw-app-topic';
    const pendingShareStorageKey = 'taw-app-pending-share';
    const captureStatusEl = document.getElementById('captureStatus');
    const captureStatusAppEl = document.getElementById('captureStatusApp');
    const askOutputEl = document.getElementById('askOutput');
    const actionsWrapEl = document.getElementById('actionsWrap');
    const statusWrapEl = document.getElementById('statusWrap');
    const topicsOutputEl = document.getElementById('topicsOutput');
    const topicEl = document.getElementById('topic');
    const topicsTopicEl = document.getElementById('topicsTopic');
    const topicsNoteEl = document.getElementById('topicsNote');
    const newTopicWrapEl = document.getElementById('newTopicWrap');
    const newTopicEl = document.getElementById('newTopic');
    const wikiTopicWrapEl = document.getElementById('wikiTopicWrap');
    const researchQuestionWrapEl = document.getElementById('researchQuestionWrap');
    const previewEl = document.getElementById('preview');
    const previewTitleEl = document.getElementById('previewTitle');
    const previewExcerptEl = document.getElementById('previewExcerpt');
    let captureMode = 'wiki';
    let previewPayload = null;

    // Lightweight markdown renderer
    function renderMarkdown(text) {
      if (!text) return '';
      let html = text
        // Escape HTML
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Code blocks
        .replace(/\`\`\`[\\w]*\\n?([\\s\\S]*?)\`\`\`/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>')
        // Inline code
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        // Headings
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Bold / italic
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
        // Blockquote
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        // HR
        .replace(/^---$/gm, '<hr/>')
        // Unordered lists
        .replace(/^[\\-\\*] (.+)$/gm, '<li>$1</li>')
        // Ordered lists
        .replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>')
        // Paragraphs (double newline)
        .replace(/\\n\\n/g, '</p><p>')
        // Single newlines in non-block contexts
        .replace(/\\n/g, '<br/>');
      // Wrap li in ul
      html = html.replace(/(<li>.*?<\\/li>)+/gs, (m) => '<ul>' + m + '</ul>');
      return '<p>' + html + '</p>';
    }

    function setMarkdown(node, text) {
      node.innerHTML = renderMarkdown(text);
    }

    function setMessage(node, message, tone) {
      node.textContent = message || '';
      node.className = 'message' + (tone === 'error' ? ' tone-error' : tone === 'ok' ? ' tone-ok' : '');
    }

    function currentTopic() {
      return topicEl.value === '__new__' ? newTopicEl.value.trim() : topicEl.value.trim();
    }

    function syncTopicMode() {
      const isNew = topicEl.value === '__new__';
      newTopicWrapEl.classList.toggle('hidden', !isNew);
    }

    function switchPanel(nextPanel) {
      document.querySelectorAll('.nav-btn').forEach((node) => {
        node.classList.toggle('active', node.dataset.panel === nextPanel);
      });
      document.querySelectorAll('[id^="panel-"]').forEach((node) => {
        node.classList.toggle('hidden', node.id !== 'panel-' + nextPanel);
      });
    }

    function switchCaptureMode(nextMode) {
      captureMode = nextMode;
      document.getElementById('captureWikiTab').classList.toggle('active', nextMode === 'wiki');
      document.getElementById('captureResearchTab').classList.toggle('active', nextMode === 'research');
      wikiTopicWrapEl.classList.toggle('hidden', nextMode !== 'wiki');
      researchQuestionWrapEl.classList.toggle('hidden', nextMode !== 'research');
    }

    function readSharedPayloadFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const shared = {
        title: params.get('title'),
        text: params.get('text'),
        url: params.get('url')
      };
      if (!shared.title && !shared.text && !shared.url) {
        return null;
      }
      window.history.replaceState({}, '', '/app');
      return shared;
    }

    function applySharedPayload(shared) {
      if (!shared) {
        return;
      }
      if (shared.url) {
        document.getElementById('url').value = shared.url;
      }
      if (shared.text) {
        const existing = document.getElementById('userNote').value.trim();
        document.getElementById('userNote').value = existing ? existing + '\\n\\n' + shared.text : shared.text;
      }
      if (!document.getElementById('initialQuestion').value && shared.title && captureMode === 'research') {
        document.getElementById('initialQuestion').value = 'Review shared item: ' + shared.title;
      }
      setMessage(captureStatusAppEl, 'Shared content received. Preview it before submitting.', 'ok');
      switchPanel('capture');
    }

    async function bootstrap(token) {
      const response = await fetch('/app/api/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not unlock app.');
      }
      authBlock.classList.add('hidden');
      appBlock.classList.remove('hidden');
      if (bottomNav) bottomNav.style.display = '';
      await loadState();
    }

    function renderActions(data) {
      const categories = data.categories || [];
      actionsWrapEl.innerHTML = categories.map((category) => {
        const items = category.items || [];
        return [
          '<div class="card">',
          '<h3>' + category.title + '</h3>',
          items.length === 0 ? '<div class="meta">Nothing queued here right now.</div>' : items.map((item) => [
            '<div class="action-item" style="margin-top:10px">',
            '<strong>' + item.title + '</strong>',
            '<div class="meta">' + item.detail + '</div>',
            '<div class="actions"><button type="button" class="btn btn-primary btn-sm" data-action="' + item.action + '" data-topic="' + (item.topic || '') + '">' + item.title + '</button></div>',
            '</div>'
          ].join('')).join(''),
          '</div>'
        ].join('');
      }).join('');

      actionsWrapEl.querySelectorAll('button[data-action]').forEach((node) => {
        node.addEventListener('click', async () => {
          setMessage(captureStatusAppEl, 'Running action…', undefined);
          const response = await fetch('/app/api/actions/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: node.dataset.action,
              topic: node.dataset.topic || undefined
            })
          });
          const body = await response.json();
          if (!response.ok || !body.ok) {
            setMessage(captureStatusAppEl, body.error || 'Action failed.', 'error');
            return;
          }
          setMessage(captureStatusAppEl, body.message || 'Action completed.', 'ok');
          renderActions(body.actions);
          renderStatus(body.recentStatus);
          switchPanel('actions');
        });
      });
    }

    function renderStatus(status) {
      const jobLines = (status.backgroundJobs || []).map((job) =>
        '<div class="surface" style="margin-top:8px"><strong>' + job.topic + '</strong><div class="meta">' + job.status + ' · started ' + job.startedAt + (job.completedAt ? ' · finished ' + job.completedAt : '') + '</div></div>'
      );

      statusWrapEl.innerHTML = [
        '<div class="card"><div class="section-grid">',
        '<div class="surface"><strong>Mode</strong><div class="meta">' + status.mode + '</div></div>',
        '<div class="surface"><strong>Queued Inputs</strong><div class="meta">' + status.queuedInputs + '</div></div>',
        '<div class="surface"><strong>Research Sources</strong><div class="meta">' + status.researchSources + '</div></div>',
        '<div class="surface"><strong>Wiki Topics</strong><div class="meta">' + (status.topicCount ?? 0) + '</div></div>',
        '<div class="surface"><strong>Session Folder</strong><div class="meta">' + status.sessionDir + '</div></div>',
        '</div></div>',
        '<div class="card"><h3>Background Jobs</h3>' + (jobLines.length ? jobLines.join('') : '<div class="meta">No recent background jobs.</div>') + '</div>'
      ].join('');
    }

    async function loadFlashcards() {
      const listEl = document.getElementById('flashcard-list');
      listEl.innerHTML = '<div class="meta">Loading…</div>';
      try {
        const response = await fetch('/app/api/flashcards');
        const body = await response.json();
        if (!response.ok || !body.ok) {
          listEl.innerHTML = '<div class="meta" style="color:var(--error)">Could not load flashcards.</div>';
          return;
        }
        const cards = body.cards || [];
        if (cards.length === 0) {
          listEl.innerHTML = '<div class="meta">No flashcards found. Add Q: / A: pairs to wiki notes to create flashcards.</div>';
          return;
        }
        listEl.innerHTML = cards.map((card) =>
          '<div class="surface" style="margin-top:8px"><strong>Q: ' + card.question + '</strong><div class="meta" style="margin-top:4px">A: ' + card.answer + '</div><div class="meta" style="font-size:11px;margin-top:4px">Source: ' + card.sourceFile + '</div></div>'
        ).join('');
      } catch (err) {
        listEl.innerHTML = '<div class="meta" style="color:var(--error)">Error: ' + String(err) + '</div>';
      }
    }

    async function loadTopicNotes(topic) {
      if (!topic) {
        topicsNoteEl.innerHTML = '<option value="">Choose a note…</option>';
        return;
      }
      const response = await fetch('/app/api/topics/notes?topic=' + encodeURIComponent(topic));
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load notes.');
      }
      topicsNoteEl.innerHTML = ['<option value="">Choose a note…</option>']
        .concat((body.notes || []).map((note) => '<option value="' + note.path + '">' + note.title + ' (' + (note.type || 'note') + ')</option>'))
        .join('');
    }

    async function loadState() {
      const response = await fetch('/app/api/state');
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not load app state.');
      }
      const topics = body.topics || [];
      const saved = localStorage.getItem(topicStorageKey);
      const selected = saved && topics.includes(saved) ? saved : (topics[0] || '__new__');
      topicEl.innerHTML = ['<option value="__new__">New Topic…</option>']
        .concat(topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>'))
        .join('');
      topicEl.value = selected;
      syncTopicMode();
      topicsTopicEl.innerHTML = topics.map((topic) => '<option value="' + topic + '">' + topic + '</option>').join('');
      if (topics.length > 0) {
        topicsTopicEl.value = topics[0];
        await loadTopicNotes(topics[0]);
      }
      renderActions(body.actions);
      renderStatus(body.recentStatus);
    }

    async function previewCapture() {
      const url = document.getElementById('url').value.trim();
      if (!url) {
        setMessage(captureStatusAppEl, 'Enter a URL first.', 'error');
        return;
      }
      if (captureMode === 'wiki' && !currentTopic()) {
        setMessage(captureStatusAppEl, 'Choose an existing wiki topic or enter a new one.', 'error');
        return;
      }
      setMessage(captureStatusAppEl, 'Fetching page preview…');
      const response = await fetch('/app/api/capture-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || 'Could not capture URL.');
      }
      previewPayload = body;
      previewTitleEl.textContent = body.pageTitle;
      previewExcerptEl.textContent = body.pageTextExcerpt || '(No readable excerpt captured.)';
      previewEl.classList.remove('hidden');
      setMessage(captureStatusAppEl, 'Preview ready — confirm to submit.', 'ok');
    }

    async function confirmSubmit() {
      if (!previewPayload) {
        return;
      }
      const note = document.getElementById('userNote').value.trim() || null;
      const autoRun = document.getElementById('autoRun').checked;
      const url = document.getElementById('url').value.trim();

      if (captureMode === 'wiki') {
        const topic = currentTopic();
        localStorage.setItem(topicStorageKey, topic);
        const response = await fetch('/app/api/wiki-ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic,
            url,
            pageTitle: previewPayload.pageTitle,
            pageTextExcerpt: previewPayload.pageTextExcerpt || null,
            userNote: note,
            autoRun
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Wiki ingest failed.');
        }
        setMessage(captureStatusAppEl, 'Wiki ingest queued for topic "' + body.topic + '".' + (autoRun ? ' Background ingest started.' : ' Queued for later run.'), 'ok');
      } else {
        const response = await fetch('/app/api/research-ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            url,
            pageTitle: previewPayload.pageTitle,
            pageTextExcerpt: previewPayload.pageTextExcerpt || null,
            userNote: note,
            initialQuestion: document.getElementById('initialQuestion').value.trim() || null
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error || 'Research ingest failed.');
        }
        setMessage(captureStatusAppEl, 'Research inbox capture sent. A session was seeded from this source.', 'ok');
      }

      previewEl.classList.add('hidden');
      previewPayload = null;
      const statusResponse = await fetch('/app/api/status');
      const statusBody = await statusResponse.json();
      if (statusResponse.ok && statusBody.ok) {
        renderStatus(statusBody.recentStatus);
      }
    }

    const panelOrder = ['capture', 'ask', 'actions', 'status', 'topics'];

    document.querySelectorAll('.nav-btn').forEach((node) => {
      node.addEventListener('click', () => switchPanel(node.dataset.panel));
    });

    // Tactile swipe navigation — panel tracks finger then snaps
    (function setupSwipe() {
      let startX = 0, startY = 0, curDx = 0;
      let locked = false; // true once we've committed to a horizontal swipe
      let cancelled = false;
      const main = document.querySelector('main');
      if (!main) return;

      function activePanel() {
        return document.querySelector('[id^="panel-"]:not(.hidden)');
      }

      function applyDrag(dx) {
        const panel = activePanel();
        if (panel) {
          panel.style.transition = 'none';
          panel.style.transform = 'translateX(' + dx + 'px)';
          panel.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / window.innerWidth));
        }
      }

      function snapBack() {
        const panel = activePanel();
        if (!panel) return;
        panel.style.transition = 'transform 280ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease';
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
      }

      function snapCommit(toPanel) {
        const panel = activePanel();
        const vw = window.innerWidth;
        const dir = curDx < 0 ? -1 : 1;
        if (panel) {
          panel.style.transition = 'transform 220ms cubic-bezier(0.4,0,1,1), opacity 180ms ease';
          panel.style.transform = 'translateX(' + (dir * -vw) + 'px)';
          panel.style.opacity = '0';
        }
        setTimeout(() => {
          switchPanel(toPanel);
          // incoming panel starts offset and slides in
          const incoming = document.getElementById('panel-' + toPanel);
          if (incoming) {
            incoming.style.transition = 'none';
            incoming.style.transform = 'translateX(' + (dir * vw) + 'px)';
            incoming.style.opacity = '0';
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                incoming.style.transition = 'transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease';
                incoming.style.transform = 'translateX(0)';
                incoming.style.opacity = '1';
              });
            });
          }
          // clean up outgoing
          if (panel) { panel.style.transform = ''; panel.style.opacity = ''; panel.style.transition = ''; }
        }, 180);
      }

      main.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        curDx = 0;
        locked = false;
        cancelled = false;
      }, { passive: true });

      main.addEventListener('touchmove', (e) => {
        if (cancelled) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!locked) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) { cancelled = true; return; }
          locked = true;
        }
        curDx = dx;
        // resistance at edges
        const activeBtn = document.querySelector('.nav-btn.active');
        const idx = panelOrder.indexOf(activeBtn ? activeBtn.dataset.panel : '');
        const atStart = idx === 0 && dx > 0;
        const atEnd = idx === panelOrder.length - 1 && dx < 0;
        const effective = (atStart || atEnd) ? dx * 0.25 : dx;
        applyDrag(effective);
      }, { passive: true });

      main.addEventListener('touchend', () => {
        if (!locked) return;
        locked = false;
        const activeBtn = document.querySelector('.nav-btn.active');
        if (!activeBtn || !activeBtn.dataset.panel) { snapBack(); return; }
        const idx = panelOrder.indexOf(activeBtn.dataset.panel);
        const threshold = window.innerWidth * 0.28;
        if (curDx < -threshold && idx < panelOrder.length - 1) {
          snapCommit(panelOrder[idx + 1]);
        } else if (curDx > threshold && idx > 0) {
          snapCommit(panelOrder[idx - 1]);
        } else {
          snapBack();
          // clean transform after snap-back animation
          setTimeout(() => {
            const panel = activePanel();
            if (panel) { panel.style.transform = ''; panel.style.opacity = ''; panel.style.transition = ''; }
          }, 300);
        }
      });

      main.addEventListener('touchcancel', () => { if (locked) snapBack(); locked = false; });
    })();

    document.getElementById('captureWikiTab').addEventListener('click', () => switchCaptureMode('wiki'));
    document.getElementById('captureResearchTab').addEventListener('click', () => switchCaptureMode('research'));
    topicEl.addEventListener('change', syncTopicMode);
    topicsTopicEl.addEventListener('change', () => {
      loadTopicNotes(topicsTopicEl.value).catch((error) => {
        setMessage(topicsOutputEl, error.message || 'Could not load topic notes.', 'error');
      });
    });
    document.getElementById('previewBtn').addEventListener('click', () => {
      previewCapture().catch((error) => setMessage(captureStatusAppEl, error.message || 'Preview failed.', 'error'));
    });
    document.getElementById('confirmBtn').addEventListener('click', () => {
      confirmSubmit().catch((error) => setMessage(captureStatusAppEl, error.message || 'Submit failed.', 'error'));
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      previewPayload = null;
      previewEl.classList.add('hidden');
      setMessage(captureStatusAppEl, 'Preview discarded.');
    });
    document.getElementById('bootstrapBtn').addEventListener('click', () => {
      const token = document.getElementById('bridgeToken').value.trim();
      const btn = document.getElementById('bootstrapBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Unlocking…';
      bootstrap(token)
        .then(() => {
          const shared = JSON.parse(localStorage.getItem(pendingShareStorageKey) || 'null');
          if (shared) {
            applySharedPayload(shared);
            localStorage.removeItem(pendingShareStorageKey);
          }
        })
        .catch((error) => {
          setMessage(captureStatusEl, error.message || 'Unlock failed.', 'error');
          btn.disabled = false;
          btn.textContent = 'Unlock App';
        });
    });
    document.getElementById('askBtn').addEventListener('click', async () => {
      const btn = document.getElementById('askBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Thinking…';
      askOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: document.getElementById('askPrompt').value.trim() })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(askOutputEl, body.error || 'Ask failed.', 'error');
        } else {
          setMarkdown(askOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ask TAWD';
      }
    });
    document.getElementById('topicSummaryBtn').addEventListener('click', async () => {
      const btn = document.getElementById('topicSummaryBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Building…';
      topicsOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/topics/summarize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: topicsTopicEl.value,
            wikiOnly: document.getElementById('wikiOnly').checked
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(topicsOutputEl, body.error || 'Summary failed.', 'error');
        } else {
          setMarkdown(topicsOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Summarize';
      }
    });
    document.getElementById('topicSeedsBtn').addEventListener('click', async () => {
      const btn = document.getElementById('topicSeedsBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Finding…';
      topicsOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/topics/research-seeds', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ topic: topicsTopicEl.value })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(topicsOutputEl, body.error || 'Research seeds failed.', 'error');
        } else {
          topicsOutputEl.innerHTML = renderMarkdown(body.answer).replace(/https?:\/\/[^\s<>"{}|\\^\x60\[\]]+/g, (url) => '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">' + url + '</a>');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Research Seeds';
      }
    });
    document.getElementById('topicAnalysisBtn').addEventListener('click', async () => {
      const notePath = topicsNoteEl.value;
      const question = document.getElementById('topicsQuestion').value.trim();
      if (!notePath || !question) {
        setMessage(topicsOutputEl, 'Choose a note and enter an analysis question first.', 'error');
        return;
      }
      const btn = document.getElementById('topicAnalysisBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing…';
      topicsOutputEl.innerHTML = '';
      try {
        const response = await fetch('/app/api/topics/analysis', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: topicsTopicEl.value,
            notePath,
            question
          })
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(topicsOutputEl, body.error || 'Analysis failed.', 'error');
        } else {
          setMarkdown(topicsOutputEl, body.answer);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run Analysis';
      }
    });

    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      secureHintEl.classList.remove('hidden');
    }

    const sharedPayload = readSharedPayloadFromUrl();

    // Check session client-side — shell is always served stateless for safe SW caching
    (async function checkSession() {
      try {
        const res = await fetch('/app/api/state');
        if (res.ok) {
          // Session valid — transition to app UI and load state
          authBlock.classList.add('hidden');
          appBlock.classList.remove('hidden');
          if (bottomNav) bottomNav.style.display = '';
          await loadState();
          applySharedPayload(sharedPayload);
        } else {
          // Not authenticated — store pending share for after bootstrap
          if (sharedPayload) {
            localStorage.setItem(pendingShareStorageKey, JSON.stringify(sharedPayload));
          }
        }
      } catch {
        // Network error or bridge not running — stay on auth screen
        if (sharedPayload) {
          localStorage.setItem(pendingShareStorageKey, JSON.stringify(sharedPayload));
        }
      }
    })();
  </script>
</body>
</html>`;
}

export function renderAppServiceWorker(): string {
  return `const CACHE_NAME = 'taw-app-v1';
const APP_SHELL = [
  '/app',
  '/app/manifest.webmanifest',
  '/app/icon.svg',
  '/app/icon-192.png',
  '/app/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.pathname === '/app' ||
    url.pathname === '/app/manifest.webmanifest' ||
    url.pathname === '/app/icon.svg' ||
    url.pathname === '/app/icon-192.png' ||
    url.pathname === '/app/icon-512.png'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
`;
}

export function renderAppIconSvg(): string {
  return `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TAW">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d76f3f"/>
      <stop offset="100%" stop-color="#8d3f26"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="108" height="108" rx="28" fill="#f8f1e6" stroke="#cfb89c" stroke-width="6"/>
  <path d="M34 40h60l-12 16H70v34H58V56H46z" fill="url(#g)"/>
  <circle cx="94" cy="94" r="10" fill="#e3bf92"/>
  <path d="M32 94c16-12 30-18 44-18" fill="none" stroke="#8d3f26" stroke-width="8" stroke-linecap="round"/>
</svg>`;
}

export function renderAppIconPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5S8AAAAASUVORK5CYII=',
      'base64'
    )
  );
}
