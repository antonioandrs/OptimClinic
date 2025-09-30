// api/strategy.js
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    const { tipo, ubicacion, provincia, mercado, finanzas } = req.body || {};
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Esquema objetivo (ayuda al modelo y a tu UI)
    const EXPECTED_JSON = {
      titulo: "Estrategia de posicionamiento premium para clínica en Alicante",
      resumen: "Párrafo corto con el enfoque general (2-3 frases).",
      precioObjetivo: "€110-130 por consulta",
      propuestaValor: [
        "Sin listas de espera",
        "Atención en <48h",
        "Equipo con X años de experiencia"
      ],
      personas: [
        { nombre: "Paciente privado 30-45", dolor: "listas de espera", motivadores: "rapidez y trato cercano" }
      ],
      posicionamiento: "Frase de posicionamiento (1 frase clara y memorable).",
      mixCanales: [
        {
          canal: "SEO local",
          objetivo: "citas privadas",
          presupuestoPct: 25,
          mensajes: ["consultas sin esperas", "resultados medibles"]
        }
      ],
      plan90dias: [
        { fase: "0-30", acciones: ["Auditoría web y analítica", "Perfil GMB y NAP", "Landing privada", "Embudo captación", "Ubersuggest/GA4 configurado"] },
        { fase: "31-60", acciones: ["SEO local (citaciones)", "Campañas Search: marca + genéricas", "Email onboarding", "Scripts recepción", "Cuadro de mando KPIs"] },
        { fase: "61-90", acciones: ["Social ads + remarketing", "Colab. influencers locales", "Programas de referidos", "AB test precios/bonos", "Informe 90d e iteración"] }
      ],
      calendarioContenido: [
        { mes: "Mes 1", ideas: ["3 posts blog (dolores frecuentes)", "10 piezas social educativas", "1 webinar gratuito"] },
        { mes: "Mes 2", ideas: ["3 posts blog (comparativas)", "UGC pacientes (consentimiento)", "Boletín mensual"] }
      ],
      kpis: [
        { nombre: "Citas privadas / mes", objetivo: ">= 120" },
        { nombre: "CPA", objetivo: "<= €40" },
        { nombre: "Utilización agenda", objetivo: ">= 80%" }
      ],
      riesgos: ["Dependencia de aseguradoras", "Capacidad limitada / cuellos de botella"],
      alianzas: ["Mutuas locales", "Gimnasios premium", "Empresas (cheque salud)"],
      presupuestoSugeridoPctIngresos: 6,
      notas: "Recordatorios accionables finales."
    };

    const prompt = `
Eres consultor/a de estrategia para clínicas privadas en España. Genera un plan accionable y
MUY completo a partir del contexto que te paso. Devuelve SIEMPRE JSON VÁLIDO que respete EXACTAMENTE
el siguiente esquema (usa los mismos nombres de clave y tipos): ${JSON.stringify(EXPECTED_JSON)}.

CONTEXT0
- Provincia: ${provincia}
- Tipo: ${tipo}
- Ubicación: ${ubicacion}
- Mercado (IDIS/otros): rangoConsulta=${mercado?.rangoConsulta}, mixPrivado=${mercado?.mixPrivado}, crecimiento=${mercado?.crecimiento}, dso=${mercado?.dso}
- Finanzas: ticket=${finanzas?.ticketMedio}, pacientes=${finanzas?.pacientes}, fijos=${finanzas?.costesFijos}, margen=${finanzas?.margenPct}

REQUISITOS:
- Adapta precios y mensajes al contexto provincial y al enfoque "${tipo}" en "${ubicacion}".
- Sé CONCRETO: listas con 4–7 puntos útiles; evita vaguedades.
- "mixCanales.presupuestoPct" debe sumar ~100.
- Estima "presupuestoSugeridoPctIngresos" (5–8% por defecto, ajusta por mixPrivado y crecimiento).
- "plan90dias" debe tener 5–8 acciones por fase (0-30, 31-60, 61-90).
- "calendarioContenido" con ideas accionables cada mes.
- Nada de texto fuera del JSON.
`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",       // si quieres abaratar: "gpt-4o-mini"
      temperature: 0.7,
      max_output_tokens: 2500,     // subimos para permitir respuesta larga
      input: prompt
    });

    const text = resp.output_text;
    const data = JSON.parse(text); // el prompt obliga a JSON puro
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "OpenAI call failed", detail: String(err?.message || err) });
  }
}
