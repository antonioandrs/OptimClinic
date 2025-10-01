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

    // Validar y limpiar URL
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    console.log('Analizando con Jina AI:', cleanUrl);

    // Usar Jina AI Reader para obtener contenido completo
    const jinaUrl = `https://r.jina.ai/${cleanUrl}`;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown'
      }
    });

    if (!response.ok) {
      return res.json({
        url: cleanUrl,
        error: `Error ${response.status} al acceder a la web`,
        status: 'error'
      });
    }

    const jinaData = await response.json();
    const markdown = jinaData.data?.content || '';
    const htmlContent = jinaData.data?.html || '';

    if (!markdown || markdown.length < 100) {
      return res.json({
        url: cleanUrl,
        error: 'No se pudo extraer contenido de la web',
        status: 'error'
      });
    }

    console.log(`Contenido extraído: ${markdown.length} caracteres`);

    // Extraer datos estructurados del markdown
    const data = {
      url: cleanUrl,
      titulo: jinaData.data?.title || extractTitleFromMarkdown(markdown),
      descripcion: jinaData.data?.description || extractFirstParagraph(markdown),
      contenidoCompleto: markdown.substring(0, 8000), // Primeros 8k chars para IA
      servicios: extractServices(markdown),
      preciosVisibles: extractPrices(markdown),
      contacto: {
        telefono: extractPhone(markdown),
        email: extractEmail(markdown)
      },
      redesSociales: extractSocialMedia(markdown + ' ' + htmlContent),
      palabrasClave: extractKeywords(markdown),
      estructura: analyzeStructure(markdown),
      status: 'success',
      timestamp: new Date().toISOString()
    };

    console.log('Análisis completado:', {
      servicios: data.servicios.length,
      precios: data.preciosVisibles ? 'Sí' : 'No',
      caracteres: markdown.length
    });

    return res.status(200).json(data);

  } catch (error) {
    console.error('Error en análisis:', error);
    return res.status(500).json({ 
      error: 'Error al analizar sitio web',
      detail: error.message,
      status: 'error'
    });
  }
};

// Funciones de extracción
function extractTitleFromMarkdown(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Sin título';
}

function extractFirstParagraph(markdown) {
  const lines = markdown.split('\n').filter(l => l.trim().length > 50);
  return lines[0]?.substring(0, 200) || '';
}

function extractServices(markdown) {
  const servicios = new Set();
  const commonServices = [
    'fisioterapia', 'traumatologia', 'traumatología', 'dermatologia', 'dermatología',
    'pediatria', 'pediatría', 'ginecologia', 'ginecología', 'psicologia', 'psicología',
    'nutricion', 'nutrición', 'odontologia', 'odontología', 'cardiologia', 'cardiología',
    'oftalmologia', 'oftalmología', 'cirugia plastica', 'cirugía plástica',
    'medicina estetica', 'medicina estética', 'cirugia', 'cirugía',
    'radiologia', 'radiología', 'analisis', 'análisis', 'urgencias',
    'telemedicina', 'consulta online', 'botox', 'acido hialuronico', 'ácido hialurónico',
    'peeling', 'mesoterapia', 'rinoplastia', 'liposuccion', 'liposucción',
    'blefaroplastia', 'abdominoplastia', 'aumento de pecho', 'lifting',
    'tricologia', 'tricología', 'medicina familiar'
  ];
  
  const markdownLower = markdown.toLowerCase();
  commonServices.forEach(servicio => {
    if (markdownLower.includes(servicio)) {
      servicios.add(servicio);
    }
  });
  
  return Array.from(servicios).slice(0, 15);
}

function extractPrices(markdown) {
  const precios = [];
  const patterns = [
    /(\d{1,3}(?:[.,]\d{3})*)\s*€/g,
    /€\s*(\d{1,3}(?:[.,]\d{3})*)/g,
    /desde\s+(\d{1,3}(?:[.,]\d{3})*)\s*€/gi,
    /(\d{1,3}(?:[.,]\d{3})*)\s*euros?/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(markdown)) !== null) {
      const precioStr = match[1].replace(/[.,]/g, '');
      const precio = parseInt(precioStr);
      if (precio >= 30 && precio <= 50000) {
        precios.push(precio);
      }
    }
  });
  
  if (precios.length === 0) return null;
  
  const sorted = [...new Set(precios)].sort((a, b) => a - b);
  
  // Si hay precios muy altos (cirugías), separarlos de consultas
  const consultaMax = 500;
  const preciosConsulta = sorted.filter(p => p <= consultaMax);
  const preciosCirugia = sorted.filter(p => p > consultaMax);
  
  const result = {};
  
  if (preciosConsulta.length > 0) {
    result.consultas = {
      min: preciosConsulta[0],
      max: preciosConsulta[preciosConsulta.length - 1],
      promedio: Math.round(preciosConsulta.reduce((a, b) => a + b, 0) / preciosConsulta.length)
    };
  }
  
  if (preciosCirugia.length > 0) {
    result.cirugias = {
      min: preciosCirugia[0],
      max: preciosCirugia[preciosCirugia.length - 1],
      promedio: Math.round(preciosCirugia.reduce((a, b) => a + b, 0) / preciosCirugia.length)
    };
  }
  
  result.muestras = sorted.length;
  result.todos = sorted;
  
  return result;
}

function extractPhone(markdown) {
  const patterns = [
    /(\+34\s?)?[6789]\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/g,
    /tel[:\s]+(\+?34\s?)?[6789]\d{8}/gi
  ];
  
  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

function extractEmail(markdown) {
  const match = markdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractSocialMedia(content) {
  const redes = [];
  const patterns = {
    facebook: /facebook\.com\/[a-zA-Z0-9._-]+/i,
    instagram: /instagram\.com\/[a-zA-Z0-9._-]+/i,
    twitter: /twitter\.com\/[a-zA-Z0-9._-]+/i,
    linkedin: /linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i,
    youtube: /youtube\.com\/(channel|c|user)\/[a-zA-Z0-9._-]+/i,
    tiktok: /tiktok\.com\/@[a-zA-Z0-9._-]+/i
  };
  
  Object.entries(patterns).forEach(([red, pattern]) => {
    if (pattern.test(content)) {
      redes.push(red);
    }
  });
  
  return redes;
}

function extractKeywords(markdown) {
  const words = markdown.toLowerCase()
    .replace(/[^a-zá-úñ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);
  
  const freq = {};
  words.forEach(w => {
    freq[w] = (freq[w] || 0) + 1;
  });
  
  const stopwords = ['sobre', 'desde', 'hasta', 'para', 'esta', 'este', 'puede', 'como', 'donde', 'cuando', 'pero', 'también', 'hacer', 'nuestro', 'nuestra'];
  
  return Object.entries(freq)
    .filter(([w]) => !stopwords.includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

function analyzeStructure(markdown) {
  const lines = markdown.split('\n');
  const headers = lines.filter(l => l.startsWith('#'));
  const links = (markdown.match(/\[([^\]]+)\]\([^)]+\)/g) || []).length;
  const images = (markdown.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  
  return {
    secciones: headers.length,
    enlaces: links,
    imagenes: images,
    longitudTotal: markdown.length
  };
}