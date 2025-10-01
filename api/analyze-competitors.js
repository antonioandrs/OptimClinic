// api/analyze-competitors.js
// Node 18+ (Vercel). Endpoint que analiza varios competidores:
// - Lee la HOME con Jina Reader (r.jina.ai)
// - Llama al scraper multipágina local (/api/scrape-competitor)
// - Fusiona resultados y devuelve items + estadística de mercado

const CONFIG = {
  CONCURRENCY: 2,
  SCRAPER_TIMEOUT_MS: 9000,
  SCRAPER_MAX_EXTRA_PAGES: 2,
  RETRIES: 1,
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { urls = [], maxExtraPages, timeoutMs } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Missing urls[]' });
    }

    const baseUrl = getBaseUrl(req);
    const tasks = [...urls];
    const results = [];
    let running = 0;

    await new Promise((resolve) => {
      const kick = () => {
        while (running < CONFIG.CONCURRENCY && tasks.length) {
          const url = tasks.shift();
          running++;
          analyzeOne(url, {
            baseUrl,
            maxExtraPages: isFiniteNumber(maxExtraPages) ? maxExtraPages : CONFIG.SCRAPER_MAX_EXTRA_PAGES,
            timeoutMs: isFiniteNumber(timeoutMs) ? timeoutMs : CONFIG.SCRAPER_TIMEOUT_MS,
          })
            .then(r => results.push(r))
            .catch(e => results.push({ url, _error: String(e?.message || e) }))
            .finally(() => {
              running--;
              if (tasks.length) kick();
              else if (running === 0) resolve();
            });
        }
      };
      kick();
    });

    const mercado = computeMarketPriceStats(results);

    return res.status(200).json({
      status: 'success',
      count: results.length,
      mercado,
      items: results,
    });

  } catch (err) {
    console.error(err);
    return res.status(200).json({ status: 'error', error: err.message || String(err) });
  }
}

/* =========================
   Core por competidor
   ========================= */
async function analyzeOne(targetUrl, { baseUrl, maxExtraPages, timeoutMs }) {
  const out = { url: targetUrl };
  let jina = null;
  let scraped = null;

  try { jina = await callJinaReader(targetUrl); } catch (e) { out._jinaError = String(e?.message || e); }
  try { scraped = await callScraper(baseUrl, targetUrl, maxExtraPages, timeoutMs); } catch (e) { out._scraperError = String(e?.message || e); }

  const unified = buildUnifiedResult({ url: targetUrl, jina, scraped });
  return unified;
}

/* =========================
   Jina Reader (HOME)
   ========================= */
async function callJinaReader(url, retries = CONFIG.RETRIES) {
  const readerUrl = `https://r.jina.ai/http://${stripProtocol(url)}`;
  try {
    const r = await fetch(readerUrl, { headers: { 'User-Agent': 'Mozilla/5.0 OpticlinicBot' } });
    if (!r.ok) throw new Error(`Jina HTTP ${r.status}`);
    const md = await r.text();

    const textoPlano = mdToPlain(md);
    const titulo = extractMdTitle(md) || domainFrom(url);
    const servicios = detectServicios(textoPlano);

    return {
      fuente: 'jina',
      titulo,
      textoPlano,
      caracteres: textoPlano.length,
      servicios,        // heurístico básico
      rangoPrecios: null, // precios los intentaremos rellenar con el scraper
    };
  } catch (e) {
    if (retries > 0) return callJinaReader(url, retries - 1);
    throw e;
  }
}

/* =========================
   Scraper multipágina local
   ========================= */
async function callScraper(baseUrl, url, maxExtraPages, timeoutMs, retries = CONFIG.RETRIES) {
  const endpoint = `${baseUrl}/api/scrape-competitor`;
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxExtraPages, timeoutMs }),
    });
    if (!r.ok) throw new Error(`Scraper HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (retries > 0) return callScraper(baseUrl, url, maxExtraPages, timeoutMs, retries - 1);
    throw e;
  }
}

/* =========================
   Fusión y utilidades
   ========================= */
function buildUnifiedResult({ url, jina, scraped }) {
  const rangoPrecios = mergePrices(jina?.rangoPrecios, scraped?.preciosVisibles);
  const servicios = mergeServicios(jina?.servicios, scraped?.servicios);

  const titulo = jina?.titulo || scraped?.titulo || domainFrom(url);

  const base = {
    url,
    titulo,
    resumenEjecutivo: jina?.resumenEjecutivo || null,
    servicios,
    presenciaDigital: jina?.presenciaDigital || null,
    claims: jina?.claims || null,
    rangoPrecios,
    debug: {
      jinaChars: jina?.caracteres || 0,
      paginasLeidas: scraped?.paginasLeidas || [],
      caracteresScraped: scraped?.caracteres || 0,
      tituloScraped: scraped?.titulo || null,
    },
  };

  return base;
}

function mergePrices(jinaRange, scrapedPrices) {
  const hasJina = jinaRange && (
    Number.isFinite(jinaRange.minimo) ||
    Number.isFinite(jinaRange.maximo) ||
    Number.isFinite(jinaRange.promedio)
  );
  if (hasJina) return jinaRange;

  if (scrapedPrices && (
    Number.isFinite(scrapedPrices.min) ||
    Number.isFinite(scrapedPrices.max) ||
    Number.isFinite(scrapedPrices.promedio)
  )) {
    return {
      minimo: Number.isFinite(scrapedPrices.min) ? scrapedPrices.min : null,
      maximo: Number.isFinite(scrapedPrices.max) ? scrapedPrices.max : null,
      promedio: Number.isFinite(scrapedPrices.promedio) ? scrapedPrices.promedio : null,
    };
  }
  return null;
}

function mergeServicios(a, b) {
  return uniqTake([...(normalizeList(a)), ...(normalizeList(b))], 30);
}

function normalizeList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === 'string') {
    return x.split(/[,;\n\r•\-–]+/g).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function uniqTake(arr, max = 30) {
  return Array.from(new Set(arr)).slice(0, max);
}

/* ======= Jina helpers (markdown -> texto/servicios) ======= */
function mdToPlain(md) {
  if (!md) return '';
  let t = md.replace(/```[\s\S]*?```/g, ' ')
            .replace(/`[^`]*`/g, ' ')
            .replace(/^#+\s.*$/gm, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[*_>#\-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
  return t;
}

function extractMdTitle(md) {
  const h1 = /^#\s+(.+?)\s*$/m.exec(md || '');
  if (h1) return h1[1].trim();
  const t = /<title>([^<]+)<\/title>/i.exec(md || '');
  return t ? t[1].trim() : null;
}

function detectServicios(text) {
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

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ======= Mercado ======= */
function computeMarketPriceStats(items) {
  const values = [];
  for (const it of items || []) {
    const rp = it?.rangoPrecios;
    if (!rp) continue;
    const v = [rp.minimo, rp.maximo, rp.promedio].filter(Number.isFinite);
    values.push(...v);
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const minimo = values[0];
  const maximo = values[values.length - 1];
  const promedio = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { minimo, maximo, promedio };
}

/* ======= helpers varios ======= */
function isFiniteNumber(x) { return typeof x === 'number' && Number.isFinite(x); }

function stripProtocol(u) {
  return (u || '').replace(/^https?:\/\//i, '');
}

function domainFrom(u) {
  try { return new URL(u).host; } catch { return u; }
}

function getBaseUrl(req) {
  // Construye la base (https://<host>) para llamar al propio endpoint del scraper
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}
