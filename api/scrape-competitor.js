module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body || {};
    
    if (!url) {
      return res.status(400).json({ error: 'URL requerida' });
    }

    // Validar URL
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    console.log('Scraping competitor:', cleanUrl);

    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      timeout: 10000
    });

    if (!response.ok) {
      return res.json({
        url: cleanUrl,
        error: `HTTP ${response.status}`,
        status: 'error'
      });
    }

    const html = await response.text();
    
    // Extraer datos básicos
    const data = {
      url: cleanUrl,
      titulo: extractTitle(html),
      descripcion: extractMetaDescription(html),
      keywords: extractKeywords(html),
      servicios: extractServices(html),
      preciosVisibles: extractPrices(html),
      telefono: extractPhone(html),
      email: extractEmail(html),
      redesSociales: extractSocialMedia(html),
      tecnologias: detectTechnologies(html),
      status: 'success',
      timestamp: new Date().toISOString()
    };

    console.log('Scraping exitoso:', data);
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error scraping competitor:', error);
    return res.status(500).json({ 
      error: 'Error al analizar sitio web',
      detail: error.message,
      status: 'error'
    });
  }
};

// Funciones de extracción
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : 'Sin título';
}

function extractMetaDescription(html) {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  return match ? match[1].trim() : '';
}

function extractKeywords(html) {
  const match = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
  if (!match) return [];
  return match[1].split(',').map(k => k.trim()).filter(k => k.length > 0).slice(0, 10);
}

function extractServices(html) {
  const servicios = [];
  const commonServices = [
    'fisioterapia', 'traumatologia', 'dermatologia', 'pediatria',
    'ginecologia', 'psicologia', 'nutricion', 'odontologia',
    'cardiologia', 'oftalmologia', 'cirugia', 'radiologia',
    'analisis', 'urgencias', 'telemedicina', 'consulta online'
  ];
  
  const htmlLower = html.toLowerCase();
  commonServices.forEach(servicio => {
    if (htmlLower.includes(servicio)) {
      servicios.push(servicio);
    }
  });
  
  return [...new Set(servicios)].slice(0, 8);
}

function extractPrices(html) {
  const precios = [];
  const patterns = [
    /(\d+)\s*€/g,
    /€\s*(\d+)/g,
    /(\d+)\s*euros?/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const precio = parseInt(match[1]);
      if (precio >= 20 && precio <= 500) {
        precios.push(precio);
      }
    }
  });
  
  if (precios.length === 0) return null;
  
  const sorted = [...new Set(precios)].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    promedio: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    muestras: sorted.length
  };
}

function extractPhone(html) {
  const patterns = [
    /(\+34\s?)?[6789]\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/g,
    /tel[:\s]+(\+?34\s?)?[6789]\d{8}/gi
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

function extractEmail(html) {
  const match = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractSocialMedia(html) {
  const redes = [];
  const patterns = {
    facebook: /facebook\.com\/[a-zA-Z0-9._-]+/i,
    instagram: /instagram\.com\/[a-zA-Z0-9._-]+/i,
    twitter: /twitter\.com\/[a-zA-Z0-9._-]+/i,
    linkedin: /linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i,
    youtube: /youtube\.com\/(channel|c|user)\/[a-zA-Z0-9._-]+/i
  };
  
  Object.entries(patterns).forEach(([red, pattern]) => {
    if (pattern.test(html)) {
      redes.push(red);
    }
  });
  
  return redes;
}

function detectTechnologies(html) {
  const tech = [];
  
  if (/wordpress/i.test(html)) tech.push('WordPress');
  if (/wix\.com/i.test(html)) tech.push('Wix');
  if (/shopify/i.test(html)) tech.push('Shopify');
  if (/google-analytics|gtag/i.test(html)) tech.push('Google Analytics');
  if (/hubspot/i.test(html)) tech.push('HubSpot');
  if (/calendly/i.test(html)) tech.push('Calendly');
  if (/docplanner|doctoralia/i.test(html)) tech.push('Doctoralia');
  
  return tech;
}