import http from 'node:http';
import {shareBackend} from './share-backend.mjs';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pdfBackend } from './pdf-backend.mjs';
const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream' };
http.createServer(async (req, res) => {
  if(await shareBackend(req,res))return;
  if(await pdfBackend(req,res))return;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
    const info = await stat(file);if(!info.isFile())throw Error();
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Length': info.size, 'Cache-Control': pathname.startsWith('/vendor/latex-ocr/')||pathname.startsWith('/vendor/ort/')?'public, max-age=86400':'no-cache', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
