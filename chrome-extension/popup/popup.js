document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const unpairedView = document.getElementById('unpaired-view');
  const pairedView = document.getElementById('paired-view');
  const userEmail = document.getElementById('user-email');
  const currentHostname = document.getElementById('current-hostname');
  const matchesStatus = document.getElementById('matches-status');
  const matchesList = document.getElementById('matches-list');
  const pairCodeInput = document.getElementById('pair-code-input');
  const pairBtn = document.getElementById('pair-btn');
  const unpairBtn = document.getElementById('unpair-btn');
  const popupError = document.getElementById('popup-error');

  function showError(msg) {
    popupError.textContent = msg;
    popupError.classList.remove('hidden');
    setTimeout(() => popupError.classList.add('hidden'), 4000);
  }

  // Check pairing status
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, async (status) => {
    if (status && status.paired) {
      showPaired(status.email);
    } else {
      showUnpaired();
    }
  });

  function showUnpaired() {
    statusBadge.className = 'status-badge disconnected';
    statusText.textContent = 'Disconnected';
    unpairedView.classList.remove('hidden');
    pairedView.classList.add('hidden');
  }

  async function showPaired(email) {
    statusBadge.className = 'status-badge connected';
    statusText.textContent = 'Connected';
    userEmail.textContent = email || 'Vault Active';
    unpairedView.classList.add('hidden');
    pairedView.classList.remove('hidden');

    // Query active tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      currentHostname.textContent = 'No web page active';
      matchesStatus.textContent = 'Open a web page to match credentials.';
      return;
    }

    try {
      const parsed = new URL(tab.url);
      currentHostname.textContent = parsed.hostname;

      matchesStatus.textContent = 'Querying matching credentials...';
      matchesList.innerHTML = '';

      chrome.runtime.sendMessage(
        { type: 'QUERY_CREDENTIALS', url: tab.url },
        (res) => {
          if (!res || !res.paired) {
            showUnpaired();
            return;
          }

          const matches = res.matches || [];
          if (matches.length === 0) {
            matchesStatus.textContent = '0 matching credentials in vault.';
            matchesList.innerHTML = '<div class="hint">No stored credentials match this website.</div>';
            return;
          }

          matchesStatus.textContent = `${matches.length} matching credential(s) found:`;

          matches.forEach((m) => {
            const card = document.createElement('div');
            card.className = 'match-card';

            const catColor =
              m.category === 'SHAREABLE'
                ? '#34d399'
                : m.category === 'RESTRICTED'
                ? '#fbbf24'
                : '#f87171';
            const catBg =
              m.category === 'SHAREABLE'
                ? 'rgba(16, 185, 129, 0.15)'
                : m.category === 'RESTRICTED'
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(239, 68, 68, 0.15)';

            card.innerHTML = `
              <div class="match-info">
                <div class="match-name">${escapeHtml(m.websiteName)}</div>
                <div class="match-badge" style="color: ${catColor}; background: ${catBg}; border: 1px solid ${catColor}40;">
                  ${m.category.replace('_', ' ')}
                </div>
              </div>
              <div class="match-action">Autofill</div>
            `;

            card.addEventListener('click', () => {
              matchesStatus.textContent = 'Authorizing and autofilling...';
              chrome.runtime.sendMessage(
                {
                  type: 'AUTHORIZE_AND_RELEASE',
                  credentialId: m.id,
                  category: m.category,
                  tabId: tab.id,
                },
                async (authRes) => {
                  if (authRes && authRes.success && authRes.credentials) {
                    try {
                      await chrome.tabs.sendMessage(tab.id, {
                        type: 'INJECT_CREDENTIALS',
                        credentials: authRes.credentials,
                      });
                    } catch {}
                    window.close();
                  } else if (authRes && !authRes.success) {
                    showError(authRes?.error || 'Verification failed. Credential not released.');
                    matchesStatus.textContent = 'Authorization rejected.';
                  }
                }
              );
            });

            matchesList.appendChild(card);
          });
        }
      );
    } catch {
      currentHostname.textContent = 'Invalid URL';
      matchesStatus.textContent = 'Non-HTTP page.';
    }
  }

  // Pair button click
  pairBtn.addEventListener('click', () => {
    const code = pairCodeInput.value.trim();
    if (!code) {
      showError('Please enter a valid pairing code.');
      return;
    }

    pairBtn.disabled = true;
    pairBtn.textContent = 'Linking...';

    chrome.runtime.sendMessage({ type: 'PAIR_WITH_CODE', code }, (res) => {
      pairBtn.disabled = false;
      pairBtn.textContent = 'Link Extension';

      if (res && res.success) {
        showPaired(res.email);
      } else {
        showError(res?.error || 'Failed to pair extension.');
      }
    });
  });

  // Unpair button click
  unpairBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'UNPAIR' }, () => {
      showUnpaired();
    });
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  }
});
