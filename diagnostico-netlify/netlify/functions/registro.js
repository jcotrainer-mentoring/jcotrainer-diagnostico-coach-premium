import { getStore } from '@netlify/blobs';

const KEY = 'registro';

export default async (req) => {
  const store = getStore('diagnosticos');

  if (req.method === 'GET') {
    const entries = (await store.get(KEY, { type: 'json' })) || [];
    return new Response(JSON.stringify(entries), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'POST') {
    let entry;
    try {
      entry = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 });
    }

    if (!entry || typeof entry.nombre !== 'string' || typeof entry.global !== 'number') {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
    }

    entry.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    entry.fecha = entry.fecha || new Date().toISOString();

    const entries = (await store.get(KEY, { type: 'json' })) || [];
    entries.push(entry);
    await store.setJSON(KEY, entries);

    return new Response(JSON.stringify({ ok: true, entry }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
};

export const config = { path: '/api/registro' };
