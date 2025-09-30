// api/scrape-doctoralia.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { provincia, adminPassword } = req.body || {};
  
  // Protección básica
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log(`Scraping Doctoralia para: ${provincia}`);
    
    // URLs base por provincia
    const urls = {
      'Madrid': 'https://www.doctoralia.es/clinicas/madrid',
      'Barcelona': 'https://www.doctoralia.es/clinicas/barcelona',
      'Valencia': 'https://www.doctoralia.es/clinicas/valencia',
      'Alicante': 'https://www.doctoralia.es/clinicas/alicante',
      'Sevilla': 'https://www.doctoralia.es/clinicas/sevilla',
      'Málaga': 'https://www.doctoralia.es/clinicas/malaga'
    };

    const url = urls[provincia];
    if (!url) {
      return res.status(400).json({ error: `Provincia no soportada: ${provincia}` });
    }

    // Fetch básico (Doctoralia puede bloquear, esto es MVP)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Doctoralia`);
    }

    const html = await response.text();
    
    // Extracción básica de precios (regex simple - mejora según estructura real)
    const preciosMatch = html.match(/(\d+)\s*€/g);
    
    if (!preciosMatch || preciosMatch.length === 0) {
      console.warn('No se encontraron precios en el HTML');
      return res.json({
        provincia,
        error: 'No se pudieron extraer precios',
        metodo: 'manual_update_needed',
        timestamp: new Date().toISOString()
      });
    }

    // Convertir a números y filtrar outliers
    const precios = preciosMatch
      .map(p => parseInt(p.replace('€', '').trim()))
      .filter(p => p >= 30 && p <= 300); // Filtro de precios razonables

    if (precios.length === 0) {
      return res.json({
        provincia,
        error: 'Precios fuera de rango razonable',
        metodo: 'manual_update_needed',
        timestamp: new Date().toISOString()
      });
    }

    // Calcular estadísticas
    precios.sort((a, b) => a - b);
    const min = precios[Math.floor(precios.length * 0.25)]; // Percentil 25
    const max = precios[Math.floor(precios.length * 0.75)]; // Percentil 75
    const media = Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);

    const resultado = {
      provincia,
      consulta: `€${min}-${max}`,
      precioMedio: `€${media}`,
      muestras: precios.length,
      metodologia: 'Scraping Doctoralia - Percentiles 25-75',
      timestamp: new Date().toISOString(),
      // Mantener otros valores de estimación
      mixPrivado: estimarMixPrivado(provincia),
      crecimiento: '11%', // IDIS general
      dso: estimarDSO(provincia),
      
      // Datos para actualizar código
      codigoActualizar: {
        consulta: `'€${min}-${max}'`,
        mixPrivado: `'${estimarMixPrivado(provincia)}'`,
        crecimiento: `'11%'`,
        dso: `'${estimarDSO(provincia)}'`
      }
    };

    console.log('Scraping exitoso:', resultado);
    return res.status(200).json(resultado);

  } catch (error) {
    console.error('Error en scraping:', error);
    return res.status(500).json({ 
      error: 'Error al scrapear',
      detail: error.message,
      provincia,
      fallback: 'Usa actualización manual desde IDIS'
    });
  }
};

function estimarMixPrivado(provincia) {
  // Basado en renta per cápita y tamaño ciudad
  const mixPorProvincia = {
    'Madrid': '72%',
    'Barcelona': '68%',
    'Valencia': '58%',
    'Alicante': '62%',
    'Sevilla': '60%',
    'Málaga': '64%'
  };
  return mixPorProvincia[provincia] || '60%';
}

function estimarDSO(provincia) {
  // Basado en eficiencia administrativa regional
  const dsoPorProvincia = {
    'Madrid': '48 días',
    'Barcelona': '50 días',
    'Valencia': '52 días',
    'Alicante': '50 días',
    'Sevilla': '53 días',
    'Málaga': '51 días'
  };
  return dsoPorProvincia[provincia] || '52 días';
}