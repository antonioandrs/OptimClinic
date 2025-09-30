// api/strategy.js
module.exports = async (req, res) => {
  // CORS para desarrollo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tipo = 'premium', ubicacion = 'centro', provincia = 'Madrid', mercado = {}, finanzas = {} } = req.body || {};

    // Validación básica
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY');
      return res.status(500).json({ 
        error: 'Configuration error',
        ...getFallback(tipo, ubicacion, provincia)
      });
    }

    const prompt = buildPrompt({ tipo, ubicacion, provincia, mercado, finanzas });
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Eres un consultor de growth marketing para clínicas médicas en España. Respondes ÚNICAMENTE con JSON válido, sin texto adicional.'
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
        ...getFallback(tipo, ubicacion, provincia)
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty response from OpenAI');
      return res.status(500).json({ 
        error: 'Empty AI response',
        ...getFallback(tipo, ubicacion, provincia)
      });
    }

    // Con response_format: json_object NO debería necesitar limpieza
    let strategy;
    try {
      strategy = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      // Fallback: intenta extraer JSON si viene envuelto (no debería pasar)
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          strategy = JSON.parse(match[0]);
        } catch {
          return res.status(500).json({ 
            error: 'Invalid JSON from AI',
            raw: content.substring(0, 200),
            ...getFallback(tipo, ubicacion, provincia)
          });
        }
      } else {
        return res.status(500).json({ 
          error: 'No JSON found in response',
          ...getFallback(tipo, ubicacion, provincia)
        });
      }
    }

    // Validación del schema mínimo
    if (!strategy.titulo || !Array.isArray(strategy.propuestaValor)) {
      console.warn('Incomplete strategy schema:', Object.keys(strategy));
      strategy = { ...getFallback(tipo, ubicacion, provincia), ...strategy };
    }

    return res.status(200).json(strategy);

  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      ...getFallback(req.body?.tipo, req.body?.ubicacion, req.body?.provincia)
    });
  }
};

function buildPrompt({ tipo, ubicacion, provincia, mercado, finanzas }) {
  return `Genera una estrategia de marketing para una clínica médica con estas características:

CONTEXTO:
- Tipo: ${tipo}
- Ubicación: ${ubicacion}
- Provincia: ${provincia}
- Rango de precios del mercado: ${mercado.rangoConsulta || '€80-150'}
- Mix privado sector: ${mercado.mixPrivado || '60%'}
- Crecimiento sector: ${mercado.crecimiento || '10%'}
- Ticket medio actual: ${finanzas.ticketMedio || 100}€
- Pacientes/mes: ${finanzas.pacientes || 150}
- Margen actual: ${finanzas.margenPct || 65}%

DEVUELVE JSON CON ESTA ESTRUCTURA EXACTA:
{
  "titulo": "Estrategia [Premium/Volumen/Nicho] - [Provincia]",
  "resumen": "Resumen ejecutivo de 2-3 líneas",
  "precioObjetivo": "€XX-XX",
  "presupuestoSugeridoPctIngresos": 6,
  "propuestaValor": ["Punto 1", "Punto 2", "Punto 3"],
  "posicionamiento": "Frase de posicionamiento clara",
  "personas": [
    {"nombre": "Profesional 30-45", "dolor": "Falta de tiempo", "motivadores": "Eficiencia y calidad"}
  ],
  "mixCanales": [
    {"canal": "Google Ads", "objetivo": "Captar nuevos pacientes", "presupuestoPct": 40, "mensajes": ["Cita en 24h", "Especialistas certificados"]},
    {"canal": "SEO local", "objetivo": "Visibilidad orgánica", "presupuestoPct": 20, "mensajes": ["Primera consulta gratuita"]},
    {"canal": "Redes sociales", "objetivo": "Brand awareness", "presupuestoPct": 25, "mensajes": ["Testimonios pacientes"]},
    {"canal": "Email marketing", "objetivo": "Retención", "presupuestoPct": 15, "mensajes": ["Programa fidelización"]}
  ],
  "plan90dias": [
    {"fase": "0-30", "acciones": ["Acción 1 concreta", "Acción 2 concreta"]},
    {"fase": "31-60", "acciones": ["Acción 3", "Acción 4"]},
    {"fase": "61-90", "acciones": ["Acción 5", "Acción 6"]}
  ],
  "calendarioContenido": [
    {"mes": "Mes 1", "ideas": ["Post sobre beneficio X", "Video testimonial"]},
    {"mes": "Mes 2", "ideas": ["Webinar", "Caso de éxito"]},
    {"mes": "Mes 3", "ideas": ["FAQ interactivo", "Promoción especial"]}
  ],
  "kpis": [
    {"nombre": "CAC (Coste Adquisición Cliente)", "objetivo": "<50€"},
    {"nombre": "Tasa conversión web", "objetivo": ">3%"},
    {"nombre": "ROI marketing", "objetivo": ">300%"}
  ],
  "riesgos": ["Competencia agresiva en precios", "Regulación publicidad sanitaria"],
  "alianzas": ["Farmacias locales", "Gimnasios y centros wellness", "Mutuas laborales"],
  "notas": "Adaptado a regulación española de publicidad sanitaria"
}

IMPORTANTE: Devuelve SOLO el JSON, sin texto antes ni después.`;
}

