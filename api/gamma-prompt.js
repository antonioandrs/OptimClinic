/* ======= Gamma (manual): construir prompt desde lastData + IA ======= */
document.addEventListener("DOMContentLoaded", () => {
  const btnOpen = document.getElementById('btnDossierFin');
  const modal   = document.getElementById('modalPrompt');
  const ta      = document.getElementById('taPrompt');
  const btnCopy = document.getElementById('btnCopy');
  const btnDl   = document.getElementById('btnDownload');
  const btnClose= document.getElementById('btnClose');

  if (!btnOpen) return;

  const fEUR = (n) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n||0);
  const pct  = (x) => (x==null?'–':`${(x*100).toFixed(1)}%`);
  const safe = (s) => (s??'').toString().trim();

  function iaFromLastData(d){
    try {
      const lineaBE  = (typeof textoBreakeven === 'function') ? textoBreakeven(d) : '';
      const lineaROI = (typeof textoROI === 'function') ? textoROI(d) : '';
      const lineaNPV = (typeof textoNPV === 'function') ? textoNPV(d) : '';
      const lineaIRR = (typeof textoIRR === 'function') ? textoIRR(d) : '';
      const pal = (typeof topPalancas === 'function') ? topPalancas(d) : { lista:'', recs:'' };

      return {
        resumen_general: `${lineaBE} ${lineaROI} ${lineaIRR} ${lineaNPV}`.trim(),
        contexto: "Se analizan proyecciones con los parámetros configurados en la pestaña Planificación Financiera.",
        ingresos: "Ingresos impulsados por volumen, ticket efectivo y mix privado/aseguradora.",
        costes: "Estructura de costes fijos + variables; vigilar consumo por paciente.",
        margen: "Márgenes condicionados por precio efectivo y coste variable.",
        ticket: "Ticket medio calculado por mix Privado/Aseguradora.",
        tendencias_mensuales: "Ver gráfico de P&L operativo y flujo de caja para estacionalidad.",
        punto_equilibrio: "Break-even derivado de cobros menos pagos incluyendo deuda e impuestos si aplica.",
        escenario_base: "Mantener esfuerzo comercial y disciplina de costes.",
        escenario_opt: "Upside con mejor conversión/ocupación y ligera subida de precio.",
        escenario_pes: "Riesgo si empeora demanda o suben fijos; preparar plan defensivo.",
        sensibilidades: "Precio y pacientes suelen ser las palancas con mayor impacto en ROI.",
        equipo_medico: "Priorizar productividad y upskilling del equipo.",
        recomendaciones_financieras: (pal.recs || '').replace(/<\/?ul>|<\/?li>/g,'').trim() || "- Revisar tarifas\n- Optimizar capacidad\n- Ajustar estructura de costes",
        resumen_visual: "Gráficos sugeridos: evolución mensual, tarta de costes y barra de margen."
      };
    } catch(_){
      return {
        resumen_general: "Resumen generado a partir de los cálculos actuales.",
        contexto: "Datos y supuestos configurados en la herramienta.",
        ingresos: "", costes: "", margen: "", ticket: "",
        tendencias_mensuales: "", punto_equilibrio: "",
        escenario_base: "", escenario_opt: "", escenario_pes: "",
        sensibilidades: "", equipo_medico: "",
        recomendaciones_financieras: "-",
        resumen_visual: ""
      };
    }
  }

  function buildPromptFromLastData(){
  if (!window.lastData) {
    alert('Primero pulsa "📊 Generar Análisis Completo" en Planificación Financiera.');
    return '';
  }
  const d = window.lastData;

  // Series mensuales
  const ingresosMes_JSON = JSON.stringify(d.ingresos || []);
  const costesMes_JSON   = JSON.stringify((d.cVariables||[]).map((v,i)=> v + (d.cfMensual?.[i]||0)));
  const margenMes_JSON   = JSON.stringify(d.ebitda || []);

  // Tabla médicos (si existe)
  const fEUR = (n) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n||0);
  const pct  = (x) => (x==null?'–':`${(x*100).toFixed(1)}%`);
  const safe = (s) => (s??'').toString().trim();

  const topMedicos = Array.isArray(window.OPTICLINIC_FIN?.topMedicos) ? window.OPTICLINIC_FIN.topMedicos : [];
  const tabla_medicos = topMedicos.map(m =>
    `| ${safe(m.nombre)} | ${m.modulos??0} | ${fEUR(m.ticket??0)} | ${fEUR(m.margen??0)} | ${safe(m.insight)||"-"} |`
  ).join('\n');

  // Texto IA (si no hay, autogeneramos)
  const ia = window.ANALISIS_FIN_IA || (function iaFromLastData(){
    return {
      resumen_general: "Se alcanza el punto de equilibrio; los márgenes mejoran por ticket medio y control de variables.",
      contexto: "Se analizan datos reales y proyecciones configuradas en Planificación Financiera.",
      ingresos: "Impulsados por volumen y ticket medio.",
      costes: "Fijos + variables; vigilar consumibles y horas.",
      margen: "Condicionado por precio efectivo y coste variable.",
      ticket: "Derivado del mix de servicios y aseguradoras.",
      tendencias_mensuales: "Estacionalidad moderada con valle estival.",
      punto_equilibrio: "BE calculado con CF y margen contribución medio.",
      escenario_base: "Mantener disciplina de costes y ocupación estable.",
      escenario_opt: "Upside con +precio/+ocupación y mejor mix.",
      escenario_pes: "Plan defensivo si cae demanda o suben fijos.",
      sensibilidades: "Precio y ocupación son las palancas de mayor impacto.",
      equipo_medico: "Top 3 concentran la mayor parte del margen.",
      recomendaciones_financieras: "- Revisar tarifas en líneas premium\n- Optimizar agenda en horas pico\n- Ajustar compras a rotación\n- KPI semanales por profesional",
      resumen_visual: "Usar tarta de costes y barra de margen medio para lectura rápida."
    };
  })();

  // Agregados
  const ingresosTotales = (d.ingresos||[]).reduce((a,b)=>a+b,0);
  const costesTotales   = (d.cVariables||[]).reduce((a,b)=>a+b,0) + (d.cfMensual||[]).reduce((a,b)=>a+b,0);
  const margenTotal     = ingresosTotales - costesTotales;
  const margenPct       = ingresosTotales>0 ? (margenTotal/ingresosTotales) : 0;

  // Sensibilidades (si existen)
  const sens = {
    precio_up5:  window.OPTICLINIC_FIN?.sens?.precio_up5  ?? null,
    precio_dn5:  window.OPTICLINIC_FIN?.sens?.precio_dn5  ?? null,
    occ_up10:    window.OPTICLINIC_FIN?.sens?.occ_up10    ?? null,
    occ_dn10:    window.OPTICLINIC_FIN?.sens?.occ_dn10    ?? null
  };

  // Escenarios (si existen)
  const esc   = window.OPTICLINIC_FIN?.escenarios || d.escenarios || {};
  const escBP = esc.base && esc.base.ingresos>0 ? esc.base.margen/esc.base.ingresos : null;
  const escOP = esc.opt  && esc.opt.ingresos>0  ? esc.opt.margen/esc.opt.ingresos   : null;
  const escPP = esc.pes  && esc.pes.ingresos>0  ? esc.pes.margen/esc.pes.ingresos   : null;

  const now = new Date().toLocaleDateString('es-ES');
  const clinica = document.getElementById('empresaNombre')?.value || 'Clínica Ejemplo';
  const ticketMedio = Number(document.getElementById('ticketMedio')?.value || 0);
  const costeVariable = Number(document.getElementById('costeVariable')?.value || 0);
  const costeFijo = Number(document.getElementById('costesFijos')?.value || 0);

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
- Ingresos: ${fEUR(ingresosTotales)} | Costes: ${fEUR(costesTotales)} | Margen: ${fEUR(margenTotal)} (${pct(margenPct)})
- Ticket medio: ${fEUR(ticketMedio)} | Módulos: —
- Comentario crítico: —

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
| Margen Neto      | ${fEUR(margenTotal)} (${pct(margenPct)}) | ${safe(ia.margen)} |
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
- Consultas necesarias para cubrir costes: ${d.pacientesMinimos ?? "-"}
Comentario: ${safe(ia.punto_equilibrio)}

---
# Escenarios (Base / Optimista / Pesimista)
| Escenario | Ingresos | Costes | Margen | % Margen | Nota |
|---|---:|---:|---:|---:|---|
| Base      | ${esc.base?.ingresos!=null ? fEUR(esc.base.ingresos) : "—"} | ${esc.base?.costes!=null ? fEUR(esc.base.costes) : "—"} | ${esc.base?.margen!=null ? fEUR(esc.base.margen) : "—"} | ${esc.base ? pct(escBP) : "—"} | ${safe(ia.escenario_base)} |
| Optimista | ${esc.opt?.ingresos!=null ? fEUR(esc.opt.ingresos)   : "—"} | ${esc.opt?.costes!=null ? fEUR(esc.opt.costes)   : "—"} | ${esc.opt?.margen!=null ? fEUR(esc.opt.margen)   : "—"} | ${esc.opt  ? pct(escOP) : "—"} | ${safe(ia.escenario_opt)}  |
| Pesimista | ${esc.pes?.ingresos!=null ? fEUR(esc.pes.ingresos)   : "—"} | ${esc.pes?.costes!=null ? fEUR(esc.pes.costes)   : "—"} | ${esc.pes?.margen!=null ? fEUR(esc.pes.margen)   : "—"} | ${esc.pes  ? pct(escPP) : "—"} | ${safe(ia.escenario_pes)}  |

---
# Sensibilidades (precio y ocupación)
Instrucciones de gráfico: barras con 4 columnas (Precio +5%, Precio −5%, Ocupación +10%, Ocupación −10%).
• Muestra la cifra de margen (en €) encima de cada barra. Formato es-ES.
Resultados:
- +5% precio ⇒ margen: ${sens.precio_up5!=null?fEUR(sens.precio_up5):'–'}
- −5% precio ⇒ margen: ${sens.precio_dn5!=null?fEUR(sens.precio_dn5):'–'}
- +10% ocupación ⇒ margen: ${sens.occ_up10!=null?fEUR(sens.occ_up10):'–'}
- −10% ocupación ⇒ margen: ${sens.occ_dn10!=null?fEUR(sens.occ_dn10):'–'}
Insight: ${safe(ia.sensibilidades)}

---
# Rendimiento por profesional (Top 5)
| Médico | Módulos | Ticket Medio | Margen | Insight |
|---|---:|---:|---:|---|
${(Array.isArray(window.OPTICLINIC_FIN?.topMedicos) && window.OPTICLINIC_FIN.topMedicos.length)
  ? tabla_medicos
  : "| – | – | – | – | – |"}

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

  btnOpen.addEventListener('click', () => {
    const prompt = buildPromptFromLastData();
    if (!prompt) return;
    ta.value = prompt;
    modal.style.display = 'block';
  });

  btnCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); btnCopy.textContent = '¡Copiado!'; setTimeout(()=>btnCopy.textContent='Copiar',1200); }
    catch { ta.select(); document.execCommand('copy'); }
  });

  btnDl.addEventListener('click', () => {
    const blob = new Blob([ta.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'OptiClinic_Informe_Financiero.md';
    a.click(); URL.revokeObjectURL(url);
  });

  btnClose.addEventListener('click', () => modal.style.display = 'none');
});
