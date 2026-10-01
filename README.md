# json-doc

Open a JSON file and read it like a document. One HTML file, no dependencies, no build step.

**Use it:** https://fkaita.github.io/json-doc/ — or download `index.html` and open it in a browser.

Everything runs in your browser. Your data is never uploaded.

## How it works

Pick or drop a `.json` file, or paste JSON, then click **Open document**. The document opens in a new tab, ready to print.

- Plain values → label and value
- Objects → sections
- Lists of values → bullet lists
- Lists of objects → tables
- Keys like `invoice_number` or `invoiceNumber` → "Invoice Number"
- `null` → —

## Signing (optional)

A JSON object can carry an Ed25519 signature in a `_signature` field (base64). The signature covers the object without `_signature`, in canonical form: keys sorted, no whitespace (RFC 8785 style). Unsigned JSON works as before.

- **Sign:** paste a private key (PKCS#8, PEM or base64), click **Sign**. `_signature` is added or replaced.
- **Verify:** paste a public key (SPKI PEM/base64, or raw 32-byte base64), click **Verify** → **Unsigned**, **Verified** or **Invalid**.

Uses the browser's Web Crypto API (current Chrome, Edge, Firefox and Safari). Keys stay in the page. Make a key pair with:

```sh
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

## License

MIT
