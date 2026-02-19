/**
 * @fileoverview Static HTTP server for the pre-built web frontend.
 * Zero dependencies — uses node:http and node:fs.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function serve(port: number = 3000): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const distDir = join(__dirname, '..', 'web', 'dist');

  if (!existsSync(distDir)) {
    process.stderr.write(
      `  Web assets not found at ${distDir}\n` +
        '  Run "cd web && npm install && npm run build" first.\n',
    );
    process.exitCode = 1;
    return;
  }

  const server = createServer((req, res) => {
    let urlPath = req.url ?? '/';

    const qIndex = urlPath.indexOf('?');
    if (qIndex !== -1) urlPath = urlPath.slice(0, qIndex);

    if (urlPath.startsWith('/lastgen/')) {
      urlPath = urlPath.slice('/lastgen'.length);
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = join(distDir, urlPath);

    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      try {
        const indexContent = readFileSync(join(distDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexContent);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  });

  server.listen(port, '127.0.0.1', () => {
    process.stderr.write(`\n  lastgen web UI running at http://localhost:${port}/\n\n`);
  });
}
