import test from 'node:test';
import assert from 'node:assert/strict';
import { UrlService } from '../src/services/url.service.js';

test('UrlService - Extract target hostname', () => {
  const res = UrlService.extractTargetHostname('https://Login.GitHub.com/session?ref=1');
  assert.equal(res.targetHostname, 'login.github.com');
  assert.equal(res.protocol, 'https:');
});

test('UrlService - Scheme validation blocks non-web schemes', () => {
  assert.throws(() => UrlService.extractTargetHostname('javascript:alert(1)'), /Unsupported URL scheme/);
  assert.throws(() => UrlService.extractTargetHostname('file:///etc/passwd'), /Unsupported URL scheme/);
});

test('UrlService - Exact hostname matching', () => {
  const cred = {
    website_url: 'https://github.com/login',
    target_hostname: 'github.com',
    match_subdomains: false,
  };

  assert.equal(UrlService.isMatch('https://github.com/login', cred), true);
  assert.equal(UrlService.isMatch('https://github.com/settings', cred), true);
  // Subdomain without flag must fail
  assert.equal(UrlService.isMatch('https://gist.github.com', cred), false);
  // Unsafe substring attacks must fail
  assert.equal(UrlService.isMatch('https://fake-github.com', cred), false);
  assert.equal(UrlService.isMatch('https://github.com.attacker.com', cred), false);
});

test('UrlService - Explicit subdomain matching', () => {
  const cred = {
    website_url: 'https://slack.com',
    target_hostname: 'slack.com',
    match_subdomains: true,
  };

  assert.equal(UrlService.isMatch('https://workspace.slack.com', cred), true);
  assert.equal(UrlService.isMatch('https://my-team.app.slack.com', cred), true);
  assert.equal(UrlService.isMatch('https://attacker-slack.com', cred), false);
});

test('UrlService - Downgrade prevention (HTTPS cred on HTTP tab rejected)', () => {
  const cred = {
    website_url: 'https://bank.com/portal',
    target_hostname: 'bank.com',
    match_subdomains: false,
  };

  assert.equal(UrlService.isMatch('http://bank.com/portal', cred), false);
});
