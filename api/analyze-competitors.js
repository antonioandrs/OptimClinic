module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { competitors = [], contexto = {} } = req.body || {};
    
    if (!competitors || competitors.length === 0) {
      return res.status(400).json({ error: 'No hay competidores para analizar' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY');
      return res.status(500).json({ 
        error: 'Configuration error',
        ...getFallbackAnalysis(competitors, contexto)
      });
    }

    const prompt = buildAnalysisPrompt(competitors, contexto);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Eres un consultor de inteligencia competitiva para clínicas médicas en España. Analizas competidores y generas insights accionables. Respondes ÚNICAMENTE con JSON válido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return res.status(500).json({ 
        error: 'AI service error',
        ...getFallbackAnalysis(competitors, contexto)
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty response from OpenAI');
      return res.status(500).json({ 
        error: 'Empty AI response',
        ...getFallbackAnalysis(competitors, contexto)
      });
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        return res.status(500).json({ 
          error: 'Invalid JSON from AI',
          ...getFallbackAnalysis(competitors, contexto)
        });
      }
    }

    if (!analysis.resumenEjecutivo || !analysis.oportunidades) {
      console.warn('Incomplete analysis schema');
      analysis = { ...getFallbackAnalysis(competitors, contexto), ...analysis };
    }

    return res.status(200).json(analysis);

  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      ...getFallbackAnalysis(req.body?.competitors, req.body?.contexto)
    });
  }
};

function buildAnalysisPrompt(competitors, contexto) {
  const competitorsData = competitors.map((c, i) => {
    let preciosTexto = 'No visibles';
    if (c.preciosVisibles) {
      const parts = [];
      if (c.preciosVisibles.consultas) {
        parts.push(`Consultas: €${c.preciosVisibles.consultas.min}-${c.preciosVisibles.consultas.max} (promedio €${c.preciosVisibles.consultas.promedio})`);
      }
      if (c.preciosVisibles.tratamientos) {
        parts.push(`Tratamientos/Cirugías: €${c.preciosVisibles.tratamientos.min}-${c.preciosVisibles.tratamientos.max}`);
      }
      if (c.preciosVisibles.fuente) {
        parts.push(`Fuente: ${c.preciosVisibles.fuente}`);
      }
      preciosTexto = parts.join(' | ');
    }

    let doctoraliaInfo = '';
    if (c.doctoralia && c.doctoralia.found) {
      doctoraliaInfo = `
DATOS DOCTORALIA:
- Perfil encontrado: ${c.doctoralia.url || 'Sí'}
- Valoración: ${c.doctoralia.rating ? c.doctoralia.rating + '★' : 'No disponible'}
- Opiniones: ${c.doctoralia.reviews || 'No disponible'}
- Especialidades verificadas: ${c.doctoralia.especialidades ? c.doctoralia.especialidades.join(', ') : 'N/A'}`;
    }
    
    return `
COMPETIDOR ${i + 1}: ${c.url}
- Título: ${c.titulo || 'N/A'}
- Descripción: ${c.descripcion || 'N/A'}
- Servicios detectados (${c.servicios ? c.servicios.length : 0}): ${c.servicios ? c.servicios.join(', ') : 'No detectados'}
- Precios: ${preciosTexto}
- Contacto: Tel ${c.contacto && c.contacto.telefono ? c.contacto.telefono : 'No'} / Email ${c.contacto && c.contacto.email ? c.contacto.email : 'No'}
- Redes sociales: ${c.redesSociales ? c.redesSociales.join(', ') : 'Ninguna'}
- Estructura web: ${c.estructura ? c.estructura.secciones : 0} secciones, ${c.estructura ? c.estructura.enlaces : 0} enlaces
${doctoraliaInfo}

EXTRACTO DE CONTENIDO WEB:
${c.contenidoCompleto ? c.contenidoCompleto.substring(0, 2000) : 'No disponible'}
...`;
  }).join('\n\n');

  return `Analiza estos ${competitors.length} competidores de una clínica médica en ${contexto.provincia || 'España'}:

${competitorsData}

CONTEXTO DEL PROYECTO:
- Provincia: ${contexto.provincia || 'N/A'}
- Especialidad: ${contexto.especialidad || 'General'}
- Tipo de estrategia: ${contexto.estrategia || 'N/A'}
- Ubicación: ${contexto.ubicacion || 'N/A'}

DEVUELVE JSON CON ESTA ESTRUCTURA EXACTA:
{
  "resumenEjecutivo": "Resumen de 2-3 líneas sobre el panorama competitivo",
  "rangoPrecios": {
    "minimo": 60,
    "maximo": 150,
    "promedio": 95,
    "posicionamiento": "Los competidores se posicionan en rango medio-alto"
  },
  "serviciosComunes": ["Servicio 1", "Servicio 2", "Servicio 3"],
  "presenciaDigital": {
    "nivel": "medio/alto/bajo",
    "analisis": "Descripción de madurez digital",
    "redesMasUsadas": ["Instagram", "Facebook"]
  },
  "fortalezasCompetidores": [
    "Fortaleza 1 común entre competidores",
    "Fortaleza 2"
  ],
  "debilidadesCompetidores": [
    "Debilidad 1 común",
    "Debilidad 2"
  ],
  "oportunidades": [
    {"gap": "Oportunidad específica no cubierta", "accion": "Cómo aprovecharla", "impacto": "alto/medio"},
    {"gap": "Segunda oportunidad", "accion": "Acción recomendada", "impacto": "medio"}
  ],
  "posicionamientoRecomendado": "Recomendación clara de cómo diferenciarse",
  "amenazas": ["Amenaza 1", "Amenaza 2"],
  "kpisComparativos": [
    {"metrica": "Precio promedio", "competidores": "€95", "recomendado": "€85-110"},
    {"metrica": "Servicios ofrecidos", "competidores": "5-7", "recomendado": "8-10"}
  ]
}

IMPORTANTE: 
- Analiza el CONTENIDO COMPLETO proporcionado, no solo metadatos
- Si hay datos de Doctoralia con valoraciones, úsalos para evaluar reputación
- Diferencia entre precios de consultas y tratamientos mayores
- Identifica gaps REALES basándote en el contenido completo
- Si algo no está claro en el contenido, dilo explícitamente
- Prioriza insights basados en datos concretos del contenido
- Devuelve SOLO el JSON, sin texto adicional`;
}

