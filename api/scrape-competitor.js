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

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    console.log('Analizando competidor:', cleanUrl);

    // === FASE 1: Scraping web propia con Jina AI ===
    const jinaUrl = `https://r.jina.ai/${cleanUrl}`;
    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown'
      }
    });

    if (!jinaResponse.ok) {
      return res.json({
        url: cleanUrl,
        error: `Error ${jinaResponse.status} al acceder a la web`,
        status: 'error'
      });
    }

    const jinaData = await jinaResponse.json();
    const markdown = jinaData.data?.content || '';
    const htmlContent = jinaData.data?.html || '';

    if (!markdown || markdown.length < 100) {
      return res.json({
        url: cleanUrl,
        error: 'No se pudo extraer contenido de la web',
        status: 'error'
      });
    }

    console.log(`Web propia: ${markdown.length} caracteres`);

    // Extraer datos de la web propia
    const nombreClinica = extractClinicName(cleanUrl, jinaData.data?.title || '');
    const ciudad = extractCity(markdown, cleanUrl);

    const datosWebPropia = {
      url: cleanUrl,
      titulo: jinaData.data?.title || extractTitleFromMarkdown(markdown),
      descripcion: jinaData.data?.description || extractFirstParagraph(markdown),
      contenidoCompleto: markdown.substring(0, 15000),
      servicios: extractServices(markdown),
      contacto: {
        telefono: extractPhone(markdown),
        email: extractEmail(markdown)
      },
      redesSociales: extractSocialMedia(markdown + ' ' + htmlContent),
      palabrasClave: extractKeywords(markdown),
      estructura: analyzeStructure(markdown)
    };

    // === FASE 2: Buscar en Doctoralia ===
    console.log(`Buscando en Doctoralia: ${nombreClinica} ${ciudad}`);
    const doctoraliaData = await scrapeDoctoraliaProfile(nombreClinica, ciudad);

    // === FASE 3: Combinar datos ===
    const resultado = {
      ...datosWebPropia,
      doctoralia: doctoraliaData,
      preciosVisibles: doctoraliaData.precios || null,
      valoracion: doctoraliaData.rating,
      opiniones: doctoraliaData.reviews,
      status: 'success',
      timestamp: new Date().toISOString()
    };

    console.log('Análisis completado:', {
      servicios: resultado.servicios.length,
      precios: resultado.preciosVisibles ? 'Sí' : 'No',
      valoracion: resultado.valoracion || 'N/A',
      opiniones: resultado.opiniones || 0
    });

    return res.status(200).json(resultado);

  } catch (error) {
    console.error('Error en análisis:', error);
    return res.status(500).json({ 
      error: 'Error al analizar sitio web',
      detail: error.message,
      status: 'error'
    });
  }
};

// === NUEVA FUNCIÓN: Scraping de Doctoralia ===
async function scrapeDoctoraliaProfile(nombreClinica, ciudad) {
  try {
    // Construir búsqueda en Doctoralia
    const searchQuery = `${nombreClinica} ${ciudad}`.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '+');
    
    const searchUrl = `https://www.doctoralia.es/buscar?q=${searchQuery}`;
    
    console.log('Buscando en:', searchUrl);
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!searchResponse.ok) {
      console.log('No se pudo buscar en Doctoralia');
      return { found: false };
    }

    const searchHtml = await searchResponse.text();
    
    // Buscar URL del perfil en los resultados (múltiples patrones)
    const profileMatch = searchHtml.match(/href=["'](\/[^"']*belaneve[^"']*)["']/i) ||
                         searchHtml.match(/href=["'](\/clinica\/[^"']+)["']/i) ||
                         searchHtml.match(/href=["'](\/centro[^"']*\/[^"']+)["']/i);
    
    if (!profileMatch) {
      console.log('No se encontró perfil en Doctoralia');
      console.log('HTML snippet:', searchHtml.substring(0, 500));
      return { found: false };
    }

    const profilePath = profileMatch[1];
    const profileUrl = `https://www.doctoralia.es${profilePath}`;
    
    console.log('Perfil encontrado:', profileUrl);

    // Scrapear perfil
    const profileResponse = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (!profileResponse.ok) {
      return { found: false };
    }

    const profileHtml = await profileResponse.text();

    // Extraer datos del perfil
    return {
      found: true,
      url: profileUrl,
      rating: extractRating(profileHtml),
      reviews: extractReviewCount(profileHtml),
      especialidades: extractEspecialidadesDoctoralia(profileHtml),
      precios: extractPreciosDoctoralia(profileHtml)
    };

  } catch (error) {
    console.error('Error scrapeando Doctoralia:', error);
    return { found: false, error: error.message };
  }
}

