// json-doc signing server. Confirms which domain signed a document hash, and when.
// Runs on Cloudflare Workers, or on Node.js with node.js. Uses only standard Web APIs.
// Settings: SERVER_NAME (public name, e.g. sign.example.org), SIGNING_KEY (secret: base64 PKCS#8 Ed25519 key),
// LOG (keeps every signature: a Workers KV namespace, or a file with node.js).

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const canonical = v => JSON.stringify(v, (_, x) => isObj(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const utf8 = s => new TextEncoder().encode(s);
const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const base64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const fail = (status, message) => Object.assign(Error(message), { status });

// The private key comes from SIGNING_KEY; the public key is derived from it.
let keys;
async function serverKeys(env) {
  if (!env.SERVER_NAME || !env.SIGNING_KEY) throw fail(500, 'Set SERVER_NAME and SIGNING_KEY');
  if (!keys) {
    const privateKey = await crypto.subtle.importKey('pkcs8', bytes(env.SIGNING_KEY), 'Ed25519', true, ['sign']);
    const { x } = await crypto.subtle.exportKey('jwk', privateKey);
    const spki = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00, ...bytes(x.replace(/-/g, '+').replace(/_/g, '/'))];
    keys = { privateKey, publicKey: base64(new Uint8Array(spki)) };
  }
  return keys;
}

// DNS over HTTPS, so answers can't be faked on the network between this server and the resolver.
async function dnsTxt(name) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: 'application/dns-json' } });
  const { Answer = [] } = await res.json();
  return Answer.filter(a => a.type === 16).map(a => a.data.replace(/"\s*"/g, '').replace(/^"|"$/g, ''));
}

// The domain owner proves control by publishing sha256(token) in DNS: TXT _json-doc.<domain>.
// Removing that record stops signing for the token.
async function sign(env, { domain, token, hash }) {
  if (typeof domain !== 'string' || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw fail(400, 'domain must be a lowercase domain name');
  if (typeof token !== 'string' || token.length < 32) throw fail(400, 'token must be a secret of at least 32 characters');
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw fail(400, 'hash must be a hex SHA-256');
  const { privateKey } = await serverKeys(env);
  const record = `_json-doc.${domain}`, expected = await sha256(token);
  if (!(await dnsTxt(record)).includes(expected)) throw fail(403, `Add a DNS TXT record ${record} with the value ${expected}`);

  const payload = { domain, hash, server: env.SERVER_NAME, time: new Date().toISOString() };
  const value = base64(await crypto.subtle.sign('Ed25519', privateKey, utf8(canonical(payload))));
  await env.LOG?.put(`${payload.time} ${hash}`, JSON.stringify({ ...payload, value }));
  return { server: env.SERVER_NAME, domain, time: payload.time, value };
}

const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }
});

export default {
  async fetch(request, env) {
    try {
      const { pathname } = new URL(request.url);
      if (request.method === 'OPTIONS') return json(204);
      if (request.method === 'GET' && pathname === '/key') return json(200, { server: env.SERVER_NAME, publicKey: (await serverKeys(env)).publicKey });
      if (request.method === 'POST' && pathname === '/sign') {
        const text = await request.text();
        if (text.length > 10000) throw fail(413, 'Request too large');
        let body;
        try { body = JSON.parse(text); } catch {}
        if (!isObj(body)) throw fail(400, 'Body must be a JSON object');
        return json(200, await sign(env, body));
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (!e.status) console.error(e);
      return json(e.status || 500, { error: e.status ? e.message : 'Server error' });
    }
  }
};
