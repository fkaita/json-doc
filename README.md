# json-doc

Open a JSON file, read it like a document, and verify its signature. One HTML file, no dependencies, no build step.

**Use it:** https://fkaita.github.io/json-doc/ — or download `index.html` and open it in a browser.

Everything runs in your browser. Your data is never uploaded.

## How it works

Pick or drop a `.json` file, or paste JSON, then click **Open document**. The document opens in a new tab, ready to print.

- Plain values → label and value, laid out in a compact grid
- Objects → indented sections
- Lists of values → bullet lists
- Lists of objects → tables
- Keys like `invoice_number` or `invoiceNumber` → "Invoice Number"
- `null` or a missing table cell → —

## Signed documents

A signed file has exactly two top-level fields:

```json
{
  "document": { "...": "the content that was signed" },
  "signature": { "publicKey": "base64 Ed25519 public key (SPKI)", "value": "base64 Ed25519 signature" }
}
```

json-doc checks the signature and shows the result above the document. The `signature` part itself is not displayed.

- **✓ Signature valid** — the document is unchanged since it was signed with the key shown. It does not say who owns that key.
- **✗ Signature not valid** — the document, key or signature was changed, the signature is missing, or it could not be read.
- **No banner** — the file is not in the signed format (for example, it has other top-level fields), so it is shown as plain JSON. Only trust a green ✓.

**What a signature proves:** the document has not changed since it was signed, and it was signed by whoever holds the private key.

**What it does not prove:** who that is. The file includes its own public key, so anyone could edit the document and re-sign it with a new key. Get the signer's public key from a source you already trust, such as their website, and check it matches the key shown.

**Signing**

1. Turn `document` into canonical JSON ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)): object keys sorted, no whitespace. In JavaScript that is `JSON.stringify` with sorted keys, as in the code below.
2. Sign that text (UTF-8) with the signer's Ed25519 private key.
3. Put the signature in `signature.value` and the public key in `signature.publicKey`, both as standard base64 with padding. Anything else you want protected, like who signed or when, must go inside `document`.

**Verifying**

1. Turn `document` into canonical JSON the same way.
2. Check `signature.value` against that text using `signature.publicKey`.
3. If it passes, the data is unchanged. Key order and whitespace don't matter; changing any value, value type (`40` vs `"40"`) or array order does. The key and signature must be exact base64: any edit to their text, even removing `=`, fails.

To verify a file outside the browser with the same rules (Node.js, no dependencies), replace `signed.json` with your file:

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

## Planned: signing servers

Not built yet. A signing server confirms who signed a document and when.

1. An organization proves to a signing server that it owns its domain, with a DNS record.
2. To sign, it sends the server a hash of the document. The document itself is never sent.
3. The server signs the hash, the domain and the current time with its own key.

```json
{
  "document": { "...": "the content that was signed" },
  "signature": { "server": "sign.example.org", "domain": "northwind.example", "time": "2026-10-01T09:30:00Z", "value": "base64 signature" }
}
```

json-doc checks the signature with the server's public key from its own trusted list, never from the file, and shows:

**✓ Signed by northwind.example · 2026-10-01 09:30 UTC · via sign.example.org**

Anyone can run a signing server. A server is added to the trusted list by pull request if it:

- checks domain ownership with DNS
- uses an accurate clock
- keeps its private key secret
- logs everything it signs

Readers can also add servers they trust to their own copy.

If a server's key leaks, its entry gets an end date. Documents signed before that date stay valid.

## License

MIT
