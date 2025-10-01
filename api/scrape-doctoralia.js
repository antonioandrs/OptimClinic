module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { provincia, especialidad = '', adminPassword } = req.body || {};
    
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`Scraping: ${provincia} - ${especialidad || 'General'}`);
    
    // Construir URL según especialidad
    let url;
    const provinciaLower = provincia.toLowerCase()
      .replace('á', 'a').replace('é', 'e').replace('í', 'i')
      .replace('ó', 'o').replace('ú', 'u');
    
    if (especialidad) {
      const especialidadesMap = {
        'traumatologia': 'traumatologo',
        'fisioterapia': 'fisioterapeuta',
        'dermatologia': 'dermatologo',
        'ginecologia': 'ginecologo',
        'pediatria': 'pediatra',
        'psicologia': 'psicologo'
      };
      
      const especialidadUrl = especialidadesMap[especialidad] || especialidad;
      url = `https://www.doctoralia.es/${especialidadUrl}/${provinciaLower}`;
    } else {
      url = `https://www.doctoralia.es/clinicas/${provinciaLower}`;
    }

    console.log('URL intentada:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9'
      }
    });

    if (!response.ok) {
      return res.json({
        provincia,
        especialidad: especialidad || 'general',
        error: `HTTP ${response.status} - URL no válida`,
        urlIntentada: url,
        sugerencia: 'Verifica la URL manualmente en Doctoralia',
        timestamp: new Date().toISOString()
      });
    }

    const html = await response.text();
    const preciosMatch = html.match(/(\d+)\s*€/g);
    
    if (!preciosMatch || preciosMatch.length === 0) {
      return res.json({
        provincia,
        especialidad: especialidad || 'general',
        error: 'No se encontraron precios en la página',
        urlIntentada: url,
        timestamp: new Date().toISOString()
      });
    }

    const precios = preciosMatch
      .map(p => parseInt(p.replace('€', '').trim()))
      .filter(p => p >= 30 && p <= 300);

    if (precios.length === 0) {
      return res.json({
        provincia,
        especialidad: especialidad || 'general',
        error: 'Precios fuera de rango (30-300€)',
        timestamp: new Date().toISOString()
      });
    }

    precios.sort((a, b) => a - b);
    const min = precios[Math.floor(precios.length * 0.25)];
    const max = precios[Math.floor(precios.length * 0.75)];
    const media = Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);

    const resultado = {
      provincia,
      especialidad: especialidad || 'general',
      consulta: `€${min}-${max}`,
      precioMedio: `€${media}`,
      muestras: precios.length,
      urlUsada: url,
      metodologia: `Doctoralia ${especialidad || 'general'} - Percentiles 25-75`,
      timestamp: new Date().toISOString(),
      mixPrivado: estimarMixPrivado(provincia),
      crecimiento: '11%',
      dso: estimarDSO(provincia),
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
      detail: error.message
    });
  }
};

function estimarMixPrivado(provincia) {
  const mix = {
    'Madrid': '72%', 'Barcelona': '68%', 'Valencia': '58%',
    'Alicante': '62%', 'Sevilla': '60%', 'Málaga': '64%'
  };
  return mix[provincia] || '60%';
}

function estimarDSO(provincia) {
  const dso = {
    'Madrid': '48 días', 'Barcelona': '50 días', 'Valencia': '52 días',
    'Alicante': '50 días', 'Sevilla': '53 días', 'Málaga': '51 días'
  };
  return dso[provincia] || '52 días';
}