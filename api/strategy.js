// api/strategy.js (CommonJS)
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { tipo, ubicacion, provincia, mercado, finanzas } = req.body || {};

    const systemPrompt =
      'Eres un consultor de growth para clínicas. ' +
      'Devuelve exclusivamente JSON válido (sin explicaciones ni marcadores de código).';

    const userPrompt = JSON.stringify({ tipo, ubicacion, provincia, mercado, finanzas });

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        // Pedimos JSON "oficial"
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content:
              `Genera una estrategia completa y devuelve SOLO JSON con esta forma exacta:
{
 "titulo": string,
 "resumen": string,
 "precioObjetivo": string,
 "presupuestoSugeridoPctIngresos": number,
 "propuestaValor": string[],
 "posicionamiento": string,
 "personas": [
   {"nombre": string, "dolor": string, "motivadores": string}
 ],
 "mixCanales": [
   {"canal": string, "objetivo": string, "presupuestoPct": number, "mensajes": string[]}
 ],
 "plan90dias": [
   {"fase": "0-30", "acciones": string[]},
   {"fase": "31-60", "acciones": string[]},
   {"fase": "61-90", "acciones": string[]}
 ],
 "calendarioContenido": [
   {"mes": string, "ideas": string[]}
 ],
 "kpis": [
   {"nombre": string, "objetivo": string}
 ],
 "riesgos": string[],
 "alianzas": string[],
 "notas": string
}
Contexto:\n${userPrompt}
NO incluyas \`\`\`json ni \`\`\` en la salida; solo el JSON.`,
          },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'OpenAI call failed', detail: t });
    }

    const data = await r.json();
    let content = data?.choices?.[0]?.message?.content ?? '';

    // --- Desenvuelve posibles code fences ```json ... ```
    const unwrapCodeFences = (txt) => {
      let s = (txt || '').trim();
      // quita ```json ... ``` o ``` ... ```
      s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      return s;
    };

    // --- Intenta extraer el primer bloque JSON válido si viene mezclado
    const extractFirstJson = (txt) => {
      const firstBrace = txt.indexOf('{');
      const lastBrace = txt.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
      const slice = txt.slice(firstBrace, lastBrace + 1);
      try { return JSON.parse(slice); } catch { return null; }
    };

    // 1) Intento directo (con unwrapping de fences)
    let parsed;
    try {
      parsed = JSON.parse(unwrapCodeFences(content));
    } catch {
      // 2) Intento de extracción de bloque JSON
      parsed = extractFirstJson(content);
    }

    if (!parsed || typeof parsed !== 'object') {
      return res.status(500).json({
        error: 'Respuesta no parseable como JSON',
        raw: content,
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
};
