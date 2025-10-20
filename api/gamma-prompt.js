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

  // Helpers
  const fEUR = (n) => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(n ?? 0);
  const pct1 = (x) => (x==null ? "–" : `${(x*100).toFixed(1)}%`);
  const safe = (s) => (s ?? "").toString().trim();
  const round = (x) => Math.round((x ?? 0));

  // IA autogenerada si el usuario no pulsó "Analizar con IA"
  function iaFromLastData(d){
    const beMes   = d.mesBE ?? d.breakEvenMonth ?? null;           // <— ajusta si tu key es distinta
    const beHit   = Number.isFinite(beMes);
    const roi     = d.roiFinal ?? d.roi ?? null;
    const tir     = d.tirAnual ?? d.tir ?? null;
    const van     = d.van ?? d.npv ?? null;
    const cajaMax = d.necesidadMaxCaja ?? d.cashNeedMax ?? null;
    const mesTenso= d.mesMasTenso ?? d.worstMonth ?? null;

    const resumenBE   = beHit ? `Se alcanza el punto de equilibrio en el mes ${beMes}.`
                              : `No se alcanza el punto de equilibrio (break-even) en el horizonte modelado.`;
    const resumenROI  = roi!=null ? `ROI proyectado: ${pct1(roi)}${roi<0?' (bajo)':''}.` : "";
    const resumenTIR  = tir!=null ? `TIR anual estimada: ${pct1(tir)}${tir<0?' (negativa)':''}.` : "";
    const resumenVAN  = van!=null ? `VAN (valor actual neto): ${fEUR(van)}.` : "";
    const resumenCaja = cajaMax!=null ? `Necesidad máxima de caja: ${fEUR(cajaMax)}${mesTenso?` (momento más tenso: ${mesTenso}).`:''}` : "";

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
      recomendaciones_financieras: "- Revisar tarifas en líneas premium\n- Optimizar agenda en horas pico\n- Ajustar compras a rotación\n- KPI semanales por profesional",
      resumen_visual: "Usar tarta de costes y barra de margen medio para lectura rápida."
    };
  }

  function buildPromptFromLastData(){
    if (!window.lastData) {
      alert('Primero pulsa "📊 Generar Análisis Completo" en Planificación Financiera.');
      return "";
    }
    const d = window.lastData;

    // Series mensuales (redondeadas para evitar decimales raros)
    const ingresosMes_JSON = JSON.stringify((d.ingresos || []).map(round));
    const costesMes_JSON   = JSON.stringify((d.cVariables||[]).map((v,i)=> round(v + (d.cfMensual?.[i]||0))));
    const margenMes_JSON   = JSON.stringify((d.ebitda || []).map(round));

    // IA (si no hay window.ANALISIS_FIN_IA, autogenera a partir de lastData)
    const ia = window.ANALISIS_FIN_IA || iaFromLastData(d);

    // Agregados
    const ingresosTotales = (d.ingresos||[]).reduce((a,b)=>a+b,0);
    const costesTotales   = (d.cVariables||[]).reduce((a,b)=>a+b,0) + (d.cfMensual||[]).reduce((a,b)=>a+b,0);
    const margenTotal     = ingresosTotales - costesTotales;
    const margenPct       = ingresosTotales>0 ? (margenTotal/ingresosTotales) : 0;

    // ROI / TIR / VAN si están en lastData
    const roiFinal  = d.roiFinal ?? d.roi ?? null;
    const tirAnual  = d.tirAnual ?? d.tir ?? null;
    const van       = d.van ?? d.npv ?? null;

    // Sensibilidades (si existen)
    const sens = {
      precio_up5:  window.OPTICLINIC_FIN?.sens?.precio_up5  ?? null,
      precio_dn5:  window.OPTICLINIC_FIN?.sens?.precio_dn5  ?? null,
      occ_up10:    window.OPTICLINIC_FIN?.sens?.occ_up10    ?? null,
      occ_dn10:    window.OPTICLINIC_FIN?.sens?.occ_dn10    ?? null
    };

    // Escenarios (desde window.OPTICLINIC_FIN.escenarios o lastData.escenarios)
    const esc   = window.OPTICLINIC_FIN?.escenarios || d.escenarios || {};
    const escBP = esc.base && esc.base.ingresos>0 ? esc.base.margen/esc.base.ingresos : null;
    const escOP = esc.opt  && esc.opt.ingresos>0  ? esc.opt.margen/esc.opt.ingresos   : null;
    const escPP = esc.pes  && esc.pes.ingresos>0  ? esc.pes.margen/esc.pes.ingresos   : null;

    // Otros inputs visibles
    const clinica       = document.getElementById("empresaNombre")?.value || "Clínica Ejemplo";
    const ticketMedio   = Number(document.getElementById("ticketMedio")?.value || 0);
    const costeVariable = Number(document.getElementById("costeVariable")?.value || 0);
    const costeFijo     = Number(document.getElementById("costesFijos")?.value || 0);
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
Formato deseado: Presentación 16:9, estilo consultoría (titulares claros + tablas + bullets).
No inventes datos. No insertes enlaces externos ni créditos en el contenido.
Usa euros con formato es-ES (ej.: 1.113.900 €). Para porcentajes usa 1 decimal (ej.: 31,9%).
No uses el símbolo $ en ningún caso.

---
# Resumen ejecutivo (para directivos)
${safe(ia.resumen_general)}

Puntos clave:
- Ingresos: ${fEUR(ingresosTotales)} | Costes: ${fEUR(costesTotales)} | Margen: ${fEUR(margenTotal)} (${pct1(margenPct)})
- Ticket medio: ${fEUR(ticketMedio)} | Módulos: —
- Comentario crítico: —
- ROI proyectado: ${roiFinal!=null ? ( (roiFinal*100).toFixed(1)+'%' ) : '—'} | TIR anual: ${tirAnual!=null ? ( (tirAnual*100).toFixed(1)+'%' ) : '—'} | VAN: ${van!=null ? fEUR(van) : '—'}

---
# Contexto y objetivos
${safe(ia.contexto)}
Objetivo: ofrecer una visión clara del rendimiento económico, riesgos y oportunidades de mejora; y recomendaciones accionables.

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
| Base      | ${esc.base?.ingresos!=null ? fEUR(esc.base.ingresos) : "—"} | ${esc.base?.costes!=null ? fEUR(esc.base.costes) : "—"} | ${esc.base?.margen!=null ? fEUR(esc.base.margen) : "—"} | ${esc.base ? pct1(escBP) : "—"} | ${safe(ia.escenario_base)} |
| Optimista | ${esc.opt?.ingresos!=null ? fEUR(esc.opt.ingresos)   : "—"} | ${esc.opt?.costes!=null ? fEUR(esc.opt.costes)   : "—"} | ${esc.opt?.margen!=null ? fEUR(esc.opt.margen)   : "—"} | ${esc.opt  ? pct1(escOP) : "—"} | ${safe(ia.escenario_opt)}  |
| Pesimista | ${esc.pes?.ingresos!=null ? fEUR(esc.pes.ingresos)   : "—"} | ${esc.pes?.costes!=null ? fEUR(esc.pes.costes)   : "—"} | ${esc.pes?.margen!=null ? fEUR(esc.pes.margen)   : "—"} | ${esc.pes  ? pct1(escPP) : "—"} | ${safe(ia.escenario_pes)}  |

---
# Sensibilidades (precio y ocupación)
Instrucciones de gráfico: barras con 4 columnas (Precio +5%, Precio −5%, Ocupación +10%, Ocupación −10%).
• Muestra la cifra de margen (en €) encima de cada barra. Formato es-ES.
Resultados:
- +5% precio ⇒ margen: ${sens.precio_up5!=null ? fEUR(sens.precio_up5) : "–"}
- −5% precio ⇒ margen: ${sens.precio_dn5!=null ? fEUR(sens.precio_dn5) : "–"}
- +10% ocupación ⇒ margen: ${sens.occ_up10!=null ? fEUR(sens.occ_up10) : "–"}
- −10% ocupación ⇒ margen: ${sens.occ_dn10!=null ? fEUR(sens.occ_dn10) : "–"}
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
• Periodo real: Ene–Ago. Proyección Sep–Dic con media Ene–Jun (excluye Jul/Ago).  
• Precios, ocupación y mix según configuración actual en OptiClinic.  
• Impuestos, deuda y pagos incluidos cuando procede.  
• Sin imágenes externas ni datos no verificados.

---
# Riesgos y límites del modelo
• Elasticidad precio y sensibilidad de demanda pueden variar por servicio.  
• No-shows y estacionalidad pueden alterar ocupación real.  
• Cambios en costes fijos/variables y proveedores.  
• Revisar mensualmente KPIs para recalibrar supuestos.
`.trim();
  }

  // Eventos UI
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
