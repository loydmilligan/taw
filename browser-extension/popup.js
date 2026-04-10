const bridgeBaseUrl = 'http://127.0.0.1:4317';

const researchTypeInput = document.getElementById('researchType');
const tokenInput = document.getElementById('token');
const cwdInput = document.getElementById('cwd');
const initialQuestionInput = document.getElementById('initialQuestion');
const noteInput = document.getElementById('note');
const sendPageButton = document.getElementById('sendPage');
const sendSelectionButton = document.getElementById('sendSelection');
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

sendPageButton.addEventListener(
  'click',
  () => void submit({ selectionOnly: false })
);
sendSelectionButton.addEventListener(
  'click',
  () => void submit({ selectionOnly: true })
);
refreshBackendButton.addEventListener('click', () => void refreshBackendStatus());
startBackendButton.addEventListener('click', () => void controlBackend('start'));
keepWarmButton.addEventListener('click', () => void controlBackend('touch'));
stopBackendButton.addEventListener('click', () => void controlBackend('stop'));

async function submit({ selectionOnly }) {
  setBusy(true);
  setStatus('Collecting page data...', '');

  try {
    const token = tokenInput.value.trim();
    if (!token) {
      throw new Error(
        'Enter the bridge token from ~/.config/taw/bridge-token.'
      );
    }

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
        ? 'Payload sent. Run the command below to start TAW.'
        : 'Payload sent to TAW successfully.',
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

async function restoreSavedFields() {
  const saved = await chrome.storage.local.get([
    'token',
    'cwd',
    'researchType'
  ]);
  tokenInput.value = saved.token || '';
  cwdInput.value = saved.cwd || '';
  if (saved.researchType) {
    researchTypeInput.value = saved.researchType;
  }
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
    researchType: researchTypeInput.value
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
    `URL: ${status.baseUrl}`,
    `Idle Stop: ${status.idleMinutes} min`,
    `Auto-stop at: ${status.autoStopAt || 'not scheduled'}`,
    `Compose: ${status.composeFile}`,
    status.lastError ? `Last error: ${status.lastError}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function renderBackendError(message) {
  backendStatusEl.textContent = message;
  backendMetaEl.textContent = '';
}

function extractPageContext() {
  const selectedText = globalThis.getSelection?.()?.toString().trim() || null;
  const rawText = document.body?.innerText || '';
  const pageTextExcerpt = rawText.trim().slice(0, 5000) || null;

  return {
    title: document.title,
    selectedText,
    pageTextExcerpt
  };
}
