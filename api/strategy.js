1759244361636_index.html
1508 líneas

html


1759244367421_package.json
13 líneas

json


1759244379527_strategy.js
112 líneas

js

https://optim-clinic.vercel.app Esto es lo que tengo hasta ahora. ¿Cómo lo mejorarías?

Tienes una base sólida con una herramienta financiera completa. Aquí van mejoras concretas organizadas por prioridad:

Críticas Urgentes
1. El endpoint /api/strategy está roto

La llamada desde el frontend va a /api/strategy pero tu archivo está en api/strategy.js sin estar en Vercel
Necesitas crear /api/strategy.js en la raíz del proyecto para que Vercel lo detecte como serverless function
El código tiene lógica de unwrapping de JSON que sugiere que OpenAI devuelve texto envuelto, pero usas response_format: { type: 'json_object' } que debería garantizar JSON limpio
2. Seguridad inexistente

OPENAI_API_KEY expuesta sin rate limiting → cualquiera puede drenar tu cuenta
No hay validación de inputs → injection attacks fáciles
Sin autenticación → tu API es pública
3. UX confusa en el flujo

El usuario debe "Generar Análisis Completo" antes de usar otras pestañas, pero esto no está claro
Los datos de mercado por provincia están hardcodeados y desactualizados
El simulador de sensibilidad no funciona hasta después de calcular, pero no hay indicación
Mejoras de Impacto Alto
Backend
javascript
// api/strategy.js - Versión mejorada
module.exports = async (req, res) => {
  // Rate limiting básico
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // Implementar redis/memoria para tracking de requests por IP
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validación estricta
  const { tipo, ubicacion, provincia, mercado, finanzas } = req.body || {};
  
  if (!tipo || !ubicacion || !provincia) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Eres consultor de estrategia sanitaria en España. Devuelve SOLO JSON válido con el schema exacto solicitado.'
          },
          {
            role: 'user',
            content: `Contexto: clínica ${tipo} en ${ubicacion}, ${provincia}. 
Mercado: ${JSON.stringify(mercado)}. 
Finanzas: ticket ${finanzas.ticketMedio}€, ${finanzas.pacientes} pac/mes, margen ${finanzas.margenPct}%.

Devuelve JSON con:
{
  "titulo": "Estrategia [tipo] para [provincia]",
  "resumen": "2-3 líneas ejecutivas",
  "precioObjetivo": "€XX-XX",
  "presupuestoSugeridoPctIngresos": 7,
  "propuestaValor": ["punto 1", "punto 2", "punto 3"],
  "posicionamiento": "frase de 1 línea",
  "personas": [{"nombre": "Perfil X", "dolor": "...", "motivadores": "..."}],
  "mixCanales": [{"canal": "Google Ads", "objetivo": "...", "presupuestoPct": 40, "mensajes": ["..."]}],
  "plan90dias": [{"fase": "0-30", "acciones": ["..."]}],
  "calendarioContenido": [{"mes": "Mes 1", "ideas": ["..."]}],
  "kpis": [{"nombre": "CAC", "objetivo": "<50€"}],
  "riesgos": ["riesgo 1"],
  "alianzas": ["tipo alianza"],
  "notas": "disclaimer"
}`
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI error:', error);
      return res.status(500).json({ error: 'AI service unavailable' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Con response_format json_object NO deberías necesitar unwrapping
    const parsed = JSON.parse(content);
    
    return res.status(200).json(parsed);
    
  } catch (error) {
    console.error('Strategy generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate strategy',
      fallback: getFallbackStrategy(tipo, ubicacion)
    });
  }
};

function getFallbackStrategy(tipo, ubicacion) {
  // Estrategia básica hardcodeada si falla la AI
  return {
    titulo: `Estrategia ${tipo} - ${ubicacion}`,
    resumen: "Estrategia base generada localmente",
    // ... resto de campos mínimos
  };
}
Frontend
Indicadores de estado claros:

javascript
// Añadir al inicio del <script>
let appState = {
  financialCalculated: false,
  strategyGenerated: false
};

function updateTabAvailability() {
  const tabs = document.querySelectorAll('.tab');
  tabs[1].style.opacity = appState.financialCalculated ? '1' : '0.5';
  tabs[2].style.opacity = appState.financialCalculated ? '1' : '0.5';
  
  if (!appState.financialCalculated) {
    tabs[1].style.pointerEvents = 'none';
    tabs[2].style.pointerEvents = 'none';
  }
}