function extractRating(html) {
  const match = html.match(/rating["\s:]+([0-9.]+)/i) || 
                html.match(/(\d\.\d)\s*de\s*5/i) ||
                html.match(/data-rating="([0-9.]+)"/i);
  return match ? parseFloat(match[1]) : null;
}

function extractReviewCount(html) {
  const match = html.match(/(\d+)\s*opiniones?/i) ||
                html.match(/(\d+)\s*reviews?/i) ||
                html.match(/reviews["\s:]+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function extractEspecialidadesDoctoralia(html) {
  const especialidades = new Set();
  const patterns = [
    /especialidad[^>]*>([^<]+)</gi,
    /specialty[^>]*>([^<]+)</gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const esp = match[1].trim().toLowerCase();
      if (esp.length > 3 && esp.length < 50) {
        especialidades.add(esp);
      }
    }
  });
  
  return Array.from(especialidades).slice(0, 10);
}

function extractPreciosDoctoralia(html) {
  const precios = [];
  
  // Buscar precios en formato "Tratamiento: €XXX" o "€XXX - €YYY"
  const patterns = [
    /(\d{1,5})\s*€/g,
    /€\s*(\d{1,5})/g,
    /desde\s+(\d{1,5})\s*€/gi
  ];
  
  const preciosEncontrados = [];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const precio = parseInt(match[1]);
      if (precio >= 30 && precio <= 50000) {
        preciosEncontrados.push(precio);
      }
    }
  });
  
  if (preciosEncontrados.length === 0) return null;
  
  const sorted = [...new Set(preciosEncontrados)].sort((a, b) => a - b);
  
  // Separar consultas de tratamientos mayores
  const consultaMax = 500;
  const preciosConsulta = sorted.filter(p => p <= consultaMax);
  const preciosTratamientos = sorted.filter(p => p > consultaMax);
  
  const result = {};
  
  if (preciosConsulta.length > 0) {
    result.consultas = {
      min: preciosConsulta[0],
      max: preciosConsulta[preciosConsulta.length - 1],
      promedio: Math.round(preciosConsulta.reduce((a, b) => a + b, 0) / preciosConsulta.length)
    };
  }
  
  if (preciosTratamientos.length > 0) {
    result.tratamientos = {
      min: preciosTratamientos[0],
      max: preciosTratamientos[preciosTratamientos.length - 1],
      promedio: Math.round(preciosTratamientos.reduce((a, b) => a + b, 0) / preciosTratamientos.length)
    };
  }
  
  result.muestras = sorted.length;
  result.todos = sorted;
  result.fuente = 'Doctoralia';
  
  return result;
}

// Funciones auxiliares
function extractClinicName(url, title) {
  // Primero intentar extraer del dominio (más confiable)
  const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?([^.\/]+)\./);
  let domainName = domainMatch ? domainMatch[1] : '';
  
  // Capitalizar primera letra
  domainName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
  
  // Si el título es corto y no tiene muchos separadores, usarlo
  if (title && title.length < 50 && !title.includes('|') && !title.includes('-')) {
    // Extraer solo el nombre de la clínica (primera parte antes de puntuación)
    const cleanTitle = title.split(/[|\-–—:]/)[0].trim();
    if (cleanTitle.length < 30) {
      return cleanTitle;
    }
  }
  
  return domainName;
}

function extractCity(markdown, url) {
  const ciudades = [
    'madrid', 'barcelona', 'valencia', 'sevilla', 'zaragoza',
    'málaga', 'malaga', 'murcia', 'alicante', 'bilbao', 'granada',
    'córdoba', 'cordoba', 'valladolid', 'mallorca', 'vigo', 'gijón', 'gijon'
  ];
  
  // Priorizar ciudad en la URL (más confiable)
  const urlLower = url.toLowerCase();
  for (const ciudad of ciudades) {
    if (urlLower.includes(ciudad)) {
      return ciudad;
    }
  }
  
  // Si no está en URL, buscar en contenido
  const textLower = markdown.toLowerCase();
  
  // Buscar en el primer 20% del contenido (más probable que sea relevante)
  const primeraParte = textLower.substring(0, Math.floor(textLower.length * 0.2));
  
  for (const ciudad of ciudades) {
    if (primeraParte.includes(ciudad)) {
      return ciudad;
    }
  }
  
  return '';
}

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
  
  return [...new Set(Array.from(servicios))].slice(0, 15);
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
    .replace(/[^a-záéíóúñ\s]/g, ' ')
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