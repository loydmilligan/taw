const bridgeBaseUrl = 'http://127.0.0.1:4317';

const bridgeVersionEl = document.getElementById('bridgeVersion');
const workflowTypeInput = document.getElementById('workflowType');
const researchTypeInput = document.getElementById('researchType');
const wikiSection = document.getElementById('wikiSection');
const wikiTopicInput = document.getElementById('wikiTopic');
const newTopicLabel = document.getElementById('newTopicLabel');
const newWikiTopicInput = document.getElementById('newWikiTopic');
const wikiAutoIngestInput = document.getElementById('wikiAutoIngest');
const wikiAutoIngestDefaultInput = document.getElementById(
  'wikiAutoIngestDefault'
);
const tokenInput = document.getElementById('token');
const cwdInput = document.getElementById('cwd');
const initialQuestionInput = document.getElementById('initialQuestion');
const noteInput = document.getElementById('note');
const sendPageButton = document.getElementById('sendPage');
const sendSelectionButton = document.getElementById('sendSelection');
const sendWikiButton = document.getElementById('sendWiki');
const refreshBackendButton = document.getElementById('refreshBackend');
const startBackendButton = document.getElementById('startBackend');
const keepWarmButton = document.getElementById('keepWarm');
const stopBackendButton = document.getElementById('stopBackend');
const backendStatusEl = document.getElementById('backendStatus');
const backendMetaEl = document.getElementById('backendMeta');
const statusEl = document.getElementById('status');
const detailEl = document.getElementById('detail');

await restoreSavedFields();
await inferResearchTypeFromActiveTab();
await refreshBackendStatus();
await refreshWikiTopics();
renderWorkflowFields();
void fetchBridgeVersion();

workflowTypeInput.addEventListener('change', () => {
  renderWorkflowFields();
  void saveFields();
});

wikiTopicInput.addEventListener('change', () => {
  renderWorkflowFields();
  void saveFields();
});
wikiAutoIngestInput.addEventListener('change', () => void saveFields());
wikiAutoIngestDefaultInput.addEventListener('change', async () => {
  if (wikiAutoIngestDefaultInput.checked) {
    wikiAutoIngestInput.checked = true;
  }
  await saveFields();
});

sendPageButton.addEventListener(
  'click',
  () => void submitResearch({ selectionOnly: false })
);
sendSelectionButton.addEventListener(
  'click',
  () => void submitResearch({ selectionOnly: true })
);
sendWikiButton.addEventListener('click', () => void submitWiki());
refreshBackendButton.addEventListener('click', () => void refreshBackendStatus());
startBackendButton.addEventListener('click', () => void controlBackend('start'));
keepWarmButton.addEventListener('click', () => void controlBackend('touch'));
stopBackendButton.addEventListener('click', () => void controlBackend('stop'));

async function submitResearch({ selectionOnly }) {
  setBusy(true);
  setStatus('Collecting page data...', '');

  try {
    const token = tokenInput.value.trim();
    if (!token) {
      throw new Error(
        'Enter the bridge token from ~/.config/taw/bridge-token.'
      );
    }

    const { tab, pageContext } = await collectPageContext();

    if (selectionOnly && !pageContext.selectedText) {
      throw new Error('No selected text was found on the current page.');
    }

    const payload = {
      kind: detectKind(tab.url),
      researchType: researchTypeInput.value,
      url: tab.url,
      title: tab.title || pageContext.title || 'Untitled page',
      selectedText: selectionOnly
        ? pageContext.selectedText
        : pageContext.selectedText || null,
      pageTextExcerpt: selectionOnly
        ? pageContext.selectedText || null
        : pageContext.pageTextExcerpt,
      userNote: noteInput.value.trim() || null,
      sentAt: new Date().toISOString(),
      initialQuestion: initialQuestionInput.value.trim() || null
    };

    await saveFields();

    const response = await fetch(`${bridgeBaseUrl}/session/new-research`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-taw-token': token
      },
      body: JSON.stringify({
        cwd: cwdInput.value.trim() || undefined,
        payload
      })
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Bridge request failed.');
    }

    setStatus(
      body.launchMethod === 'manual'
        ? 'Research payload sent. Run the command below to start TAW.'
        : 'Research payload sent to TAW successfully.',
      body.command || ''
    );
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'Unknown extension error.',
      ''
    );
  } finally {
    setBusy(false);
  }
}

async function fetchBridgeVersion() {
  try {
    const response = await fetch(`${bridgeBaseUrl}/version`);
    if (!response.ok) return;
    const body = await response.json();
    if (body.version && bridgeVersionEl) {
      bridgeVersionEl.textContent = `v${body.version}`;
    }
  } catch {
    // Bridge not running — version stays blank
  }
}