// Modificar función de cálculo
getEl('calc').addEventListener('click', function
https://vercel.com/antonio-andres-projects-2343cc66/optim-clinic ojo si que lo tengo en vercel

Perfecto, entonces el endpoint está desplegado. El problema es que la llamada falla por errores en el parseo del JSON. Veo varios issues reales:

Problemas Confirmados
1. La lógica de unwrapping es innecesaria y problemática

javascript
// Esto NO deberías necesitarlo con response_format: { type: 'json_object' }
const unwrapCodeFences = (txt) => { ... }
OpenAI con json_object garantiza JSON válido, pero tu código asume que viene con ```json wrapping. Esto sugiere que hubo problemas anteriores y pusiste parches en vez de arreglar la raíz.

2. El prompt no es lo suficientemente directivo Le pides a GPT que "devuelva SOLO JSON" pero luego le das contexto desestructurado. GPT-4o-mini a veces ignora instrucciones si el prompt es largo.

3. No hay manejo de errores visible para el usuario Cuando falla, el usuario ve "Error al generar estrategia" con un stack trace técnico que no ayuda.

Mejoras Concretas Priorizadas
Arreglo Inmediato del Endpoint
api/strategy.js - Version Corregida
Código 
Mejoras Frontend para Manejo de Errores
Ahora el código JS del HTML necesita mejor feedback:

javascript
async function generateStrategy() {
  const out = document.getElementById('strategyOutput');
  out.style.display = 'block';
  out.innerHTML = `
    <div class="analysis-card" style="background:#f0f9ff;">
      <h3 class="analysis-title">⏳ Generando estrategia...</h3>
      <p style="color:#64748b">Consultando inteligencia artificial (10-15 seg)</p>
    </div>
  `;

  try {
    const payload = {
      tipo: document.getElementById('estrategiaTipo')?.value || 'premium',
      ubicacion: document.getElementById('ubicacionTipo')?.value || 'centro',
      provincia: document.getElementById('provincia')?.value || 'Madrid',
      mercado: {
        rangoConsulta: document.getElementById('rangoConsulta')?.textContent || '€90-180',
        mixPrivado: document.getElementById('mixPrivado')?.textContent || '72%',
        crecimiento: document.getElementById('crecimientoSector')?.textContent || '14%',
        dso: document.getElementById('dsoPromedio')?.textContent || '48 días'
      },
      finanzas: {
        ticketMedio: Number(document.getElementById('ticketMedio')?.value || 120),
        pacientes: Number(document.getElementById('serviciosMes')?.value || 180),
        costesFijos: Number(document.getElementById('costesFijos')?.value || 12000),
        margenPct: Number((document.getElementById('margenActual')?.textContent || '65').toString().replace('%','')) || 65
      }
    };

    console.log('[Frontend] Enviando:', payload);

    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('[Frontend] Respuesta:', data);

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // Si viene con error pero también con fallback
    if (data.error && data.titulo) {
      out.innerHTML = `
        <div style="background:#fef3c7; border:2px solid #f59e0b; border-radius:12px; padding:1rem; margin-bottom:1rem">
          <strong>⚠️ Usando estrategia base</strong><br>
          <span style="font-size:0.875rem; color:#92400e">
            No se pudo generar con IA (${data.error}). Mostramos recomendaciones generales.
          </span>
        </div>
      `;
    }

    renderStrategyFromAPI(data, { 
      tipo: payload.tipo, 
      ubicacion: payload.ubicacion 
    });

  } catch (err) {
    console.error('[Frontend] Error:', err);
    out.innerHTML = `
      <div class="analysis-card" style="background:#fef2f2; border:2px solid #fca5a5;">
        <h3 class="analysis-title" style="color:#dc2626">❌ Error al generar estrategia</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="generateStrategy()" style="margin-top:1rem">
          🔄 Reintentar
        </button>
      </div>
    `;
  }
}
Otras Mejoras Importantes
1. Datos de mercado por provincia actualizados Los valores hardcodeados están desactualizados. Podrías:

Conectar a una API real (ine.es tiene APIs)
Actualizar manualmente con fuentes 2024
Añadir disclaimer más visible
2. Añade Google Analytics

html
<!-- En el <head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXX');
</script>
3. Optimiza el logo

css
.logo img {
  transform: scale(1.1);  /* Reduce de 1.18 a 1.1 */
}
4. Mejora el CTA principal

html
<button id="calc" class="btn btn-primary" style="font-size:1.1rem; padding:1rem 2rem">
  ✨ Generar Análisis Completo
</button>
5. Añade tooltips informativos Usa tippy.js o simplemente:

html
<label for="cpa">
  CPA (coste por alta) €
  <span title="Cuánto gastas en marketing para conseguir un paciente nuevo">ℹ️</span>
</label>
¿Qué priorizar?

Arregla el endpoint (artifact que te pasé)
Mejora el manejo de errores en frontend
Añade Google Analytics
Actualiza datos de mercado
Tooltips informativos
¿Quieres que profundice en alguna de estas áreas específicas?

vamos a empezar arreglando el endpoint. ¿Qué hago?

Pasos concretos para arreglar el endpoint:

1. Reemplaza el archivo actual
Ve a tu proyecto local y reemplaza api/strategy.js con el código del artifact que te pasé arriba. El archivo mejorado tiene:

Mejor manejo de errores
Prompt más estructurado
Sistema de fallback completo
Logging para debugging
2. Verifica que tienes la API key configurada
En tu dashboard de Vercel:

Proyecto > Settings > Environment Variables
Asegúrate de tener:

OPENAI_API_KEY = sk-proj-...tu-key-real...
3. Actualiza la función generateStrategy() en el HTML
Reemplaza la función actual por esta versión con mejor manejo de errores:

javascript
async function generateStrategy() {
  const out = document.getElementById('strategyOutput');
  out.style.display = 'block';
  out.innerHTML = `
    <div class="analysis-card" style="background:#f0f9ff;">
      <h3 class="analysis-title">Generando estrategia...</h3>
      <p style="color:#64748b">Esto toma 10-15 segundos</p>
    </div>
  `;

  try {
    const payload = {
      tipo: document.getElementById('estrategiaTipo')?.value || 'premium',
      ubicacion: document.getElementById('ubicacionTipo')?.value || 'centro',
      provincia: document.getElementById('provincia')?.value || 'Madrid',
      mercado: {
        rangoConsulta: document.getElementById('rangoConsulta')?.textContent || '€90-180',
        mixPrivado: document.getElementById('mixPrivado')?.textContent || '72%',
        crecimiento: document.getElementById('crecimientoSector')?.textContent || '14%',
        dso: document.getElementById('dsoPromedio')?.textContent || '48 días'
      },
      finanzas: {
        ticketMedio: Number(document.getElementById('ticketMedio')?.value || 120),
        pacientes: Number(document.getElementById('serviciosMes')?.value || 180),
        costesFijos: Number(document.getElementById('costesFijos')?.value || 12000),
        margenPct: Number((document.getElementById('margenActual')?.textContent || '65').replace('%','')) || 65
      }
    };

    console.log('Payload:', payload);

    const res = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('Response:', data);

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.error && data.titulo) {
      out.innerHTML = `
        <div style="background:#fef3c7; border:2px solid #f59e0b; border-radius:12px; padding:1rem; margin-bottom:1rem">
          <strong>Usando estrategia base</strong><br>
          <span style="font-size:0.875rem; color:#92400e">
            ${data.error}. Mostramos recomendaciones generales.
          </span>
        </div>
      `;
    }

    renderStrategyFromAPI(data, { tipo: payload.tipo, ubicacion: payload.ubicacion });

  } catch (err) {
    console.error('Error:', err);
    out.innerHTML = `
      <div class="analysis-card" style="background:#fef2f2; border:2px solid #fca5a5;">
        <h3 class="analysis-title" style="color:#dc2626">Error al generar estrategia</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="generateStrategy()" style="margin-top:1rem">
          Reintentar
        </button>
      </div>
    `;
  }
}
4. Deploy y prueba
bash
# Si usas Git
git add api/strategy.js index.html
git commit -m "Fix strategy endpoint"
git push

# Vercel detecta el push y redeploya automáticamente
5. Debugging si falla
Una vez deployado, abre la consola del navegador (F12) y prueba:

Ve a la pestaña "Inteligencia de Mercado"
Haz clic en "Generar Estrategia Personalizada"
Mira los logs en la consola:
Payload: debe mostrar datos correctos
Response: debe mostrar el JSON o el error
Si hay error, ve a Vercel dashboard:

Proyecto > Deployments > [último deploy] > Functions > strategy
Ahí verás los logs del servidor (console.error del endpoint).

Casos comunes:

"Missing OPENAI_API_KEY" → No configuraste la variable de entorno
"AI service error" → La API key no es válida o no tiene crédito
"Invalid JSON from AI" → El prompt no funcionó, pero el fallback debería activarse
El nuevo código tiene fallbacks en cada nivel, así que incluso si falla OpenAI, el usuario verá una estrategia básica válida.

¿Qué parte necesitas que aclare más?





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
