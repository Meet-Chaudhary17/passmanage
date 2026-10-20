// PassManage Content Script (Manifest V3)
(() => {
  // Avoid duplicate injection
  if (window.__PASSMANAGE_CONTENT_INJECTED__) return;
  window.__PASSMANAGE_CONTENT_INJECTED__ = true;

  // Signal web page that extension is active
  window.__PASSMANAGE_EXTENSION_ACTIVE__ = true;
  window.dispatchEvent(new CustomEvent('passmanage:extension_active'));

  let pageMatches = [];
  let activeDropdown = null;
  let topBannerEl = null;

  // 1. Native value setter ensuring React / Vue / Angular state updates
  function setNativeValue(element, value) {
    if (!element) return;
    try {
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      element.focus();
      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      element.blur();
    } catch (err) {
      element.value = value;
    }
  }

  // 2. Robust Login Fields Detection
  function detectLoginFields() {
    // A. Find password inputs
    const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter((el) => {
      if (el.type !== 'password') return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.type !== 'hidden';
    });

    const passwordInput = passwordInputs[0] || document.querySelector('input[type="password"]');

    // B. Find candidate username/email input
    let usernameInput = null;

    const userSelectors = [
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[type="email"]',
      'input[name*="user" i]',
      'input[name*="uname" i]',
      'input[name*="login" i]',
      'input[name*="email" i]',
      'input[name*="reg" i]',
      'input[name*="roll" i]',
      'input[name*="account" i]',
      'input[id*="user" i]',
      'input[id*="uname" i]',
      'input[id*="login" i]',
      'input[id*="email" i]',
      'input[id*="reg" i]',
      'input[id*="roll" i]',
      'input[id*="account" i]',
      'input[placeholder*="user" i]',
      'input[placeholder*="uname" i]',
      'input[placeholder*="login" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="reg" i]',
    ];

    for (const sel of userSelectors) {
      const candidates = Array.from(document.querySelectorAll(sel)).filter((el) => {
        const type = (el.type || '').toLowerCase();
        const style = window.getComputedStyle(el);
        return (
          el !== passwordInput &&
          (type === 'text' || type === 'email' || type === '') &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      });
      if (candidates.length > 0) {
        usernameInput = candidates[0];
        break;
      }
    }

    // Fallback: the visible input directly preceding the password input
    if (!usernameInput && passwordInput) {
      const allInputs = Array.from(
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])')
      ).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      const pIndex = allInputs.indexOf(passwordInput);
      if (pIndex > 0) {
        for (let i = pIndex - 1; i >= 0; i--) {
          const candidate = allInputs[i];
          const cType = (candidate.type || '').toLowerCase();
          if (cType === 'text' || cType === 'email' || cType === '') {
            usernameInput = candidate;
            break;
          }
        }
      }
    }

    return { usernameInput, passwordInput };
  }

  // 3. Fill fields with credentials
  function autofillFields(credentials) {
    const fields = detectLoginFields();
    let filled = false;

    if (fields.usernameInput && credentials.username) {
      setNativeValue(fields.usernameInput, credentials.username);
      filled = true;
    }
    if (fields.passwordInput && credentials.password) {
      setNativeValue(fields.passwordInput, credentials.password);
      filled = true;
    }

    if (filled) {
      showToast('Credentials autofilled by PassManage.', 'success');
      return true;
    } else {
      // If neither was identified, attempt filling the active focused input
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        const active = document.activeElement;
        if (active.type === 'password' && credentials.password) {
          setNativeValue(active, credentials.password);
          showToast('Password autofilled into active input.', 'success');
          return true;
        } else if (credentials.username) {
          setNativeValue(active, credentials.username);
          showToast('Username autofilled into active input.', 'success');
          return true;
        }
      }
      showToast('Could not find username or password inputs on this page.', 'warning');
      return false;
    }
  }

  // 4. Message listener for direct injection from background or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INJECT_CREDENTIALS' && message.credentials) {
      const ok = autofillFields(message.credentials);
      sendResponse({ success: ok });
    }
  });

  // 5. Query matching credentials on page load
  function initPageCredentials() {
    chrome.runtime.sendMessage(
      { type: 'QUERY_CREDENTIALS', url: window.location.href },
      (res) => {
        if (!res || !res.paired || !res.matches || res.matches.length === 0) {
          return; // No stored credentials for this site
        }

        pageMatches = res.matches;
        showTopBanner(pageMatches);
        setupInputHooks();
      }
    );
  }

  // 6. Floating Top Banner (Google Password Manager style)
  function showTopBanner(matches) {
    if (topBannerEl || matches.length === 0) return;

    const banner = document.createElement('div');
    banner.className = 'passmanage-top-banner';

    const first = matches[0];

    banner.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span class="passmanage-banner-text">
        PassManage Vault: <strong>${escapeHtml(first.websiteName)}</strong>
      </span>
      <button class="passmanage-banner-btn" id="pm-banner-autofill-btn">
        Autofill
      </button>
      <button class="passmanage-banner-close" id="pm-banner-close-btn" title="Dismiss">
        &times;
      </button>
    `;

    document.body.appendChild(banner);
    topBannerEl = banner;

    banner.querySelector('#pm-banner-autofill-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      banner.remove();
      topBannerEl = null;
      if (matches.length === 1) {
        triggerAuthorizeAndRelease(first);
      } else {
        const fields = detectLoginFields();
        const target = fields.usernameInput || fields.passwordInput || document.body;
        renderDropdown(target, matches);
      }
    });

    banner.querySelector('#pm-banner-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      banner.remove();
      topBannerEl = null;
    });

    // Auto dismiss after 12 seconds
    setTimeout(() => {
      if (topBannerEl) {
        topBannerEl.remove();
        topBannerEl = null;
      }
    }, 12000);
  }

  // 7. Input focus hooks & field badge
  function setupInputHooks() {
    const fields = detectLoginFields();
    if (!fields.usernameInput && !fields.passwordInput) return;

    const targetInput = fields.usernameInput || fields.passwordInput;

    // Attach focus listener to open suggestion dropdown
    if (!targetInput.dataset.passmanageFocusHooked) {
      targetInput.dataset.passmanageFocusHooked = 'true';

      targetInput.addEventListener('focus', () => {
        if (pageMatches.length > 0 && !activeDropdown) {
          renderDropdown(targetInput, pageMatches);
        }
      });

      targetInput.addEventListener('click', () => {
        if (pageMatches.length > 0 && !activeDropdown) {
          renderDropdown(targetInput, pageMatches);
        }
      });
    }

    // Add field badge
    if (!targetInput.dataset.passmanageBadgeInjected) {
      targetInput.dataset.passmanageBadgeInjected = 'true';

      const badge = document.createElement('div');
      badge.className = 'passmanage-field-badge';
      badge.title = 'PassManage Vault Suggestions';
      badge.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      `;

      targetInput.parentNode.style.position = 'relative';
      badge.style.position = 'absolute';
      badge.style.right = '8px';
      badge.style.top = '50%';
      badge.style.transform = 'translateY(-50%)';
      badge.style.cursor = 'pointer';
      badge.style.zIndex = '9999';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.padding = '2px';

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        renderDropdown(targetInput, pageMatches);
      });

      targetInput.parentNode.appendChild(badge);
    }
  }

  // 8. Render Floating Suggestion Dropdown
  function renderDropdown(anchorElement, matches) {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }

    const rect = anchorElement.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'passmanage-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    dropdown.style.minWidth = `${Math.max(rect.width, 260)}px`;
    dropdown.style.zIndex = '2147483647';

    let html = `
      <div class="passmanage-dropdown-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>PassManage Suggestions</span>
      </div>
      <div class="passmanage-dropdown-list">
    `;

    matches.forEach((m) => {
      const catColor =
        m.category === 'SHAREABLE'
          ? '#10b981'
          : m.category === 'RESTRICTED'
          ? '#f59e0b'
          : '#ef4444';
      const catBg =
        m.category === 'SHAREABLE'
          ? 'rgba(16, 185, 129, 0.15)'
          : m.category === 'RESTRICTED'
          ? 'rgba(245, 158, 11, 0.15)'
          : 'rgba(239, 68, 68, 0.15)';

      html += `
        <div class="passmanage-item" data-id="${m.id}" data-category="${m.category}">
          <div class="passmanage-item-title">${escapeHtml(m.websiteName)}</div>
          <div class="passmanage-item-badge" style="color: ${catColor}; border-color: ${catColor}40; background: ${catBg}">
            ${m.category.replace('_', ' ')}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    // Attach click listeners to options
    dropdown.querySelectorAll('.passmanage-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        const category = item.dataset.category;
        dropdown.remove();
        activeDropdown = null;

        const match = matches.find((m) => m.id === id) || { id, category };
        triggerAuthorizeAndRelease(match);
      });
    });

    // Close on outside click
    const handleOutsideClick = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchorElement) {
        dropdown.remove();
        activeDropdown = null;
        document.removeEventListener('click', handleOutsideClick);
      }
    };
    setTimeout(() => document.addEventListener('click', handleOutsideClick), 60);
  }

  // 9. Trigger Authorization and Autofill
  function triggerAuthorizeAndRelease(match) {
    showToast('Authorizing credential release with PassManage...', 'info');

    chrome.runtime.sendMessage(
      {
        type: 'AUTHORIZE_AND_RELEASE',
        credentialId: match.id,
        category: match.category,
      },
      (authRes) => {
        if (authRes && authRes.success && authRes.credentials) {
          autofillFields(authRes.credentials);
        } else if (authRes && !authRes.success) {
          showToast(authRes.error || 'Authorization failed. Credential not released.', 'error');
        }
      }
    );
  }

  function showToast(text, type = 'info') {
    const existing = document.getElementById('passmanage-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'passmanage-toast';
    toast.className = `passmanage-toast passmanage-toast-${type}`;
    toast.innerText = text;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4500);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str || '';
    return div.innerHTML;
  }

  // Initialize on load and on DOM updates
  initPageCredentials();

  let scanTimeout = null;
  const observer = new MutationObserver(() => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      setupInputHooks();
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
