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

    const ingresosMes_JSON = JSON.stringify(d.ingresos || []);
    const costesMes_JSON   = JSON.stringify((d.cVariables||[]).map((v,i)=> v + (d.cfMensual?.[i]||0)));
    const margenMes_JSON   = JSON.stringify(d.ebitda || []);

    const topMedicos = Array.isArray(window.OPTICLINIC_FIN?.topMedicos) ? window.OPTICLINIC_FIN.topMedicos : [];
    const tabla_medicos = topMedicos.map(m =>
      `| ${safe(m.nombre)} | ${m.modulos??0} | ${fEUR(m.ticket??0)} | ${fEUR(m.margen??0)} | ${safe(m.insight)||"-"} |`
    ).join('\n');

    const ia = window.ANALISIS_FIN_IA || iaFromLastData(d);

    const ingresosTotales = (d.ingresos||[]).reduce((a,b)=>a+b,0);
    const costesTotales   = (d.cVariables||[]).reduce((a,b)=>a+b,0) + (d.cfMensual||[]).reduce((a,b)=>a+b,0);
    const margenTotal     = ingresosTotales - costesTotales;
    const margenPct       = ingresosTotales>0 ? (margenTotal/ingresosTotales) : 0;

    const sens = {
      precio_up5:  window.OPTICLINIC_FIN?.sens?.precio_up5  ?? null,
      precio_dn5:  window.OPTICLINIC_FIN?.sens?.precio_dn5  ?? null,
      occ_up10:    window.OPTICLINIC_FIN?.sens?.occ_up10    ?? null,
      occ_dn10:    window.OPTICLINIC_FIN?.sens?.occ_dn10    ?? null
    };

    const now = new Date().toLocaleDateString('es-ES');
    const clinica = document.getElementById('empresaNombre')?.value || 'Clínica Ejemplo';

    return `
# OptiClinic – Informe Financiero Integral
Cliente: ${clinica}
Fecha: ${now}
Idioma: Español (es-ES)
Formato deseado: Presentación 16:9 con enfoque consultoría (titulares claros + tablas + bullets). No inventes datos.

---
# Resumen ejecutivo (para directivos)
${safe(ia.resumen_general)}

Puntos clave:
- Ingresos: ${fEUR(ingresosTotales)} | Costes: ${fEUR(costesTotales)} | Margen: ${fEUR(margenTotal)} (${pct(margenPct)})
- Ticket medio: ${fEUR(document.getElementById('ticketMedio')?.value || 0)} | Módulos: —
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
| Ticket Medio     | ${fEUR(document.getElementById('ticketMedio')?.value || 0)} | ${safe(ia.ticket)} |

---
# Evolución mensual
Instrucciones de gráfico: línea con 3 series (Ingresos, Costes, Margen/EBITDA). Etiquetas mensuales.
**Ingresos (mensual)**: ${ingresosMes_JSON}
**Costes (mensual)**: ${costesMes_JSON}
**Margen (mensual)**: ${margenMes_JSON}
Notas: ${safe(ia.tendencias_mensuales)}

---
# Punto de equilibrio (Break-even)
- Coste fijo mensual: ${fEUR((document.getElementById('costesFijos')?.value)||0)}
- Margen contribución medio: ${fEUR((document.getElementById('costeVariable')?.value)? ((document.getElementById('ticketMedio').value||0)-(document.getElementById('costeVariable').value||0)) : 0)}
- Consultas necesarias para cubrir costes: ${d.pacientesMinimos ?? "-"}
Comentario: ${safe(ia.punto_equilibrio)}

---
# Escenarios (Base / Optimista / Pesimista)
| Escenario | Ingresos | Costes | Margen | Nota |
|---|---:|---:|---:|---|
| Base      | — | — | — | ${safe(ia.escenario_base)} |
| Optimista | — | — | — | ${safe(ia.escenario_opt)}  |
| Pesimista | — | — | — | ${safe(ia.escenario_pes)}  |

---
# Sensibilidades (precio y ocupación)
Instrucciones de gráfico: barras con 4 barras (Precio +5/−5, Ocupación +10/−10).
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
  ? window.OPTICLINIC_FIN.topMedicos.map(m => `| ${safe(m.nombre)} | ${m.modulos??0} | ${fEUR(m.ticket??0)} | ${fEUR(m.margen??0)} | ${safe(m.insight)||"-"} |`).join('\n')
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
- Periodo y supuestos configurados en la pestaña Planificación Financiera.
- Datos suministrados por OptiClinic (última actualización ${now}).
- No se han introducido imágenes externas ni datos no verificados.
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
