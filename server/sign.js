// Signs a JSON document with a json-doc signing server. Only the document's hash is sent.
// Usage: JSON_DOC_TOKEN=<secret> node sign.js <server-url> <domain> <document.json> > signed.json
const crypto = require('node:crypto'), fs = require('node:fs');

const [url, domain, file] = process.argv.slice(2), token = process.env.JSON_DOC_TOKEN;
if (!file || !token) {
  console.error('Usage: JSON_DOC_TOKEN=<secret> node sign.js <server-url> <domain> <document.json> > signed.json');
  process.exit(1);
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const canonical = v => JSON.stringify(v, (_, x) => isObj(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const document = JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = crypto.createHash('sha256').update(canonical(document)).digest('hex');

fetch(url.replace(/\/$/, '') + '/sign', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain, token, hash })
}).then(async res => {
  const body = await res.json();
  if (!res.ok) { console.error(body.error); process.exit(1); }
  console.log(JSON.stringify({ document, signature: body }, null, 2));
}).catch(e => { console.error(e.message); process.exit(1); });
