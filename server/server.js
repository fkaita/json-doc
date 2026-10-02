// json-doc signing server. Confirms which domain signed a document hash, and when.
// No dependencies. Run: SERVER_NAME=sign.example.org node server.js
const http = require('node:http'), crypto = require('node:crypto'), fs = require('node:fs'), dns = require('node:dns/promises');

const { SERVER_NAME, PORT = 8080, KEY_FILE = 'server-key.pem', LOG_FILE = 'signed.log' } = process.env;
if (!SERVER_NAME) throw Error('Set SERVER_NAME to the public name of this server, e.g. sign.example.org');

// The server's private key is created on first start. Keep this file secret.
if (!fs.existsSync(KEY_FILE)) {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const canonical = v => JSON.stringify(v, (_, x) => isObj(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const fail = (status, message) => Object.assign(Error(message), { status });

// The domain owner proves control by publishing sha256(token) in DNS: TXT _json-doc.<domain>.
// Removing that record stops signing for the token.
async function sign({ domain, token, hash }) {
  if (typeof domain !== 'string' || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw fail(400, 'domain must be a lowercase domain name');
  if (typeof token !== 'string' || token.length < 32) throw fail(400, 'token must be a secret of at least 32 characters');
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw fail(400, 'hash must be a hex SHA-256');
  const record = `_json-doc.${domain}`, expected = sha256(token);
  const txt = await dns.resolveTxt(record).catch(() => []);
  if (!txt.some(parts => parts.join('') === expected)) throw fail(403, `Add a DNS TXT record ${record} with the value ${expected}`);

  const payload = { domain, hash, server: SERVER_NAME, time: new Date().toISOString() };
  const value = crypto.sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64');
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ...payload, value }) + '\n');
  return { server: SERVER_NAME, domain, time: payload.time, value };
}

const readJson = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 10000) reject(fail(413, 'Request too large')); });
  req.on('end', () => {
    let json;
    try { json = JSON.parse(body); } catch {}
    isObj(json) ? resolve(json) : reject(fail(400, 'Body must be a JSON object'));
  });
});

http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === 'OPTIONS') return send(204, {});
    if (req.method === 'GET' && req.url === '/key') return send(200, { server: SERVER_NAME, publicKey });
    if (req.method === 'POST' && req.url === '/sign') return send(200, await sign(await readJson(req)));
    send(404, { error: 'Not found' });
  } catch (e) {
    send(e.status || 500, { error: e.status ? e.message : 'Server error' });
    if (!e.status) console.error(e);
  }
}).listen(PORT, () => console.log(`${SERVER_NAME} listening on port ${PORT}\nPublic key: ${publicKey}`));
