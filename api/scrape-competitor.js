// api/scrape-competitor.js
// Serverless (Vercel / Node 18+). Sin dependencias externas.
const KEYWORDS = [
  'precio', 'precios', 'tarifa', 'tarifas', 'honorario', 'honorarios',
  'servicio', 'servicios'
];

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { url, maxExtraPages = 2, timeoutMs = 12000 } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Missing url' });

    const visited = new Set();
    const toVisit = [normalizeUrl(url)];
    const gathered = [];

    while (toVisit.length && gathered.length < (1 + maxExtraPages)) {
      const current = toVisit.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);

      const html = await safeFetchText(current, timeoutMs);
      if (!html) continue;

      const text = plainText(html);
      gathered.push({ url: current, html, text });

      // Solo descubrimos enlaces desde la HOME (o la primera página)
      if (current === normalizeUrl(url)) {
        const links = discoverLinks(html, current);
        const filtered = rankByKeyword(links)
          .filter(Boolean)
          .slice(0, maxExtraPages); // limita páginas extra

        for (const l of filtered) {
          if (!visited.has(l)) toVisit.push(l);
        }
      }
    }

    const combinedText = gathered.map(g => g.text).join('\n\n');
    const servicios = detectServicios(combinedText);
    const preciosVisibles = detectPrecios(combinedText);

    // Título (mejor esfuerzo)
    const titulo = extractTitle(gathered[0]?.html) || domainFrom(url);

    return res.status(200).json({
      status: 'success',
      urlBase: url,
      titulo,
      paginasLeidas: gathered.map(g => g.url),
      caracteres: combinedText.length,
      servicios,
      preciosVisibles, // { min, max, promedio } o null
    });

  } catch (err) {
    console.error(err);
    return res.status(200).json({ status: 'error', error: err.message || String(err) });
  }
}

/* ========== Helpers ========== */
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

async function safeFetchText(u, timeoutMs) {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 OptimClinicBot' }, signal: ctrl.signal });
    clearTimeout(id);
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return null;
    return await r.text();
  } catch { return null; }
}

function plainText(html) {
  // Quita script/style y colapsa espacios
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function discoverLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = [];
  const rx = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    let href = m[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const abs = new URL(href, base).toString();
      // Mantenemos solo mismo dominio para evitar irnos a fuera
      if (new URL(abs).host === base.host) links.push(abs);
    } catch { /* ignore */ }
  }
  // quitamos duplicados
  return Array.from(new Set(links));
}

function rankByKeyword(links) {
  const ranked = links.map(l => {
    const path = (new URL(l)).pathname.toLowerCase();
    const score = KEYWORDS.reduce((acc, k) => acc + (path.includes(k) ? 1 : 0), 0);
    return { l, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.filter(x => x.score > 0).map(x => x.l);
}

function detectServicios(text) {
  // Extrae “servicios” por heurística básica (palabras tras “servicios”/“especialidades”)
  const out = new Set();
  const rx = /\b(servicios|especialidades|tratamientos)\b[:\s-]*([^.]{10,120})/gi;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const chunk = m[2]
      .replace(/[,;•\-–]+/g, ',')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 60);
    chunk.forEach(s => out.add(capitalize(s)));
  }
  return Array.from(out).slice(0, 30);
}

function detectPrecios(text) {
  // Busca números con € o formatos habituales
  const euros = [];
  const rxMoney = /(?:€\s?|\b)(\d{2,4})(?:[.,]\d{1,2})?\s?(?:€)?/g;
  let m;
  while ((m = rxMoney.exec(text)) !== null) {
    const val = parseInt(m[1], 10);
    // Heurística: precios razonables de consulta/procedimiento
    if (val >= 20 && val <= 15000) euros.push(val);
  }
  if (!euros.length) return null;
  euros.sort((a, b) => a - b);
  const min = euros[0];
  const max = euros[euros.length - 1];
  const avg = Math.round(euros.reduce((a, b) => a + b, 0) / euros.length);
  return { min, max, promedio: avg };
}

function extractTitle(html) {
  const m = /<title>([^<]+)<\/title>/i.exec(html || '');
  return m ? decodeHtml(m[1]).trim() : null;
}

function decodeHtml(s) {
  return s
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function domainFrom(u) {
  try { return new URL(u).host; } catch { return u; }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