async function submitWiki() {
  setBusy(true);
  setStatus('Collecting page data for wiki ingest...', '');

  try {
    const token = tokenInput.value.trim();
    if (!token) {
      throw new Error(
        'Enter the bridge token from ~/.config/taw/bridge-token.'
      );
    }

    const topic =
      wikiTopicInput.value === '__new__'
        ? newWikiTopicInput.value.trim()
        : wikiTopicInput.value.trim();

    if (!topic) {
      throw new Error('Choose an existing wiki topic or enter a new one.');
    }

    const { tab, pageContext } = await collectPageContext();

    await saveFields();

    const response = await fetch(`${bridgeBaseUrl}/session/new-wiki-ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-taw-token': token
      },
      body: JSON.stringify({
        cwd: cwdInput.value.trim() || undefined,
        topic,
        pageTitle: tab.title || pageContext.title || 'Untitled page',
        pageUrl: tab.url || null,
        pageTextExcerpt: pageContext.pageTextExcerpt,
        selectedText: pageContext.selectedText || null,
        userNote: noteInput.value.trim() || null,
        autoRun: wikiAutoIngestInput.checked
      })
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Bridge request failed.');
    }

    if (body.launchMethod === 'background' && body.jobId) {
      setStatus(`Wiki ingest running for ${body.topic}…`, '');
      void pollJobStatus(body.jobId, body.topic, token);
    } else {
      setStatus(
        body.launchMethod === 'manual'
          ? `Wiki ingest queued for ${body.topic}. Run the command below to start TAW.`
          : `Wiki ingest queued for ${body.topic}.`,
        body.command || ''
      );
    }
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'Unknown extension error.',
      ''
    );
  } finally {
    setBusy(false);
  }
}

async function pollJobStatus(jobId, topic, token) {
  const maxAttempts = 90; // ~3 minutes at 2s intervals
  let attempts = 0;

  const poll = async () => {
    if (attempts >= maxAttempts) {
      setStatus(`Wiki ingest for ${topic} is still running (check TAW for status).`, '');
      return;
    }

    attempts += 1;

    try {
      const response = await fetch(`${bridgeBaseUrl}/job/${jobId}`, {
        headers: { 'x-taw-token': token }
      });
      if (!response.ok) return;
      const body = await response.json();
      const job = body.job;

      if (job?.status === 'success') {
        setStatus(`Wiki ingest complete for ${topic}.`, '');
        return;
      }

      if (job?.status === 'failed') {
        setStatus(`Wiki ingest failed for ${topic}. Check TAW logs for details.`, '');
        return;
      }

      // Still running — check again in 2s
      setTimeout(() => void poll(), 2000);
    } catch {
      // Bridge went away or network error — stop polling
    }
  };

  setTimeout(() => void poll(), 2000);
}

async function collectPageContext() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!tab?.id || !tab.url) {
    throw new Error('No active tab is available.');
  }

  const extraction = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageContext
  });

  const pageContext = extraction[0]?.result;
  if (!pageContext) {
    throw new Error('Could not extract page context.');
  }

  return { tab, pageContext };
}

async function restoreSavedFields() {
  const saved = await chrome.storage.local.get([
    'token',
    'cwd',
    'researchType',
    'workflowType',
    'wikiTopic',
    'wikiAutoIngestDefault'
  ]);
  tokenInput.value = saved.token || '';
  cwdInput.value = saved.cwd || '';
  if (saved.researchType) {
    researchTypeInput.value = saved.researchType;
  }
  if (saved.workflowType) {
    workflowTypeInput.value = saved.workflowType;
  }
  wikiAutoIngestDefaultInput.checked = saved.wikiAutoIngestDefault === true;
  wikiAutoIngestInput.checked = wikiAutoIngestDefaultInput.checked;
  if (saved.wikiTopic) {
    wikiTopicInput.value = saved.wikiTopic;
  }
}

async function refreshWikiTopics() {
  const token = tokenInput.value.trim();
  if (!token) {
    wikiTopicInput.innerHTML = '<option value="__new__">New Topic…</option>';
    wikiTopicInput.value = '__new__';
    renderWorkflowFields();
    return;
  }

  try {
    const response = await fetch(`${bridgeBaseUrl}/wiki/topics`, {
      headers: {
        'x-taw-token': token
      }
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Could not load wiki topics.');
    }

    const topics = Array.isArray(body.topics) ? body.topics : [];
    wikiTopicInput.innerHTML = [
      ...topics.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`),
      '<option value="__new__">New Topic…</option>'
    ].join('');

    const saved = await chrome.storage.local.get(['wikiTopic']);
    wikiTopicInput.value =
      saved.wikiTopic && topics.includes(saved.wikiTopic)
        ? saved.wikiTopic
        : topics[0] || '__new__';
  } catch {
    wikiTopicInput.innerHTML = '<option value="__new__">New Topic…</option>';
    wikiTopicInput.value = '__new__';
  }

  renderWorkflowFields();
}

