export class UrlService {
  /**
   * Safely extract normalized target hostname from input URL string
   */
  static extractTargetHostname(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('Website URL is required');
    }

    let normalized = rawUrl.trim();
    // Check if an explicit scheme is present
    const schemeMatch = normalized.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') {
        throw new Error(`Unsupported URL scheme: ${scheme}:. Only http and https are permitted.`);
      }
    } else {
      normalized = 'https://' + normalized;
    }

    let parsed;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error('Invalid URL format');
    }

    const allowedProtocols = ['https:', 'http:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error(`Unsupported URL scheme: ${parsed.protocol}. Only http and https are permitted.`);
    }

    return {
      canonicalUrl: parsed.origin + parsed.pathname,
      targetHostname: parsed.hostname.toLowerCase(),
      protocol: parsed.protocol,
      port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
    };
  }

  /**
   * Evaluate whether a candidate tab URL matches a stored credential's domain policy.
   * Prevents unsafe substring matching, cross-subdomain leaks, and HTTP downgrades.
   */
  static isMatch(tabUrlString, credential) {
    if (!tabUrlString || !credential) return false;

    let tabUrl;
    try {
      tabUrl = new URL(tabUrlString);
    } catch {
      return false; // Malformed URL
    }

    // 1. Block dangerous or internal schemes
    const allowedProtocols = ['https:', 'http:'];
    if (!allowedProtocols.includes(tabUrl.protocol)) {
      return false;
    }

    // 2. Block HTTP downgrade if stored credential is HTTPS
    let credProtocol = 'https:';
    try {
      credProtocol = new URL(credential.website_url).protocol;
    } catch {
      // fallback to https
    }

    if (credProtocol === 'https:' && tabUrl.protocol === 'http:') {
      return false; // Block credential leak over plaintext HTTP
    }

    // 3. Port isolation for localhost
    const tabHost = tabUrl.hostname.toLowerCase();
    const storedHost = (credential.target_hostname || '').toLowerCase();

    if (tabHost === 'localhost' || tabHost === '127.0.0.1') {
      try {
        const storedUrl = new URL(credential.website_url);
        const credPort = storedUrl.port || (storedUrl.protocol === 'https:' ? '443' : '80');
        const currentPort = tabUrl.port || (tabUrl.protocol === 'https:' ? '443' : '80');
        if (credPort !== currentPort) return false;
      } catch {
        // pass through
      }
    }

    // 4. Exact Hostname Match (with www. normalization)
    const cleanTabHost = tabHost.replace(/^www\./, '');
    const cleanStoredHost = storedHost.replace(/^www\./, '');

    if (cleanTabHost === cleanStoredHost) {
      return true;
    }

    // 5. Explicit Subdomain Policy (Only if user checked match_subdomains)
    if (credential.match_subdomains && cleanStoredHost.length > 0) {
      if (cleanTabHost.endsWith('.' + cleanStoredHost)) {
        return true;
      }
    }

    return false;
  }
}
