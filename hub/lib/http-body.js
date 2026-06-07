'use strict';
/*
 * Shared request-body reader for the hub's write endpoints.
 *
 * Reads a JSON request body capped at MAX_BODY and calls cb(err, obj). On overflow
 * it reports a 'body too large' error WITHOUT destroying the socket, so the caller
 * can send a real HTTP 413 JSON response that reaches the client; destroying the
 * socket would surface as a TCP reset instead. The cap still holds — bytes past
 * MAX_BODY are not buffered: once the limit is crossed we stop appending chunks and
 * drain the rest of the request to /dev/null so the response can flush and the
 * connection can close cleanly.
 */
const MAX_BODY = 64 * 1024; // cap the request body before buffering

function readJsonBody(req, cb) {
  let size = 0;
  let overflow = false;
  const chunks = [];
  let done = false;
  const finish = (err, obj) => { if (done) return; done = true; cb(err, obj); };

  req.on('data', (c) => {
    if (overflow) return; // already over the cap — drain remaining input, buffer nothing
    size += c.length;
    if (size > MAX_BODY) {
      overflow = true;
      chunks.length = 0; // release what we buffered; do not keep growing
      return;
    }
    chunks.push(c);
  });
  req.on('error', () => finish(new Error('read error')));
  req.on('end', () => {
    if (overflow) return finish(new Error('body too large'));
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return finish(null, {});
    try { finish(null, JSON.parse(raw)); } catch { finish(new Error('invalid JSON')); }
  });
}

module.exports = { readJsonBody, MAX_BODY };