async function refreshBackendStatus() {
  await controlBackend('status', { quiet: true });
}

async function controlBackend(action, options = {}) {
  const { quiet = false } = options;
  setBackendBusy(true);

  try {
    const token = tokenInput.value.trim();
    if (!token) {
      throw new Error(
        'Enter the bridge token from ~/.config/taw/bridge-token.'
      );
    }

    const url =
      action === 'status'
        ? `${bridgeBaseUrl}/search-backend/status`
        : `${bridgeBaseUrl}/search-backend/${action}`;

    const response = await fetch(url, {
      method: action === 'status' ? 'GET' : 'POST',
      headers: {
        'x-taw-token': token
      }
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Search backend request failed.');
    }

    renderBackendStatus(body.status);
    if (!quiet && action !== 'status') {
      setStatus(`Search backend ${action} request completed.`, '');
    }
  } catch (error) {
    renderBackendError(
      error instanceof Error ? error.message : 'Unknown backend error.'
    );
  } finally {
    setBackendBusy(false);
  }
}

async function saveFields() {
  await chrome.storage.local.set({
    token: tokenInput.value.trim(),
    cwd: cwdInput.value.trim(),
    researchType: researchTypeInput.value,
    workflowType: workflowTypeInput.value,
    wikiAutoIngestDefault: wikiAutoIngestDefaultInput.checked,
    wikiTopic:
      wikiTopicInput.value === '__new__'
        ? newWikiTopicInput.value.trim()
        : wikiTopicInput.value
  });
}

async function inferResearchTypeFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return;
  }

  if (tab.url.includes('github.com/')) {
    researchTypeInput.value = 'repo';
    return;
  }

  if (tab.url.includes('youtube.com/') || tab.url.includes('youtu.be/')) {
    researchTypeInput.value = 'video';
    return;
  }

  if (
    tab.url.includes('news.ycombinator.com') ||
    tab.url.includes('openai.com') ||
    tab.url.includes('anthropic.com')
  ) {
    researchTypeInput.value = 'tech';
  }
}

function renderWorkflowFields() {
  const isResearch = workflowTypeInput.value === 'research';
  researchTypeInput.parentElement.hidden = !isResearch;
  initialQuestionInput.parentElement.hidden = !isResearch;
  wikiSection.hidden = isResearch;
  newTopicLabel.hidden = wikiTopicInput.value !== '__new__';
  sendPageButton.hidden = !isResearch;
  sendSelectionButton.hidden = !isResearch;
  sendWikiButton.hidden = isResearch;
}

function detectKind(url) {
  if (url.includes('github.com/')) {
    return 'repo';
  }

  if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
    return 'video';
  }

  return 'article';
}

function setBusy(isBusy) {
  sendPageButton.disabled = isBusy;
  sendSelectionButton.disabled = isBusy;
  sendWikiButton.disabled = isBusy;
}

function setBackendBusy(isBusy) {
  refreshBackendButton.disabled = isBusy;
  startBackendButton.disabled = isBusy;
  keepWarmButton.disabled = isBusy;
  stopBackendButton.disabled = isBusy;
}

function setStatus(message, detail) {
  statusEl.textContent = message;
  detailEl.textContent = detail;
}

function renderBackendStatus(status) {
  if (!status.enabled) {
    backendStatusEl.textContent = 'SearXNG is disabled in TAW config.';
    backendMetaEl.textContent = '';
    return;
  }

  if (!status.dockerAvailable) {
    backendStatusEl.textContent = 'Docker Compose is not available.';
    backendMetaEl.textContent = status.lastError || '';
    return;
  }

  backendStatusEl.textContent = status.healthy
    ? 'SearXNG is running and healthy.'
    : status.running
      ? 'SearXNG is starting or unhealthy.'
      : 'SearXNG is stopped.';

  backendMetaEl.textContent = [
    `Auto-start: ${status.autoStart ? 'on' : 'off'}`,
    `Idle timeout: ${status.idleMinutes}m`,
    status.autoStopAt ? `Auto-stop: ${status.autoStopAt}` : null
  ]
    .filter(Boolean)
    .join('\n');
}

function renderBackendError(message) {
  backendStatusEl.textContent = 'Search backend unavailable.';
  backendMetaEl.textContent = message;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function extractPageContext() {
  const selectedText = window.getSelection()?.toString().trim() || null;
  const root =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.body;

  const pageTextExcerpt = root?.innerText
    ? root.innerText.replace(/\s+\n/g, '\n').trim().slice(0, 12000)
    : null;

  return {
    title: document.title || null,
    selectedText,
    pageTextExcerpt
  };
}
