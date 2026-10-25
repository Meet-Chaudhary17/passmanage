const API_BASE = 'http://localhost:5000/api';

// Helper to retrieve extension auth token
async function getAuthToken() {
  const data = await chrome.storage.local.get(['extensionToken', 'userEmail']);
  return data.extensionToken || null;
}

// Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['extensionToken', 'userEmail'], (data) => {
      sendResponse({
        paired: !!data.extensionToken,
        email: data.userEmail || null,
      });
    });
    return true; // async
  }

  if (message.type === 'PAIR_WITH_CODE') {
    handlePairing(message.code, message.deviceName || 'Chrome Companion')
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'UNPAIR') {
    chrome.storage.local.remove(['extensionToken', 'userEmail'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'QUERY_CREDENTIALS') {
    handleQueryCredentials(message.url)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message, matches: [] }));
    return true;
  }

  if (message.type === 'AUTHORIZE_AND_RELEASE') {
    const targetTabId = message.tabId || sender.tab?.id;
    handleAuthorizeAndRelease(message.credentialId, message.category, targetTabId)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Pairing implementation
async function handlePairing(code, deviceName) {
  const response = await fetch(`${API_BASE}/extension/pair-challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceName }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to exchange pairing challenge code');
  }

  await chrome.storage.local.set({
    extensionToken: data.extensionToken,
    userEmail: data.user?.email || 'Authenticated User',
  });

  return { success: true, email: data.user?.email };
}

// Metadata query implementation (Zero plaintext passwords returned)
async function handleQueryCredentials(url) {
  const token = await getAuthToken();
  if (!token) {
    return { paired: false, matches: [] };
  }

  const response = await fetch(
    `${API_BASE}/extension/query-credentials?url=${encodeURIComponent(url)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (response.status === 401) {
    await chrome.storage.local.remove(['extensionToken', 'userEmail']);
    return { paired: false, matches: [] };
  }

  const data = await response.json();
  return {
    paired: true,
    matches: data.matches || [],
  };
}

// Progressive authorization and credential release
async function handleAuthorizeAndRelease(credentialId, clientCategoryHint, targetTabId) {
  const token = await getAuthToken();
  if (!token) throw new Error('Extension is not paired to a vault.');

  // Helper to inject credentials into target tab
  const injectIntoTab = async (credentials) => {
    if (!targetTabId) return;
    try {
      // 1. Store in chrome.storage.local so content.js can pull upon focus/visibility
      await chrome.storage.local.set({
        pendingAutofill: {
          tabId: targetTabId,
          credentials,
          timestamp: Date.now(),
        },
      });

      // 2. Bring target tab to the foreground
      await chrome.tabs.update(targetTabId, { active: true });

      // 3. Retry sending message to give content script time to wake up and process
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 250 : 350));
        try {
          const resp = await chrome.tabs.sendMessage(targetTabId, {
            type: 'INJECT_CREDENTIALS',
            credentials,
          });
          if (resp && resp.success) {
            await chrome.storage.local.remove(['pendingAutofill']);
            break;
          }
        } catch (msgErr) {
          // Tab transitioning or waking up, retry next tick
        }
      }
    } catch (e) {
      console.warn('[PassManage] Tab injection warning:', e);
    }
  };

  // 1. If Shareable, attempt direct session initiation
  if (clientCategoryHint === 'SHAREABLE') {
    const initRes = await fetch(`${API_BASE}/vault/${credentialId}/initiate-access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const initData = await initRes.json();

    if (initData.authorized && initData.releaseToken) {
      // Release plaintext credentials
      const relRes = await fetch(`${API_BASE}/vault/${credentialId}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ releaseToken: initData.releaseToken }),
      });
      const relData = await relRes.json();
      if (!relRes.ok) throw new Error(relData.error || 'Credential release failed.');
      await injectIntoTab(relData);
      return { success: true, credentials: relData };
    }
  }

  // 2. Restricted or High Sensitivity: Open localhost verification bridge
  const sessionRes = await fetch(`${API_BASE}/extension/request-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ credentialId }),
  });

  const sessionData = await sessionRes.json();
  if (!sessionRes.ok) throw new Error(sessionData.error || 'Failed to initialize verification session.');

  if (sessionData.status === 'COMPLETED' && sessionData.releaseToken) {
    // Already satisfied
    const relRes = await fetch(`${API_BASE}/vault/${credentialId}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ releaseToken: sessionData.releaseToken }),
    });
    const relData = await relRes.json();
    await injectIntoTab(relData);
    return { success: true, credentials: relData };
  }

  // Open verification tab on localhost
  const verificationTab = await chrome.tabs.create({
    url: sessionData.verificationUrl,
    active: true,
  });

  // Poll for completion (up to 120 seconds)
  const pollInterval = 1500;
  const maxAttempts = 80;
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(intervalId);
        try { chrome.tabs.remove(verificationTab.id); } catch {}
        return reject(new Error('Verification timed out.'));
      }

      try {
        const checkRes = await fetch(`${API_BASE}/extension/session/${sessionData.sessionId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const checkData = await checkRes.json();

        if (checkData.status === 'COMPLETED' && checkData.releaseToken) {
          clearInterval(intervalId);
          try { chrome.tabs.remove(verificationTab.id); } catch {}

          // Release credentials
          const relRes = await fetch(`${API_BASE}/vault/${credentialId}/release`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ releaseToken: checkData.releaseToken }),
          });
          const relData = await relRes.json();
          if (!relRes.ok) return reject(new Error(relData.error || 'Failed to decrypt credential.'));

          // Activate target tab and inject credentials
          await injectIntoTab(relData);

          return resolve({ success: true, credentials: relData });
        } else if (checkData.status === 'FAILED') {
          clearInterval(intervalId);
          try { chrome.tabs.remove(verificationTab.id); } catch {}
          return reject(new Error('Biometric or passkey verification failed.'));
        }
      } catch (err) {
        // network polling glitch, continue
      }
    }, pollInterval);
  });
}
