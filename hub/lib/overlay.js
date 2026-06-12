'use strict';
/*
 * Thin client for an optional, self-hosted mem0/OpenMemory memory service used as a
 * Q&A overlay. It is NOT a memory engine — it sends a question plus minimal in-scope
 * context to a user-configured endpoint and returns the bounded, validated answer.
 *
 * Containment posture (load-bearing):
 *   - The endpoint URL is taken ONLY from ~/.aidevteam/config.json (memory.overlayUrl).
 *     It is never derived from a note body, a front-matter value, an overlay response,
 *     or any observed/untrusted content. A malformed or non-http(s) URL fails closed.
 *   - The credential is read from the process ENVIRONMENT only, at call time. It is
 *     never written to config, a manifest, a database, a log line, or an error body.
 *     A missing credential degrades to "not connected".
 *   - The health probe and the question call are time-boxed with a real AbortController,
 *     so a hung/hostile service is aborted (socket closed) rather than leaked, and the
 *     caller falls back to the local tier.
 *   - The response is untrusted: size-bounded and shape-validated before use, carried as
 *     inert data (the front end escapes it), never executed and never written to a vault.
 *
 * Zero dependencies beyond node. Never throws to the caller — every failure degrades to
 * a null/unhealthy result so the read-only Q&A can fall back locally.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The supported self-hosted services and the env var each reads its credential from.
// The credential is ALWAYS read from this env var — never from any file.
// Each service declares the ENV var its credential is read from. A declared
// credential is required for health: an enabled overlay with the env var absent
// degrades to "not connected" rather than egressing unauthenticated.
const SERVICES = Object.freeze({
  openmemory: { credentialEnv: 'OPENMEMORY_API_KEY', residency: 'local-service', requiresCredential: true },
  mem0: { credentialEnv: 'MEM0_API_KEY', residency: 'cloud', requiresCredential: true },
});

const DEFAULT_TIMEOUT_MS = 1500;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_ANSWER_CHARS = 8 * 1024;
const MAX_MATCHES = 50;
const MAX_MATCH_TITLE_CHARS = 512;

function aidevteamHome() {
  return path.join(os.homedir(), '.aidevteam');
}

// Accept only an http/https URL with a host. Returns the normalized origin+pathname
// base string, or null when the value is malformed or a non-http scheme — so a bad
// config value fails closed (the overlay is treated as unconfigured).
function validateOverlayUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  return u;
}

/**
 * Read the selection-only overlay configuration from ~/.aidevteam/config.json.
 * Carries the CHOICE of service + the endpoint URL only — never a secret. An unknown
 * service or a malformed/non-http URL fails closed (the field becomes null/off).
 *
 * @returns `{ overlay, overlayUrl, service, residency, credentialEnv }` — `overlay`
 *          is null when off; `overlayUrl` is the validated string or null.
 */
function loadOverlayConfig() {
  const off = { overlay: null, overlayUrl: null, service: null, residency: null, credentialEnv: null };
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(aidevteamHome(), 'config.json'), 'utf8')); } catch { return { ...off }; }
  const mem = cfg && typeof cfg === 'object' ? cfg.memory : null;
  if (!mem || typeof mem !== 'object') return { ...off };
  const name = typeof mem.overlay === 'string' ? mem.overlay.toLowerCase().trim() : '';
  const service = SERVICES[name];
  if (!service) return { ...off };
  const url = validateOverlayUrl(mem.overlayUrl);
  return {
    overlay: name,
    overlayUrl: url ? url.toString().replace(/\/$/, '') : null,
    service: name,
    residency: service.residency,
    credentialEnv: service.credentialEnv,
  };
}

// Read the credential for a service from the ENVIRONMENT only. Returns the value or
// null. Never reads a file; never logs the value.
function readCredential(name) {
  const service = SERVICES[name];
  if (!service) return null;
  const v = process.env[service.credentialEnv];
  return typeof v === 'string' && v.length ? v : null;
}

// Build a controlled abort: returns { signal, cancel } where cancel() clears the timer.
function deadlineSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

