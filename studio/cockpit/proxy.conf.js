/*
 * Dev-server proxy: forward the cockpit's /api/* calls to the local hub on :4477.
 *
 * In production the cockpit is served by Core/the hub on the SAME origin as the API, so the
 * hub's loopback write-guard (Host pinned to the hub's port, Origin same-site) passes naturally.
 * Under the Angular dev server the SPA is served from a different port, so two adjustments make
 * the guard accept proxied writes WITHOUT weakening it:
 *
 *   - changeOrigin: rewrite the Host header to the hub's host:port (defeats the host-port
 *     mismatch the guard checks for DNS-rebinding).
 *   - strip the Origin header: the hub treats a request with no Origin as a non-browser client
 *     (curl / the hook) and allows it; the X-AIDT custom header the app still sends is the
 *     anti-CSRF proof. This only ever applies to dev-server traffic on loopback.
 *
 * The modern Angular dev server is Vite-based; its proxy exposes the underlying http-proxy via
 * `configure(proxy)`, where we hook `proxyReq` to drop the Origin header. This file is dev-only
 * tooling; it ships nothing to production.
 */
module.exports = {
  '/api': {
    target: 'http://localhost:4477',
    secure: false,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('origin');
      });
    },
  },
};
