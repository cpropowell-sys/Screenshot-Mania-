const STORE_KEY = 'sm_captures';

const capturesRoot = document.querySelector('#captures');
const template = document.querySelector('#capture-card-template');
const clearAllButton = document.querySelector('#clear-all');

let captures = [];

chrome.storage.local.get(STORE_KEY).then((result) => {
  captures = Array.isArray(result[STORE_KEY]) ? result[STORE_KEY] : [];
  render();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORE_KEY]) return;
  captures = Array.isArray(changes[STORE_KEY].newValue) ? changes[STORE_KEY].newValue : [];
  render();
});

clearAllButton.addEventListener('click', async () => {
  captures = [];
  await chrome.storage.local.set({ [STORE_KEY]: captures });
  render();
});

capturesRoot.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  const card = event.target.closest('.capture-card');
  if (!button || !card) return;

  const capture = captures.find((item) => item.id === card.dataset.id);
  if (!capture) return;

  const action = button.dataset.action;
  if (action === 'copy') await copyCapture(capture);
  if (action === 'open') openCapture(capture);
  if (action === 'download') downloadCapture(capture);
  if (action === 'delete') await deleteCapture(capture.id);
});

function render() {
  capturesRoot.replaceChildren();
  clearAllButton.disabled = captures.length === 0;

  if (captures.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No captures yet. Shake your mouse on a webpage to start.';
    capturesRoot.append(empty);
    return;
  }

  for (const capture of captures) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = capture.id;
    node.querySelector('img').src = capture.dataUrl;
    node.querySelector('h2').textContent = capture.title || 'Screenshot';
    const mode = capture.mode === 'smart' ? 'Smart' : 'Manual';
    node.querySelector('p').textContent = `${mode} • ${formatDate(capture.createdAt)} • ${capture.width}×${capture.height}`;
    capturesRoot.append(node);
  }
}

async function copyCapture(capture) {
  if (!navigator.clipboard?.write || !window.ClipboardItem) return;
  const blob = await (await fetch(capture.dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

function openCapture(capture) {
  chrome.tabs.create({ url: capture.dataUrl });
}

function downloadCapture(capture) {
  const link = document.createElement('a');
  link.href = capture.dataUrl;
  link.download = `screenshot-mania-${new Date(capture.createdAt).toISOString().replace(/[:.]/g, '-')}.png`;
  link.click();
}

async function deleteCapture(id) {
  captures = captures.filter((capture) => capture.id !== id);
  await chrome.storage.local.set({ [STORE_KEY]: captures });
  render();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}