// A request header set carrying the credential. The credential rides ONLY the outbound
// request header to the configured URL; it is never persisted or echoed elsewhere.
function authHeaders(name) {
  const credential = readCredential(name);
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (credential) headers.authorization = `Bearer ${credential}`;
  return headers;
}

/**
 * Time-boxed liveness + readiness check. The overlay is healthy only when:
 *   (1) a service is configured AND a validated URL is present, AND
 *   (2) the service's credential is present in env (when the service requires one), AND
 *   (3) a cheap liveness probe to the configured URL succeeds within the deadline.
 * The probe is aborted at the deadline (no dangling socket). Never throws.
 *
 * @returns `{ healthy, config }` — `config` is the loaded overlay config (for the caller).
 */
async function checkHealth({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const config = loadOverlayConfig();
  if (!config.overlay || !config.overlayUrl) return { healthy: false, config };
  if (SERVICES[config.overlay].requiresCredential && !readCredential(config.overlay)) {
    return { healthy: false, config };
  }
  if (typeof fetchImpl !== 'function') return { healthy: false, config };
  const { signal, cancel } = deadlineSignal(timeoutMs);
  try {
    const res = await fetchImpl(`${config.overlayUrl}/health`, { method: 'GET', headers: authHeaders(config.overlay), signal, redirect: 'error' });
    return { healthy: !!(res && res.ok), config };
  } catch {
    return { healthy: false, config };
  } finally {
    cancel();
  }
}

// Read a bounded amount of the response body. A response that exceeds the cap is
// rejected (null) so an oversize/hostile body cannot be buffered wholesale.
async function readBoundedText(res) {
  if (!res || typeof res.text !== 'function') return null;
  let text;
  try { text = await res.text(); } catch { return null; }
  if (typeof text !== 'string') return null;
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) return null;
  return text;
}

// Coerce the untrusted overlay payload into the stable, bounded shape the Q&A depends
// on. Anything off-shape collapses to safe defaults; the result is inert data.
function validateOverlayResponse(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const answer = typeof parsed.answer === 'string' ? parsed.answer.slice(0, MAX_ANSWER_CHARS) : '';
  const matches = [];
  if (Array.isArray(parsed.matches)) {
    for (const m of parsed.matches) {
      if (matches.length >= MAX_MATCHES) break;
      if (!m || typeof m !== 'object') continue;
      const title = typeof m.title === 'string' ? m.title.slice(0, MAX_MATCH_TITLE_CHARS) : '';
      const score = typeof m.score === 'number' && Number.isFinite(m.score) ? m.score : null;
      if (title) matches.push({ title, score });
    }
  }
  if (!answer && matches.length === 0) return null;
  return { answer, matches };
}

/**
 * Send the question + minimal in-scope context to the configured overlay and return
 * its bounded, validated answer. The request goes ONLY to the configured URL (no
 * redirect to another host is followed). Time-boxed with an abort; never throws — any
 * network error, abort, oversize, or malformed response degrades to null so the caller
 * falls back to the local tier.
 *
 * @param payload `{ question, context, scopeKey }` — the minimal egress body
 * @returns `{ answer, matches:[{title,score}] }` or null on any failure
 */
async function queryOverlay(payload, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const config = loadOverlayConfig();
  if (!config.overlay || !config.overlayUrl) return null;
  if (typeof fetchImpl !== 'function') return null;
  const body = JSON.stringify({
    query: String(payload && payload.question != null ? payload.question : ''),
    context: String(payload && payload.context != null ? payload.context : ''),
    project: String(payload && payload.scopeKey != null ? payload.scopeKey : ''),
  });
  const { signal, cancel } = deadlineSignal(timeoutMs);
  try {
    const res = await fetchImpl(`${config.overlayUrl}/query`, {
      method: 'POST', headers: authHeaders(config.overlay), body, signal, redirect: 'error',
    });
    if (!res || !res.ok) return null;
    const text = await readBoundedText(res);
    if (text == null) return null;
    return validateOverlayResponse(text);
  } catch {
    return null;
  } finally {
    cancel();
  }
}

module.exports = {
  loadOverlayConfig,
  validateOverlayUrl,
  readCredential,
  checkHealth,
  queryOverlay,
  SERVICES,
  DEFAULT_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
};
