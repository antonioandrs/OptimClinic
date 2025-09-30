// api/strategy.js
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    const body = req.body || {};
    const { tipo, ubicacion, provincia, mercado, finanzas } = body;

    const prompt = `
Genera una estrategia para una clínica.
Responde SOLO en JSON con este shape exacto:
{
  "titulo": string,
  "precio": string,
  "canales": string[],
  "prioridad": string
}

Contexto:
- Tipo: ${tipo || ""}
- Ubicación: ${ubicacion || ""}
- Provincia: ${provincia || ""}
- Datos de mercado: ${JSON.stringify(mercado || {})}
- Datos financieros: ${JSON.stringify(finanzas || {})}
`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("OpenAI error:", r.status, errText);
      res.status(500).json({ error: "OpenAI call failed", detail: errText });
      return;
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const json = JSON.parse(text);
    res.status(200).json(json);
  } catch (err) {
    console.error("Strategy API error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};
