/**
 * functions/sync.js — one shared copy of John's progress, so the laptop he revises on
 * and the laptop the coach view is read on can see the same data.
 *
 * Deliberately dumb: it stores one JSON blob per sync code and hands it back.
 * No accounts, no merging, no background writes. The app pushes and pulls only
 * when a button is pressed, so nothing is ever silently overwritten.
 *
 * The sync code is the only gate. It travels in a header, never in the URL, so
 * it does not end up in browser history or server logs. It is not a password
 * protecting anything sensitive — the payload is revision progress, not the
 * exam papers — but it should still be long and unguessable.
 */

const CORS = {
  // the app runs from localhost (start.bat), the pages.dev copy, and a local
  // file; the sync code is the gate, not the origin
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-sync-key',
  'Access-Control-Max-Age': '86400',
};

const MAX_BYTES = 4 * 1024 * 1024;   // a whole year of tagging is far below this

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequest(context) {
  const { request, env } = context;
  {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const code = request.headers.get('x-sync-key') || '';
    if (!/^[A-Za-z0-9-]{12,64}$/.test(code)) {
      return json({ error: 'Missing or malformed sync code.' }, 400);
    }
    const key = `progress:${code}`;

    if (request.method === 'GET') {
      const stored = await env.PROGRESS.get(key);
      if (!stored) return json({ empty: true });
      return new Response(stored, {
        headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX_BYTES) return json({ error: 'Payload too large.' }, 413);

      let envelope;
      try { envelope = JSON.parse(body); }
      catch { return json({ error: 'Body is not valid JSON.' }, 400); }

      // only ever store something that looks like this app's progress.
      // Two accepted shapes: the multi-subject envelope the app pushes now
      // ({ app, version: 2, subjects: { physics: state, ... } }), and a bare
      // single-subject state from before subjects existed — so an old laptop
      // that has not been updated can still push.
      const isState = (s) => s && s.version === 1
        && s.confidence && typeof s.confidence === 'object' && !Array.isArray(s.confidence)
        && Array.isArray(s.attempts)
        && Array.isArray(s.mockAttempts)
        && Array.isArray(s.diagnosticAttempts);

      const s = envelope && envelope.state;
      const isEnvelope = s && s.app === 'john-exams-progress' && s.subjects
        && typeof s.subjects === 'object' && !Array.isArray(s.subjects)
        && Object.values(s.subjects).length > 0
        && Object.values(s.subjects).every(isState);

      if (!isEnvelope && !isState(s)) {
        return json({ error: 'That does not look like progress from this app.' }, 400);
      }

      const record = JSON.stringify({
        pushedAt: new Date().toISOString(),
        device: String(envelope.device || 'unknown').slice(0, 40),
        state: s,
      });
      await env.PROGRESS.put(key, record);
      return json({ ok: true, pushedAt: JSON.parse(record).pushedAt });
    }

    return json({ error: 'Method not allowed.' }, 405);
  }
}
