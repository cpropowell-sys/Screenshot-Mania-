chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SM_CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab?.windowId;

    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError?.message || 'Unable to capture this tab.'
        });
        return;
      }

      sendResponse({ ok: true, dataUrl });
    });

    return true;
  }

  if (message?.type === 'SM_OPEN_SIDE_PANEL') {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;

    if (!chrome.sidePanel?.open || (!tabId && !windowId)) {
      sendResponse({ ok: false, error: 'Side panel is not available in this browser.' });
      return false;
    }

    chrome.sidePanel.open(tabId ? { tabId } : { windowId }).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: error?.message || 'Unable to open side panel.' })
    );

    return true;
  }

  return false;
});
