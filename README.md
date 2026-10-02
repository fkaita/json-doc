# json-doc

Open a JSON file and read it like a document. Sign it, and verify who signed it and when. One HTML file, no dependencies, no build step.

**Use it:** https://fkaita.github.io/json-doc/ — or download `index.html` and open it in a browser.

Everything runs in your browser. Documents never leave it: signing sends only a hash.

## How it works

Pick or drop a `.json` file, or paste JSON, then click **Open document**. The document opens in a new tab, ready to print.

- Plain values → label and value, laid out in a compact grid
- Objects → indented sections
- Lists of values → bullet lists
- Lists of objects → tables
- Keys like `invoice_number` or `invoiceNumber` → "Invoice Number"
- `null` or a missing table cell → —

## Signed documents

A signed file has exactly two top-level fields, `document` and `signature`. json-doc checks the signature and shows the result above the document:

- **Green ✓** — the signature is valid.
- **Red ✗** — the document or signature was changed, is missing, or comes from a server json-doc does not trust.
- **No banner** — not a signed file (for example, it has other top-level fields). Only trust a green ✓.

Changing any value, value type (`40` vs `"40"`) or array order breaks the signature. Key order and whitespace do not.

There are two kinds of signature.

### Server-signed: who signed, and when

A signing server confirms which domain signed the document, and when. Only the document's hash is sent to the server.

```json
{
  "document": { "...": "the content that was signed" },
  "signature": { "server": "sign.example.org", "domain": "northwind.example", "time": "2026-10-01T09:30:00.000Z", "value": "base64 signature" }
}
```

json-doc checks it with the server's key from the `SERVERS` list in `index.html`, never from the file, and shows:

**✓ Signed by northwind.example · 2026-10-01 09:30 UTC** (via sign.example.org)

**Sign a document**

1. On the json-doc page, add the document and open **Sign this document**.
2. Enter your domain and click **New token**. Keep the token secret.
3. Click **Sign**. The first time, it shows the DNS record to add, for example `_json-doc.northwind.example TXT 9edf…`. Add it, then click **Sign** again.

The signed file replaces the text and can be downloaded. Only your domain, token and the document's hash are sent to the signing server (`SIGN_SERVER` in `index.html`).

To stop a token from signing, remove its DNS record.

**API**

`POST /sign` with `{ "domain": "northwind.example", "token": "…", "hash": "…" }` returns the `signature` object. `hash` is the hex SHA-256 of the canonical `document` (see below). The signed file is `{ "document": …, "signature": … }`.

`GET /key` returns the server's public key.

**Run a signing server**

The server is `server/worker.js`.

1. Create the server's private key. Keep it secret.
   ```bash
   node -e 'console.log(require("crypto").generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"))'
   ```
2. Run it on Cloudflare Workers (HTTPS included). In `server/wrangler.toml`, set your server's name in `SERVER_NAME` and `routes`. Then, in `server/`:
   ```bash
   npx wrangler deploy
   npx wrangler secret put SIGNING_KEY
   ```
   To keep a log of every signature, create a KV namespace (`npx wrangler kv namespace create LOG`) and add it to `wrangler.toml`.

   Or run it anywhere with Node.js 20 or later, behind HTTPS. It logs to `signed.log`.
   ```bash
   SERVER_NAME=sign.example.org SIGNING_KEY=<key> node server/node.js
   ```
3. To sign with it from your copy of json-doc, set `SIGN_SERVER` in `index.html`.

The server's public key is at `/key`. It checks DNS over HTTPS, so answers can't be faked on the network.

**Trusted servers**

The `SERVERS` list is empty until the first server is running. A server is added by pull request if it:

- runs `server/worker.js`, or checks domains with DNS the same way
- uses an accurate clock
- keeps its private key secret
- keeps its log

Readers can also add servers to their own copy of `index.html`.

If a server's key leaks, its entry gets an `until` time. Documents signed before that time stay valid.

### Self-signed: unchanged only

The signer uses their own key and includes it in the file. No server is needed.

```json
{
  "document": { "...": "the content that was signed" },
  "signature": { "publicKey": "base64 Ed25519 public key (SPKI)", "value": "base64 Ed25519 signature" }
}
```

json-doc shows **✓ Signature valid** with the key. This proves the document is unchanged since that key signed it, not who owns the key: anyone can edit a document and re-sign it with a new key. Compare the key with one you got from the signer.

**Signing**

1. Turn `document` into canonical JSON ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)): object keys sorted, no whitespace. In JavaScript that is `JSON.stringify` with sorted keys, as in the code below.
2. Sign that text (UTF-8) with an Ed25519 private key.
3. Put the signature in `signature.value` and the public key in `signature.publicKey`, both as standard base64 with padding. Any edit to their text, even removing `=`, makes the signature fail.

To verify outside the browser (Node.js, no dependencies), replace `signed.json` with your file:

```bash
node -e '
const c = require("crypto"), f = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")), s = f.signature;
const canonical = v => JSON.stringify(v, (_, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const bytes = t => { const b = Buffer.from(t, "base64"); if (b.toString("base64") !== t) throw Error("Invalid base64"); return b; };
let ok = false;
try { ok = c.verify(null, Buffer.from(canonical(f.document)), c.createPublicKey({ key: bytes(s.publicKey), format: "der", type: "spki" }), bytes(s.value)); } catch {}
console.log(ok ? "valid" : "INVALID");
' signed.json
```

Signature checks need a recent browser and a secure page: the hosted version, or `index.html` opened from your own computer.

## License

MIT
