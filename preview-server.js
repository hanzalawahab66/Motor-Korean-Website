const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname; // serve current directory
const port = process.env.PORT ? Number(process.env.PORT) : 5502;
const host = 'localhost';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function send(res, status, headers, body) {
  const hdrs = Object.assign({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }, headers || {});
  res.writeHead(status, hdrs);
  if (body) res.end(body); else res.end();
}

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://${host}:${port}`);
    const pathname = u.pathname;
    const params = u.searchParams;

    function sendJson(obj, status = 200) {
      try {
        const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
        send(res, status, { 'Content-Type': 'application/json; charset=utf-8' }, body);
      } catch (_) {
        send(res, 500, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ error: 'json_serialize_failed' }));
      }
    }

    function readBackendJson(file, fallback) {
      try {
        const fp = path.join(root, 'backend', file);
        const raw = fs.readFileSync(fp, 'utf-8');
        const data = JSON.parse(raw || '[]');
        return data;
      } catch (_) {
        return fallback !== undefined ? fallback : [];
      }
    }

    // Lightweight preview API routes
    if (pathname === '/public/reviews') {
      const arr = readBackendJson('reviews.json', []);
      const lim = Number(params.get('limit') || '0');
      const out = Array.isArray(arr) ? (lim > 0 ? arr.slice(0, lim) : arr) : [];
      return sendJson(out);
    }

    if (pathname === '/public/listings') {
      const listings = readBackendJson('listings.json', []);
      const allowed = new Set(['approved', 'sold', 'booked']);
      const visible = (Array.isArray(listings) ? listings : [])
        .filter(l => allowed.has(String(l.status || '').toLowerCase()))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return sendJson({ listings: visible });
    }

    if (pathname.startsWith('/public/listings/by-tag')) {
      const tagParam = String(params.get('tag') || params.get('slug') || '').trim().toLowerCase();
      const tagIdParam = params.get('tag_id');
      const originParam = String(params.get('origin') || '').trim().toLowerCase();
      const requireAdmin = originParam === 'admin';
      const tags = readBackendJson('tags.json', []);
      let tagId = Number(tagIdParam);
      if (!Number.isFinite(tagId)) {
        const t = (Array.isArray(tags) ? tags : []).find(x => String(x.slug || '').toLowerCase() === tagParam || String(x.name || '').toLowerCase() === tagParam);
        tagId = t && Number(t.id);
      }
      if (!Number.isFinite(tagId)) {
        const t2 = (Array.isArray(tags) ? tags : []).find(x => String(x.slug || '').toLowerCase() === 'clearance-sale' || String(x.name || '').toLowerCase() === 'clearance sale');
        tagId = t2 && Number(t2.id);
      }
      if (!Number.isFinite(tagId)) tagId = 109;
      const listings = readBackendJson('listings.json', []);
      const allowed = new Set(['approved', 'sold', 'booked']);
      const out = (Array.isArray(listings) ? listings : [])
        .filter(l => {
          if (!allowed.has(String(l.status || '').toLowerCase())) return false;
          if (requireAdmin && !(l.seller_id == null || l.sellerId == null)) return false;
          const ids = Array.isArray(l.tag_ids) ? l.tag_ids.map(Number) : [];
          const names = Array.isArray(l.tags) ? l.tags.map(s => String(s || '').toLowerCase()) : [];
          return ids.some(x => Number(x) === Number(tagId)) || names.includes('clearance sale') || names.includes('clearance-sale');
        })
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return sendJson({ listings: out });
    }

    if (pathname.startsWith('/public/listings/')) {
      const id = pathname.split('/').pop();
      const listings = readBackendJson('listings.json', []);
      const allowed = new Set(['approved', 'sold', 'booked']);
      const one = (Array.isArray(listings) ? listings : []).find(l => String(l.id) === String(id) && allowed.has(String(l.status || '').toLowerCase()));
      if (!one) return sendJson({ error: 'Vehicle not found' }, 404);
      return sendJson(one);
    }

    if (pathname === '/public/blogs') {
      const blogs = readBackendJson('blogs.json', []);
      const list = Array.isArray(blogs) ? blogs.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) : [];
      return sendJson({ blogs: list });
    }

    if (pathname.startsWith('/public/blogs/')) {
      const id = Number(pathname.split('/').pop());
      const blogs = readBackendJson('blogs.json', []);
      const blog = (Array.isArray(blogs) ? blogs : []).find(b => Number(b.id) === id);
      if (!blog) return sendJson({ error: 'Blog not found' }, 404);
      return sendJson(blog);
    }

    if (pathname === '/public/categories') {
      const cats = readBackendJson('categories.json', []);
      return sendJson({ categories: Array.isArray(cats) ? cats : [] });
    }

    if (pathname === '/public/models') {
      const models = readBackendJson('models.json', []);
      return sendJson(Array.isArray(models) ? models : []);
    }

    if (pathname === '/public/tags') {
      const tags = readBackendJson('tags.json', []);
      return sendJson(Array.isArray(tags) ? tags : []);
    }

    // Static file serving fallback
    const urlPath = decodeURIComponent(u.pathname);
    let filePath = path.join(root, urlPath);
    if (filePath.endsWith('/')) filePath += 'index.html';
    if (!path.relative(root, filePath).startsWith('')) {
      return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
    }
    fs.stat(filePath, (err, stat) => {
      if (err) {
        return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
      }
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      fs.readFile(filePath, (err2, data) => {
        if (err2) {
          return send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error');
        }
        const ext = path.extname(filePath).toLowerCase();
        const type = mime[ext] || 'application/octet-stream';
        send(res, 200, { 'Content-Type': type }, data);
      });
    });
  } catch (e) {
    send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error');
  }
});

server.listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}/`);
});