function getFallbackAnalysis(competitors, contexto) {
  const numCompetidores = competitors ? competitors.length : 0;
  const serviciosUnicos = new Set();
  const redesUnicos = new Set();
  let preciosMin = [], preciosMax = [];
  
  if (competitors) {
    competitors.forEach(c => {
      if (c.servicios) c.servicios.forEach(s => serviciosUnicos.add(s));
      if (c.redesSociales) c.redesSociales.forEach(r => redesUnicos.add(r));
      if (c.preciosVisibles) {
        if (c.preciosVisibles.consultas) {
          preciosMin.push(c.preciosVisibles.consultas.min);
          preciosMax.push(c.preciosVisibles.consultas.max);
        }
        if (c.preciosVisibles.todos) {
          c.preciosVisibles.todos.forEach(p => {
            if (p <= 500) {
              preciosMin.push(p);
              preciosMax.push(p);
            }
          });
        }
      }
    });
  }

  const precioMin = preciosMin.length > 0 ? Math.min(...preciosMin) : 70;
  const precioMax = preciosMax.length > 0 ? Math.max(...preciosMax) : 140;
  const precioPromedio = preciosMin.length > 0 
    ? Math.round((precioMin + precioMax) / 2) 
    : 95;

  return {
    resumenEjecutivo: `Análisis de ${numCompetidores} competidores en ${contexto.provincia || 'la zona'}. Mercado con competencia moderada y oportunidades de diferenciación en servicios digitales y experiencia de paciente.`,
    rangoPrecios: {
      minimo: precioMin,
      maximo: precioMax,
      promedio: precioPromedio,
      posicionamiento: 'Los competidores se posicionan en rango medio con margen para premium'
    },
    serviciosComunes: Array.from(serviciosUnicos).slice(0, 6),
    presenciaDigital: {
      nivel: 'medio',
      analisis: 'Presencia digital básica en la mayoría. Pocas aprovechan telemedicina o automatización de citas.',
      redesMasUsadas: Array.from(redesUnicos).slice(0, 3)
    },
    fortalezasCompetidores: [
      'Experiencia consolidada en el mercado local',
      'Base de pacientes establecida',
      'Ubicaciones estratégicas'
    ],
    debilidadesCompetidores: [
      'Webs poco optimizadas para conversión',
      'Escasa presencia en redes sociales',
      'Falta de servicios digitales (telemedicina, cita online)',
      'Horarios limitados'
    ],
    oportunidades: [
      {
        gap: 'Telemedicina y consulta online',
        accion: 'Implementar plataforma de videoconsulta y seguimiento digital',
        impacto: 'alto'
      },
      {
        gap: 'Experiencia de paciente premium',
        accion: 'Sistema de citas flexible, recordatorios automáticos, parking',
        impacto: 'alto'
      },
      {
        gap: 'Marketing de contenidos',
        accion: 'Blog educativo, newsletter, casos de éxito anonimizados',
        impacto: 'medio'
      },
      {
        gap: 'Presencia digital activa',
        accion: 'Redes sociales con contenido regular, reseñas Google',
        impacto: 'medio'
      }
    ],
    posicionamientoRecomendado: 'Posicionarse como la clínica innovadora que combina excelencia médica con tecnología y experiencia de paciente superior. Enfoque en accesibilidad (telemedicina + horarios flexibles) y transparencia (precios claros, proceso explicado).',
    amenazas: [
      'Posible entrada de grandes grupos hospitalarios',
      'Regulación más estricta en publicidad sanitaria',
      'Saturación del mercado en especialidades comunes'
    ],
    kpisComparativos: [
      { metrica: 'Precio consulta', competidores: `€${precioPromedio}`, recomendado: `€${precioMin}-€${precioMax}` },
      { metrica: 'Servicios digitales', competidores: 'Bajo', recomendado: 'Alto (telemedicina, app)' },
      { metrica: 'Presencia redes', competidores: 'Media', recomendado: 'Alta (3+ plataformas)' },
      { metrica: 'Tiempo respuesta', competidores: '24-48h', recomendado: '<4h' }
    ]
  };
}