(() => {
  if (window.__screenshotManiaLoaded) return;
  window.__screenshotManiaLoaded = true;

  const SHAKE_WINDOW_MS = 850;
  const SHAKE_MIN_SWITCHES = 5;
  const SHAKE_MIN_TRAVEL = 230;
  const BUBBLE_HIDE_MS = 5200;
  const MIN_CAPTURE_SIZE = 6;
  const DRAG_THRESHOLD = 8;
  const SMART_PADDING = 4;
  const STORE_KEY = 'sm_captures';
  const MAX_CAPTURES = 24;

  let lastX = null;
  let lastDirection = 0;
  let shakeSwitches = [];
  let shakeTravel = 0;
  let bubbleTimer = null;
  let selecting = false;
  let manualDragging = false;
  let startPoint = null;
  let smartRect = null;
  let latestCapture = null;
  let toastTimer = null;

  const bubble = document.createElement('button');
  bubble.id = 'sm-capture-bubble';
  bubble.type = 'button';
  bubble.setAttribute('aria-label', 'Capture screenshot');
  bubble.innerHTML = '<span class="sm-bubble-dot">✦</span><span>Capture</span>';

  const layer = document.createElement('div');
  layer.id = 'sm-selection-layer';
  layer.innerHTML = '<div id="sm-selection-hint">Click the highlighted box for smart capture • drag for manual • Esc to cancel</div><div id="sm-selection-box"><span id="sm-smart-label">Smart area</span></div><div id="sm-capture-toolbar"><button type="button" data-action="copy">Copy</button><button type="button" data-action="open">Open tab</button><button type="button" data-action="panel">Side panel</button></div>';

  const toast = document.createElement('div');
  toast.id = 'sm-toast';

  document.documentElement.append(bubble, layer, toast);

  const box = layer.querySelector('#sm-selection-box');
  const toolbar = layer.querySelector('#sm-capture-toolbar');

  document.addEventListener('mousemove', detectShake, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layer.classList.contains('sm-active')) {
      endSelection();
      showToast('Capture cancelled');
    }
  });

  bubble.addEventListener('click', () => {
    hideBubble();
    beginSelection();
  });

  layer.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.target.closest('#sm-capture-toolbar')) return;
    selecting = true;
    manualDragging = false;
    startPoint = { x: event.clientX, y: event.clientY };
    latestCapture = null;
    toolbar.classList.remove('sm-visible');
    updateSmartBox(event.clientX, event.clientY);
    event.preventDefault();
  });

  layer.addEventListener('mousemove', (event) => {
    if (!layer.classList.contains('sm-active')) return;

    if (!selecting || !startPoint) {
      updateSmartBox(event.clientX, event.clientY);
      return;
    }

    const distance = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
    if (distance >= DRAG_THRESHOLD) manualDragging = true;

    if (manualDragging) {
      updateSelectionBox(startPoint.x, startPoint.y, event.clientX, event.clientY, 'manual');
    } else {
      updateSmartBox(event.clientX, event.clientY);
    }
  });

  layer.addEventListener('mouseup', async (event) => {
    if (!selecting || !startPoint) return;
    selecting = false;

    const manualRect = normalizeRect(startPoint.x, startPoint.y, event.clientX, event.clientY);
    const rect = manualDragging ? manualRect : smartRect || viewportRect();
    const mode = manualDragging ? 'manual' : 'smart';

    if (rect.width < MIN_CAPTURE_SIZE || rect.height < MIN_CAPTURE_SIZE) {
      endSelection();
      showToast('Selection was too small');
      return;
    }

    await captureAndStore(rect, mode);
  });

  toolbar.addEventListener('click', async (event) => {
    const action = event.target?.dataset?.action;
    if (!action || !latestCapture) return;

    if (action === 'copy') {
      await copyDataUrlToClipboard(latestCapture.dataUrl);
      showToast('Copied again');
    }

    if (action === 'open') {
      window.open(latestCapture.dataUrl, '_blank', 'noopener,noreferrer');
      showToast('Opened capture in a new tab');
    }

    if (action === 'panel') {
      openSidePanel();
    }
  });

  function detectShake(event) {
    if (layer.classList.contains('sm-active')) return;

    const now = Date.now();
    if (lastX === null) {
      lastX = event.clientX;
      return;
    }

    const delta = event.clientX - lastX;
    lastX = event.clientX;

    if (Math.abs(delta) < 9) return;

    const direction = Math.sign(delta);
    shakeTravel += Math.abs(delta);

    if (lastDirection && direction !== lastDirection) {
      shakeSwitches.push(now);
      shakeSwitches = shakeSwitches.filter((time) => now - time < SHAKE_WINDOW_MS);
      if (shakeSwitches.length >= SHAKE_MIN_SWITCHES && shakeTravel >= SHAKE_MIN_TRAVEL) {
        showBubble();
        shakeSwitches = [];
        shakeTravel = 0;
      }
    }

    lastDirection = direction;
    if (shakeSwitches.length === 0) shakeTravel = Math.min(shakeTravel, SHAKE_MIN_TRAVEL);
  }

  function showBubble() {
    bubble.classList.add('sm-visible');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, BUBBLE_HIDE_MS);
  }

  function hideBubble() {
    bubble.classList.remove('sm-visible');
    clearTimeout(bubbleTimer);
  }

  function beginSelection() {
    layer.classList.add('sm-active');
    box.classList.remove('sm-visible');
    toolbar.classList.remove('sm-visible');
    smartRect = null;
  }

  function endSelection({ keepCapture = false } = {}) {
    selecting = false;
    manualDragging = false;
    startPoint = null;
    smartRect = null;
    if (!keepCapture) latestCapture = null;
    layer.classList.remove('sm-active');
    box.classList.remove('sm-visible', 'sm-smart', 'sm-manual');
    toolbar.classList.remove('sm-visible');
  }

  function normalizeRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return clampRectToViewport({ left, top, width: right - left, height: bottom - top });
  }

  function viewportRect() {
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function clampRectToViewport(rect) {
    const left = Math.max(0, Math.min(window.innerWidth, rect.left));
    const top = Math.max(0, Math.min(window.innerHeight, rect.top));
    const right = Math.max(left, Math.min(window.innerWidth, rect.left + rect.width));
    const bottom = Math.max(top, Math.min(window.innerHeight, rect.top + rect.height));
    return { left, top, width: right - left, height: bottom - top };
  }

  function updateSelectionBox(x1, y1, x2, y2, mode) {
    const rect = normalizeRect(x1, y1, x2, y2);
    paintBox(rect, mode);
  }

  function updateSmartBox(x, y) {
    smartRect = findSmartRect(x, y) || viewportRect();
    paintBox(smartRect, 'smart');
  }

  function paintBox(rect, mode) {
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.classList.toggle('sm-smart', mode === 'smart');
    box.classList.toggle('sm-manual', mode === 'manual');
    box.classList.add('sm-visible');
  }

  function positionToolbar(rect) {
    const top = Math.min(window.innerHeight - 56, rect.top + rect.height + 10);
    const left = Math.min(window.innerWidth - 300, Math.max(12, rect.left));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${Math.max(12, top)}px`;
    toolbar.classList.add('sm-visible');
  }

  function findSmartRect(x, y) {
    const element = getPageElementAtPoint(x, y);
    if (!element) return null;

    let best = null;
    let candidate = element;
    let depth = 0;

    while (candidate && candidate !== document.documentElement && candidate !== document.body && depth < 8) {
      const rect = getUsableRect(candidate);
      if (rect) {
        const score = scoreElement(candidate, rect, depth);
        if (!best || score > best.score) best = { rect, score };
      }
      candidate = candidate.parentElement;
      depth += 1;
    }

    return best?.rect || getUsableRect(element);
  }

  function getPageElementAtPoint(x, y) {
    const previousPointerEvents = layer.style.pointerEvents;
    layer.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    layer.style.pointerEvents = previousPointerEvents;
    return element;
  }

  function getUsableRect(element) {
    const rawRect = element.getBoundingClientRect();
    if (!rawRect || rawRect.width < MIN_CAPTURE_SIZE || rawRect.height < MIN_CAPTURE_SIZE) return null;

    const rect = clampRectToViewport({
      left: rawRect.left - SMART_PADDING,
      top: rawRect.top - SMART_PADDING,
      width: rawRect.width + SMART_PADDING * 2,
      height: rawRect.height + SMART_PADDING * 2
    });

    if (rect.width < MIN_CAPTURE_SIZE || rect.height < MIN_CAPTURE_SIZE) return null;
    return rect;
  }

  function scoreElement(element, rect, depth) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute('role') || '';
    const label = `${element.id} ${element.className || ''} ${role}`.toLowerCase();
    const style = getComputedStyle(element);
    const viewportArea = window.innerWidth * window.innerHeight;
    const area = rect.width * rect.height;
    let score = 80 - depth * 7;

    if (['article', 'section', 'main', 'aside', 'dialog', 'figure', 'img', 'video', 'canvas', 'table', 'pre', 'blockquote'].includes(tag)) score += 32;
    if (['dialog', 'alertdialog', 'tabpanel', 'region', 'article', 'complementary', 'main'].includes(role)) score += 28;
    if (/card|modal|dialog|drawer|panel|popover|toast|tooltip|menu|dropdown|post|tweet|message|comment|content|container|box|widget/.test(label)) score += 26;
    if (style.boxShadow !== 'none') score += 18;
    if (style.borderRadius !== '0px') score += 10;
    if (hasVisibleBorder(style)) score += 10;
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') score += 8;
    if (area > viewportArea * 0.9) score -= 70;
    if (area < 1200) score -= 20;
    if (rect.width < 32 || rect.height < 24) score -= 24;
    if (tag === 'a' || tag === 'button') score -= 14;

    return score;
  }

  function hasVisibleBorder(style) {
    return ['Top', 'Right', 'Bottom', 'Left'].some((side) => {
      const width = parseFloat(style[`border${side}Width`]);
      return width > 0 && style[`border${side}Style`] !== 'none';
    });
  }

  async function captureAndStore(rect, mode) {
    const captureRectForToolbar = rect;

    try {
      layer.classList.remove('sm-active');
      box.classList.remove('sm-visible');
      toolbar.classList.remove('sm-visible');
      toast.classList.remove('sm-visible');
      clearTimeout(toastTimer);
      await waitForPaint();

      latestCapture = await captureRect(rect, mode);
      await copyDataUrlToClipboard(latestCapture.dataUrl);
      await saveCapture(latestCapture);
      showToast(mode === 'smart' ? 'Smart capture copied to clipboard' : 'Screenshot copied to clipboard');

      layer.classList.add('sm-active');
      positionToolbar(captureRectForToolbar);
      openSidePanel({ silent: true });
    } catch (error) {
      endSelection();
      showToast(error?.message || 'Capture failed');
    }
  }

  function waitForPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function captureRect(rect, mode) {
    const response = await chrome.runtime.sendMessage({ type: 'SM_CAPTURE_VISIBLE_TAB' });
    if (!response?.ok) throw new Error(response?.error || 'Unable to capture this tab.');

    const croppedDataUrl = await cropDataUrl(response.dataUrl, rect);
    const now = new Date();
    return {
      id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
      dataUrl: croppedDataUrl,
      createdAt: now.toISOString(),
      title: document.title || location.hostname || 'Screenshot',
      url: location.href,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      mode
    };
  }

  async function cropDataUrl(dataUrl, rect) {
    const image = await loadImage(dataUrl);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * scaleX));
    canvas.height = Math.max(1, Math.round(rect.height * scaleY));

    const context = canvas.getContext('2d');
    context.drawImage(
      image,
      Math.round(rect.left * scaleX),
      Math.round(rect.top * scaleY),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL('image/png');
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to read captured image.'));
      image.src = src;
    });
  }

  async function copyDataUrlToClipboard(dataUrl) {
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      throw new Error('Image clipboard copy is not available on this page.');
    }

    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }

  async function saveCapture(capture) {
    const existing = await chrome.storage.local.get(STORE_KEY);
    const captures = Array.isArray(existing[STORE_KEY]) ? existing[STORE_KEY] : [];
    captures.unshift(capture);
    await chrome.storage.local.set({ [STORE_KEY]: captures.slice(0, MAX_CAPTURES) });
  }

  function openSidePanel({ silent = false } = {}) {
    chrome.runtime.sendMessage({ type: 'SM_OPEN_SIDE_PANEL' }, (response) => {
      if (silent) return;
      showToast(response?.ok ? 'Opened side panel' : response?.error || 'Open the side panel from the extension icon');
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('sm-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('sm-visible'), 2300);
  }
})();
