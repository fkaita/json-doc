// Runs the signing server on Node.js 20 or later, for hosting outside Cloudflare.
// Usage: SERVER_NAME=sign.example.org SIGNING_KEY=<base64> node server/node.js
import http from 'node:http';
import { appendFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import worker from './worker.js';

const { SERVER_NAME, SIGNING_KEY, PORT = 8080, LOG_FILE = 'signed.log' } = process.env;
const env = { SERVER_NAME, SIGNING_KEY, LOG: { put: (_, entry) => appendFile(LOG_FILE, entry + '\n') } };

http.createServer(async (req, res) => {
  try {
    // Only the path matters to worker.js; "localhost" just makes a full URL.
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
    const response = await worker.fetch(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body, duplex: 'half' }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    // Requests that can't be turned into a Web Request (e.g. TRACE) must not crash the server.
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
}).listen(PORT, () => console.log(`${SERVER_NAME} listening on port ${PORT}`));
