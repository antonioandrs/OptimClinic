// api/strategy.js
// CommonJS (compatible Vercel). Usa tu OPENAI_API_KEY desde Vercel > Settings > Environment Variables
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Use POST' });
  }

  try {
    const { tipo, ubicacion, provincia, mercado, finanzas } = req.body || {};

    // Construimos el prompt con los datos que envía el front
    const prompt = `
Eres un consultor de estrategia sanitaria. Genera una estrategia breve y accionable para una clínica.

Contexto:
- Enfoque: ${tipo}
- Ubicación: ${ubicacion}
- Provincia: ${provincia}
- Mercado (IDIS): rangoConsulta=${mercado?.rangoConsulta}, mixPrivado=${mercado?.mixPrivado}, crecimiento=${mercado?.crecimiento}, dso=${mercado?.dso}
- Finanzas: ticketMedio=${finanzas?.ticketMedio}, pacientesIniciales=${finanzas?.pacientes}, costesFijos=${finanzas?.costesFijos}, margenActualPct=${finanzas?.margenPct}

Devuélveme JSON con esta forma:
{
  "titulo": "…",
  "precio": "…",
  "canales": ["…","…"],
  "prioridad": "…",
  "bullets": ["…","…"],
  "rationale": "…"
}
    `.trim();

    // Llamada a OpenAI (o tu LLM). Aquí un ejemplo con la API "Responses" moderna:
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });
    }

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          { role: 'system', content: 'Responde únicamente con JSON válido. Sin comentarios ni texto fuera del JSON.' },
          { role: 'user', content: prompt }
        ],
        max_output_tokens: 600
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(500).json({ error: 'OpenAI error', details: txt });
    }

    const data = await resp.json();

    // La respuesta llega en data.output_text (modelos "Responses") o en data.choices[0].message.content (modelos chat)
    let raw = data.output_text || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';

    // Intenta parsear JSON
    let parsed;
    try { parsed = JSON.parse(raw); } catch(e) {
      // si el modelo devolvió con saltos/markdown, limpialo un poco
      raw = raw.replace(/^```json|```$/g, '').trim();
      parsed = JSON.parse(raw);
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: String(err && err.message || err) });
  }
};
