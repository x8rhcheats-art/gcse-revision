#!/usr/bin/env node
// dev-server.js — tiny static server over site/ for development preview only.
// John's copy uses start.bat/serve.ps1; this one just doesn't open a browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'app.html';
  if (req.method === 'POST') { res.statusCode = 204; return res.end(); }  // mirror no-op
  let file = path.normalize(path.join(SITE, rel));
  if (!file.startsWith(SITE)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('404 ' + rel); }
  res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  res.end(fs.readFileSync(file));
}).listen(8124, () => console.log('dev server on http://localhost:8124/app.html'));
