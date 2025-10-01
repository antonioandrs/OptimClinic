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

    console.log(`Scraping Doctoralia: ${provincia} - ${especialidad || 'General'}`);
    
    // URLs con especialidad
    const urlsBase = {
      'Madrid': 'https://www.doctoralia.es/clinicas/madrid',
      'Barcelona': 'https://www.doctoralia.es/clinicas/barcelona',
      'Valencia': 'https://www.doctoralia.es/clinicas/valencia',
      'Alicante': 'https://www.doctoralia.es/clinicas/alicante',
      'Sevilla': 'https://www.doctoralia.es/clinicas/sevilla',
      'Málaga': 'https://www.doctoralia.es/clinicas/malaga'
    };

    let url = urlsBase[provincia];
    if (!url) {
      return res.status(400).json({ error: `Provincia no soportada: ${provincia}` });
    }

    // Añadir especialidad a URL si se especifica
    if (especialidad) {
      const especialidadesMap = {
        'traumatologia': 'traumatologia-y-ortopedia',
        'fisioterapia': 'fisioterapia',
        'medicina-general': 'medicina-general',
        'dermatologia': 'dermatologia',
        'ginecologia': 'ginecologia-y-obstetricia',
        'pediatria': 'pediatria',
        'psicologia': 'psicologia'
      };
      const especialidadUrl = especialidadesMap[especialidad.toLowerCase()] || especialidad;
      url = `https://www.doctoralia.es/${especialidadUrl}/${provincia.toLowerCase()}`;
    }

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
    const preciosMatch = html.match(/(\d+)\s*€/g);
    
    if (!preciosMatch || preciosMatch.length === 0) {
      return res.json({
        provincia,
        especialidad: especialidad || 'general',
        error: 'No se encontraron precios',
        metodo: 'manual_update_needed',
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
        error: 'Precios fuera de rango',
        metodo: 'manual_update_needed',
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
      metodologia: `Doctoralia ${especialidad ? especialidad : 'general'} - P25-P75`,
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