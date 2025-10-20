/* ======= Gamma (manual): construir prompt desde lastData + IA ======= */
document.addEventListener("DOMContentLoaded", () => {
  // UI
  const btnOpen = document.getElementById("btnDossierFin");
  const modal   = document.getElementById("modalPrompt");
  const ta      = document.getElementById("taPrompt");
  const btnCopy = document.getElementById("btnCopy");
  const btnDl   = document.getElementById("btnDownload");
  const btnClose= document.getElementById("btnClose");
  if (!btnOpen || !modal || !ta) return;

  // ---------- Helpers ----------
  const fEUR = (n) => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(Number.isFinite(n)?n:0);
  // % “smart”: si ya viene en % (abs>1.5), no multiplicar x100
  const pct1 = (x) => {
    if (x==null || isNaN(x)) return "–";
    const v = Math.abs(x) > 1.5 ? x : x*100;
    return `${v.toFixed(1)}%`;
  };
  const safe  = (s) => (s ?? "").toString().trim();
  const round = (x) => Math.round((x ?? 0));

  // === BRANDING (ajustable)
  const BRAND = {
    primary: "#2563eb",
    accent:  "#0891b2",
    font:    "Inter, ui-sans-serif, system-ui",
    logoUrl: "https://i.imgur.com/eRKd3Hp.jpeg"
  };

  // Buscar texto de una tarjeta por su título visible
  function scrapeSectionByHeading(headingText){
    const all = Array.from(document.querySelectorAll("h3,h2,h4"));
    const h = all.find(el => el.textContent.trim().toLowerCase().includes(headingText.toLowerCase()));
    if (!h) return "";
    const card = h.closest(".card, .analysis-card, section, div") || h.parentElement;
    const clone = card.cloneNode(true);
    clone.querySelectorAll("button, input, select, textarea").forEach(n=>n.remove());
    return clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
  }

  // IA/narrativa a partir de lastData y de la propia UI
  // === Reemplaza TODO este bloque en tu archivo ===
function buildIAFromData(d){
  const fEUR = (n) => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(Number.isFinite(n)?n:0);
  const pct1 = (x) => {
    if (x==null || isNaN(x)) return "–";
    const v = Math.abs(x) > 1.5 ? x : x*100;
    return `${v.toFixed(1)}%`;
  };
  const safe  = (s) => (s ?? "").toString().trim();

  // 1) Detección robusta del BE (desde datos, UI o heurística)
  function detectBEMonth(){
    const candidates = [
      d.mesBE, d.breakEvenMonth, d.break_even_month, d.beMes, d.breakEvenMes,
      d.breakEven?.mes, d.breakEven?.month, d.kpis?.breakEvenMes, d.kpis?.beMes
    ];
    for (const v of candidates) {
      if (v==null) continue;
      if (typeof v === "number" && isFinite(v)) return { hit: true, mes: v };
      if (typeof v === "string") {
        // “Mes 8 / 12”, “8/12”, “mes 8”, etc.
        let m = v.match(/mes\s*(\d{1,2})/i) || v.match(/(\d{1,2})\s*\/\s*\d{1,2}/);
        if (!m) m = v.match(/\b(\d{1,2})\b/);
        if (m) return { hit: true, mes: Number(m[1]) };
        if (/no\s+alcanzad/i.test(v)) return { hit: false, mes: null };
      }
    }
    // Leer de la UI (“Break-even”, “Mes 8 / 12”, “No alcanzado”)
    const node = Array.from(document.querySelectorAll("*"))
      .find(el => /break-?even/i.test(el.textContent || ""));
    if (node) {
      const txt = (node.closest(".card,div,section")?.innerText || node.textContent || "").trim();
      const m1 = txt.match(/Mes\s*(\d{1,2})/i) || txt.match(/(\d{1,2})\s*\/\s*\d{1,2}/);
      if (m1) return { hit: true, mes: Number(m1[1]) };
      if (/No\s+alcanzad/i.test(txt)) return { hit: false, mes: null };
    }
    // Heurística: si ROI o VAN positivos, estimar por acumulado del margen (EBITDA)
    const roi = d.roiFinal ?? d.roi;
    const van = d.van ?? d.npv;
    if ((roi!=null && roi>0) || (van!=null && van>0)) {
      const serie = (d.ebitda || []).map(x => +x || 0);
      let acc = 0;
      for (let i=0;i<serie.length;i++){ acc += serie[i]; if (acc >= 0) return { hit:true, mes:i+1 }; }
      if (serie.length) return { hit:true, mes: serie.length };
    }
    return { hit:false, mes:null };
  }

  const { hit: beHit, mes: beMes } = detectBEMonth();

  // Señales numéricas
  const roi     = d.roiFinal ?? d.roi ?? null;
  const tir     = d.tirAnual ?? d.tir ?? null;
  const van     = d.van ?? d.npv ?? null;
  const cajaMax = d.necesidadMaxCaja ?? d.cashNeedMax ?? null;
  const mesTenso= d.mesMasTenso ?? d.worstMonth ?? null;

  // Narrativa consistente con la detección de BE
  const resumenBE   = beHit
    ? `Se alcanza el punto de equilibrio en el mes ${beMes}.`
    : `No se alcanza el punto de equilibrio (break-even) en el horizonte modelado.`;

  const resumenROI  = roi!=null ? `ROI proyectado: ${pct1(roi)}${roi<0?' (bajo)':''}.` : "";
  const resumenTIR  = tir!=null ? `TIR anual estimada: ${pct1(tir)}${tir<0?' (negativa)':''}.` : "";
  const resumenVAN  = van!=null ? `VAN (valor actual neto): ${fEUR(van)}.` : "";
  const resumenCaja = cajaMax!=null ? `Necesidad máxima de caja: ${fEUR(cajaMax)}${mesTenso?` (momento más tenso: ${mesTenso}).`:''}` : "";

  // Extraer textos útiles de tu UI (si existen)
  const recsUI = (function(){
    const all = Array.from(document.querySelectorAll("h2,h3,h4"));
    const h = all.find(el => /recomendaciones/i.test(el.textContent));
    if (!h) return "";
    const card = h.closest(".card, .analysis-card, section, div") || h.parentElement;
    const clone = card.cloneNode(true);
    clone.querySelectorAll("button,input,select,textarea").forEach(n=>n.remove());
    return clone.innerText.replace(/\n{3,}/g,"\n\n").trim();
  })();

  const guiaUI = (function(){
    const all = Array.from(document.querySelectorAll("h2,h3,h4"));
    const h = all.find(el => /Guía\s*para\s*no\s*financieros/i.test(el.textContent));
    if (!h) return "";
    const card = h.closest(".card, .analysis-card, section, div") || h.parentElement;
    const clone = card.cloneNode(true);
    clone.querySelectorAll("button,input,select,textarea").forEach(n=>n.remove());
    return clone.innerText.replace(/\n{3,}/g,"\n\n").trim();
  })();

  return {
    resumen_general: [resumenBE, resumenROI, resumenTIR, resumenVAN, resumenCaja].filter(Boolean).join(" "),
    contexto: "Se analizan datos reales y proyecciones configuradas en Planificación Financiera.",
    ingresos: "Impulsados por volumen y ticket medio.",
    costes: "Fijos + variables; vigilar consumibles y horas.",
    margen: "Condicionado por precio efectivo y coste variable.",
    ticket: "Derivado del mix de servicios y aseguradoras.",
    tendencias_mensuales: "Estacionalidad visible en las series mensuales.",
    punto_equilibrio: resumenBE,
    escenario_base: "Mantener disciplina de costes y ocupación estable.",
    escenario_opt: "Upside con +precio/+ocupación y mejor mix.",
    escenario_pes: "Plan defensivo si cae demanda o suben fijos.",
    sensibilidades: "Precio y ocupación son las palancas de mayor impacto.",
    equipo_medico: "Top 3 concentran la mayor parte del margen.",
    recomendaciones_financieras: safe(recsUI) || "- Revisar tarifas (premiumización)\n- Optimizar agenda en horas pico\n- Ajustar compras a rotación\n- KPI semanales por profesional",
    resumen_visual: "Usar tarta de costes y barra de margen medio para lectura rápida.",
    guia_no_financieros: safe(guiaUI) || `• Break-even: cobros = pagos.\n• ROI: retorno sobre inversión.\n• VAN: valor hoy de flujos futuros.\n• TIR: “interés” anual equivalente.\n• EBITDA: resultado operativo antes de amortizaciones e intereses.`
  };
}


  // Escenarios si no existen (Base = real; Opt/Pes ±10% ingresos, ±2% costes fijos)
  function ensureScenarios(d){
    const esc = (window.OPTICLINIC_FIN?.escenarios || d.escenarios || {});
    if (esc.base && esc.opt && esc.pes) return esc;

    const ingresos = (d.ingresos||[]).reduce((a,b)=>a+b,0);
    const cVar     = (d.cVariables||[]).reduce((a,b)=>a+b,0);
    const cFijos   = (d.cfMensual||[]).reduce((a,b)=>a+b,0);
    const costes   = cVar + cFijos;
    const margen   = ingresos - costes;
    const mPct     = ingresos>0 ? margen/ingresos : 0;

    const make = (ingFactor, fixedFactor) => {
      const ing = ingresos * ingFactor;
      const cst = (cVar * ingFactor) + (cFijos * fixedFactor);
      const mar = ing - cst;
      return { ingresos: ing, costes: cst, margen: mar, margenPct: ing>0 ? mar/ing : 0 };
    };

    return {
      base: { ingresos, costes, margen, margenPct: mPct },
      opt:  make(1.10, 1.02),
      pes:  make(0.90, 0.98)
    };
  }

  // Sensibilidades si no existen (Precio ±5% afecta ingresos; Ocupación ±10% afecta ingresos y variables)
  function ensureSens(d){
    const sens = (window.OPTICLINIC_FIN?.sens || {});
    if (sens.precio_up5!=null && sens.precio_dn5!=null && sens.occ_up10!=null && sens.occ_dn10!=null) return sens;

    const ingresos = (d.ingresos||[]).reduce((a,b)=>a+b,0);
    const cVar     = (d.cVariables||[]).reduce((a,b)=>a+b,0);
    const cFijos   = (d.cfMensual||[]).reduce((a,b)=>a+b,0);

    const precio = (f) => (ingresos*f) - (cVar + cFijos);
    const occ    = (f) => (ingresos*f) - (cVar*f + cFijos);

    return {
      precio_up5: precio(1.05),
      precio_dn5: precio(0.95),
      occ_up10:   occ(1.10),
      occ_dn10:   occ(0.90)
    };
  }

  function buildPromptFromLastData(){
    if (!window.lastData) {
      alert('Primero pulsa "📊 Generar Análisis Completo" en Planificación Financiera.');
      return "";
    }
    const d = window.lastData;

    // Series mensuales (redondeadas)
    const ingresosMes_JSON = JSON.stringify((d.ingresos || []).map(round));
    const costesMes_JSON   = JSON.stringify((d.cVariables||[]).map((v,i)=> round(v + (d.cfMensual?.[i]||0))));
    const margenMes_JSON   = JSON.stringify((d.ebitda || []).map(round));

    // IA (si no hay window.ANALISIS_FIN_IA, autogenera desde UI y datos)
    const ia = window.ANALISIS_FIN_IA || buildIAFromData(d);

    // Agregados
    const ingresosTotales = (d.ingresos||[]).reduce((a,b)=>a+b,0);
    const costesTotales   = (d.cVariables||[]).reduce((a,b)=>a+b,0) + (d.cfMensual||[]).reduce((a,b)=>a+b,0);
    const margenTotal     = ingresosTotales - costesTotales;
    const margenPct       = ingresosTotales>0 ? (margenTotal/ingresosTotales) : 0;

    // ROI / TIR / VAN si están en lastData
    const roiFinal  = d.roiFinal ?? d.roi ?? null;
    const tirAnual  = d.tirAnual ?? d.tir ?? null;
    const van       = d.van ?? d.npv ?? null;

    // Escenarios y sensibilidades (auto si faltan)
    const esc = ensureScenarios(d);
    const sens = ensureSens(d);

    // Inputs de UI
    const clinica       = document.getElementById("empresaNombre")?.value || "Clínica Ejemplo";
    const ticketMedio   = Number(document.getElementById("ticketMedio")?.value || 0);
    const costeVariable = Number(document.getElementById("costeVariable")?.value || 0);
    const costeFijo     = Number(document.getElementById("costesFijos")?.value || 0);
    const mesesModelados= d.mesesProyeccion || d.horizonte || (d.ingresos?.length || "—");
    const mesInicialUI  = document.getElementById("mesInicial")?.value || "configurado en la app";
    const now = new Date().toLocaleDateString("es-ES");

    // Tabla por médico (si existe)
    const topMedicos = Array.isArray(window.OPTICLINIC_FIN?.topMedicos) ? window.OPTICLINIC_FIN.topMedicos : [];
    const tabla_medicos = topMedicos.map(m =>
      `| ${safe(m.nombre)} | ${m.modulos??0} | ${fEUR(m.ticket??0)} | ${fEUR(m.margen??0)} | ${safe(m.insight)||"-"} |`
    ).join("\n") || "| – | – | – | – | – |";

    return `
# OptiClinic – Informe Financiero Integral
Cliente: ${clinica}
Fecha: ${now}
Idioma: Español (es-ES)
Formato: Presentación 16:9, estilo consultoría (titulares claros → 1 idea por slide, tablas legibles, bullets cortos).
No inventes datos. No insertes enlaces externos ni créditos en el contenido.
Usa euros con formato es-ES (ej.: 1.113.900 €). Para porcentajes usa 1 decimal (ej.: 31,9%). No uses $.

Branding:
• Primario ${BRAND.primary}, acento ${BRAND.accent}, tipografía ${BRAND.font}.
• Fondo blanco, iconografía sencilla, alto contraste para legibilidad.
• Coloca el logo corporativo en la esquina superior derecha de la portada (logo: ${BRAND.logoUrl}).

---
# Resumen ejecutivo (para directivos)
${safe(ia.resumen_general)}

Puntos clave:
- Ingresos: ${fEUR(ingresosTotales)} | Costes: ${fEUR(costesTotales)} | Margen: ${fEUR(margenTotal)} (${pct1(margenPct)})
- Ticket medio: ${fEUR(ticketMedio)} | Módulos: —
- Comentario crítico: —
- ROI proyectado: ${roiFinal!=null ? pct1(roiFinal) : '—'} | TIR anual: ${tirAnual!=null ? pct1(tirAnual) : '—'} | VAN: ${van!=null ? fEUR(van) : '—'}

---
# Contexto y objetivos
${safe(ia.contexto)}
Objetivo: ofrecer una visión clara del rendimiento económico, riesgos y oportunidades de mejora; y recomendaciones accionables.

---
# Guía para no financieros
${safe(ia.guia_no_financieros)}

---
# KPIs principales
| Indicador | Valor | Insight |
|---|---:|---|
| Ingresos Totales | ${fEUR(ingresosTotales)} | ${safe(ia.ingresos)} |
| Costes Totales   | ${fEUR(costesTotales)}   | ${safe(ia.costes)}   |
| Margen Neto      | ${fEUR(margenTotal)} (${pct1(margenPct)}) | ${safe(ia.margen)} |
| Ticket Medio     | ${fEUR(ticketMedio)}     | ${safe(ia.ticket)}   |

---
# Evolución mensual
Instrucciones de gráfico: línea con 3 series (Ingresos, Costes, Margen/EBITDA).
• Ejes y tooltips en euros (es-ES).  
• Etiqueta puntos Mes 1, 6, 12, 18, 24 y marca el mes de BE con anotación.
**Ingresos (mensual)**: ${ingresosMes_JSON}
**Costes (mensual)**: ${costesMes_JSON}
**Margen (mensual)**: ${margenMes_JSON}
Notas: ${safe(ia.tendencias_mensuales)}

---
# Punto de equilibrio (Break-even)
- Coste fijo mensual: ${fEUR(costeFijo)}
- Margen contribución medio: ${fEUR(ticketMedio - costeVariable)}
- Consultas necesarias para cubrir costes: ${d.pacientesMinimos ?? "–"}
Comentario: ${safe(ia.punto_equilibrio)}

---
# Escenarios (Base / Optimista / Pesimista)
| Escenario | Ingresos | Costes | Margen | % Margen | Nota |
|---|---:|---:|---:|---:|---|
| Base      | ${fEUR(esc.base.ingresos)} | ${fEUR(esc.base.costes)} | ${fEUR(esc.base.margen)} | ${pct1(esc.base.margenPct)} | ${safe(ia.escenario_base)} |
| Optimista | ${fEUR(esc.opt.ingresos)}  | ${fEUR(esc.opt.costes)}  | ${fEUR(esc.opt.margen)}  | ${pct1(esc.opt.margenPct)}  | ${safe(ia.escenario_opt)}  |
| Pesimista | ${fEUR(esc.pes.ingresos)}  | ${fEUR(esc.pes.costes)}  | ${fEUR(esc.pes.margen)}  | ${pct1(esc.pes.margenPct)}  | ${safe(ia.escenario_pes)}  |

---
# Sensibilidades (precio y ocupación)
Instrucciones de gráfico: barras con 4 columnas (Precio +5%, Precio −5%, Ocupación +10%, Ocupación −10%).
• Muestra la cifra de margen (en €) encima de cada barra. Formato es-ES.
Resultados:
- +5% precio ⇒ margen: ${fEUR(esc.base.margen + (ensureSens(d).precio_up5 - ( (d.ingresos||[]).reduce((a,b)=>a+b,0) - ((d.cVariables||[]).reduce((a,b)=>a+b,0) + (d.cfMensual||[]).reduce((a,b)=>a+b,0)) )))} 
- −5% precio ⇒ margen: ${fEUR(ensureSens(d).precio_dn5)}
- +10% ocupación ⇒ margen: ${fEUR(ensureSens(d).occ_up10)}
- −10% ocupación ⇒ margen: ${fEUR(ensureSens(d).occ_dn10)}
Insight: ${safe(ia.sensibilidades)}

---
# Rendimiento por profesional (Top 5)
| Médico | Módulos | Ticket Medio | Margen | Insight |
|---|---:|---:|---:|---|
${tabla_medicos}

Comentario: ${safe(ia.equipo_medico)}

---
# Recomendaciones financieras
${safe(ia.recomendaciones_financieras)}

---
# Resumen visual
Instrucciones de gráfico: tarta de estructura de costes + barra de margen medio.  
Notas: ${safe(ia.resumen_visual)}

---
# Metodología y supuestos
• Horizonte modelado: ${mesesModelados} meses (mes inicial: ${mesInicialUI}).  
• Supuestos de precio, ocupación y mix: según configuración actual en OptiClinic.  
• Los cálculos usan los datos y parámetros visibles en la app; no se incluyen fuentes externas.  
• Revisión mensual de KPIs recomendada para recalibrar supuestos.

---
# Riesgos y límites del modelo
• Elasticidad precio y sensibilidad de demanda pueden variar por servicio.  
• No-shows y estacionalidad pueden alterar ocupación real.  
• Cambios en costes fijos/variables y proveedores.  
• Revisar mensualmente KPIs para recalibrar supuestos.
`.trim();
  }

  // ---------- Eventos UI ----------
  btnOpen.addEventListener("click", () => {
    const prompt = buildPromptFromLastData();
    if (!prompt) return;
    ta.value = prompt;
    modal.style.display = "block";
  });

  btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      btnCopy.textContent = "¡Copiado!";
      setTimeout(()=> btnCopy.textContent = "Copiar", 1200);
    } catch {
      ta.select(); document.execCommand("copy");
    }
  });

  btnDl.addEventListener("click", () => {
    const blob = new Blob([ta.value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "OptiClinic_Informe_Financiero.md";
    a.click(); URL.revokeObjectURL(url);
  });

  btnClose.addEventListener("click", () => modal.style.display = "none");
});