function getFallback(tipo = 'premium', ubicacion = 'centro', provincia = 'Madrid') {
  const strategies = {
    premium: {
      titulo: `Estrategia Premium - ${provincia}`,
      resumen: 'Posicionamiento de alta gama enfocado en experiencia excepcional y especialización.',
      precioObjetivo: '€120-180',
      presupuestoSugeridoPctIngresos: 7,
      propuestaValor: [
        'Atención personalizada con los mejores especialistas',
        'Tecnología médica de última generación',
        'Experiencia de paciente superior (parking, horarios flexibles, telemedicina)'
      ],
      posicionamiento: 'La clínica de referencia para quienes buscan la mejor atención médica privada',
      personas: [
        { nombre: 'Ejecutivo 35-55 años', dolor: 'Falta de tiempo, necesidad de confianza', motivadores: 'Calidad garantizada, rapidez, discreción' }
      ],
      mixCanales: [
        { canal: 'Google Ads', objetivo: 'Captar pacientes de alto valor', presupuestoPct: 35, mensajes: ['Cita express en 24h', 'Segunda opinión médica'] },
        { canal: 'LinkedIn Ads', objetivo: 'Alcance ejecutivo', presupuestoPct: 25, mensajes: ['Check-up ejecutivo', 'Medicina preventiva'] },
        { canal: 'Marketing contenidos', objetivo: 'Autoridad', presupuestoPct: 25, mensajes: ['Artículos médicos', 'Podcast salud'] },
        { canal: 'Partnerships', objetivo: 'Referidos', presupuestoPct: 15, mensajes: ['Programa corporativo', 'Convenios empresas'] }
      ]
    },
    volumen: {
      titulo: `Estrategia Alto Volumen - ${provincia}`,
      resumen: 'Maximizar captación con precios competitivos y eficiencia operativa.',
      precioObjetivo: '€60-90',
      presupuestoSugeridoPctIngresos: 9,
      propuestaValor: [
        'Precios accesibles sin comprometer calidad',
        'Sistema de citas ágil y sin esperas',
        'Amplia disponibilidad horaria'
      ],
      posicionamiento: 'Atención médica de calidad al alcance de todos',
      personas: [
        { nombre: 'Familias 30-50 años', dolor: 'Precio elevado sanidad privada', motivadores: 'Ahorro, accesibilidad, confianza' }
      ],
      mixCanales: [
        { canal: 'Google Ads', objetivo: 'Volumen de citas', presupuestoPct: 45, mensajes: ['Consulta desde 60€', 'Sin lista de espera'] },
        { canal: 'Facebook/Instagram', objetivo: 'Awareness local', presupuestoPct: 30, mensajes: ['Primera consulta -20%', 'Bono familiar'] },
        { canal: 'SEO local', objetivo: 'Tráfico orgánico', presupuestoPct: 15, mensajes: ['Reseñas Google'] },
        { canal: 'Email', objetivo: 'Retención', presupuestoPct: 10, mensajes: ['Recordatorios', 'Ofertas exclusivas'] }
      ]
    },
    nicho: {
      titulo: `Estrategia Especialización - ${provincia}`,
      resumen: 'Dominar un nicho específico con alta especialización y referencia médica.',
      precioObjetivo: '€100-150',
      presupuestoSugeridoPctIngresos: 6,
      propuestaValor: [
        'Especialización única en [área específica]',
        'Equipo médico con formación internacional',
        'Protocolos clínicos avanzados'
      ],
      posicionamiento: 'Referentes en [especialidad] con resultados demostrables',
      personas: [
        { nombre: 'Paciente especializado', dolor: 'Falta de expertos en su condición', motivadores: 'Solución definitiva, experiencia médica' }
      ],
      mixCanales: [
        { canal: 'SEO especializado', objetivo: 'Autoridad', presupuestoPct: 40, mensajes: ['Artículos técnicos', 'Casos clínicos'] },
        { canal: 'Relaciones médicas', objetivo: 'Referidos', presupuestoPct: 30, mensajes: ['Formación profesionales', 'Colaboraciones'] },
        { canal: 'Comunidades específicas', objetivo: 'Engagement', presupuestoPct: 20, mensajes: ['Grupos apoyo', 'Webinars'] },
        { canal: 'Google Ads long-tail', objetivo: 'Búsquedas específicas', presupuestoPct: 10, mensajes: ['Tratamiento X', 'Especialista Y'] }
      ]
    }
  };

  const base = strategies[tipo] || strategies.premium;
  
  return {
    ...base,
    plan90dias: [
      { fase: '0-30', acciones: ['Configurar tracking analytics', 'Lanzar campañas principales', 'Optimizar Google My Business'] },
      { fase: '31-60', acciones: ['Ajustar pujas según CAC', 'Crear contenido mensual', 'Implementar email automation'] },
      { fase: '61-90', acciones: ['Escalar canales rentables', 'Lanzar programa referidos', 'Analizar LTV paciente'] }
    ],
    calendarioContenido: [
      { mes: 'Mes 1', ideas: ['Post consejos prevención', 'Video recorrido instalaciones', 'Testimonial paciente'] },
      { mes: 'Mes 2', ideas: ['Infografía proceso tratamiento', 'FAQ interactivo', 'Caso éxito anonimizado'] },
      { mes: 'Mes 3', ideas: ['Webinar salud', 'Comparativa tratamientos', 'Promoción trimestral'] }
    ],
    kpis: [
      { nombre: 'CAC', objetivo: '<60€' },
      { nombre: 'Tasa conversión web', objetivo: '>2.5%' },
      { nombre: 'Coste por clic', objetivo: '<2€' },
      { nombre: 'ROI marketing', objetivo: '>250%' }
    ],
    riesgos: ['Saturación mercado local', 'Cambios algoritmo Google', 'Restricciones legales publicidad sanitaria'],
    alianzas: ['Farmacias cercanas', 'Centros deportivos', 'Empresas zona para medicina laboral'],
    notas: 'Estrategia base. Ajustar según análisis competencia local y regulación autonómica.'
  };
}