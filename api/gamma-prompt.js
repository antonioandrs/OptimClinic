(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pct = (v) => (isFinite(v) ? `${(v*100).toFixed(1)}%` : '—');
  const pcts = (v) => (isFinite(v) ? `${v.toFixed(1)}%` : '—'); // ya en 0-100

  function eur(n){ try{ return fmt.format(Number(n||0)); }catch{ return String(n);} }
  function beText(d){ return d?.beMes ? `Mes ${d.beMes} (${d.monthLabels?.[d.beMes-1]||''})` : 'No alcanzado'; }
  function sum(arr){ return (arr||[]).reduce((a,b)=> a + (Number(b)||0), 0); } // sumar NO es recalcular el modelo, es presentar

  // Detecta charts comunes de tu index; si no están, omite la imagen.
  function imgFromChart(selector) {
    const cv = document.querySelector(selector);
    if (!cv) return '';
    const chart = cv.chart || cv.__chart || (window.Chart && Chart.getChart(cv));
    try {
      const url = chart?.toBase64Image();
      return url ? `![${selector}](${url})` : '';
    } catch { return ''; }
  }

  function leerSupuestos() {
    const v = (id, def=0) => Number($(id)?.value ?? def);
    const on = (id) => !!($(id)?.checked);
    return {
      empresa: $('empresaNombre')?.value || '—',
      responsable: $('responsableNombre')?.value || '—',
      capex: v('capex'),
      meses: v('meses', 36),
      dsoOn: on('toggleDSO'),
      dsoDias: v('dsoAseg'),
      impOn: on('toggleImp'),
      impPct: v('impSoc'),
      finImporte: v('finImporte'),
      finInteres: v('finInteres'),
      finPlazo: v('finPlazo'),
      finCarencia: v('finCarencia'),
      escenario: $('nombreEscenario')?.value || $('escenarioNombre')?.value || 'Escenario base'
    };
  }

  function tablaMeses(d, meses=12) {
    const rows = ['Mes\tPacientes\tIngresos\tCostes\tEBITDA\tFlujo\tAcumulado'];
    const n = Math.min(meses, (d?.mesesArr||[]).length);
    for (let i=0;i<n;i++){
      rows.push([
        d.monthLabels?.[i] ?? `Mes ${i+1}`,
        d.pacientesEfectivos?.[i] ?? 0,
        Math.round(d.ingresos?.[i] ?? 0),
        Math.round(d.costes?.[i] ?? 0),
        Math.round(d.ebitda?.[i] ?? 0),
        Math.round(d.flujoNeto?.[i] ?? 0),
        Math.round(d.flujoAcum?.[i] ?? 0),
      ].join('\t'));
    }
    return rows.join('\n');
  }

  function anexoCSV(d){
    // CSV mensual completo (por si quieres pegarlo en Gamma como anexo)
    const headers = ['Mes','Pacientes','Ingresos','Costes','EBITDA','Flujo','Acumulado'];
    const n = (d?.mesesArr||[]).length;
    const lines = [headers.join(',')];
    for (let i=0;i<n;i++){
      lines.push([
        d.monthLabels?.[i] ?? `Mes ${i+1}`,
        d.pacientesEfectivos?.[i] ?? 0,
        Math.round(d.ingresos?.[i] ?? 0),
        Math.round(d.costes?.[i] ?? 0),
        Math.round(d.ebitda?.[i] ?? 0),
        Math.round(d.flujoNeto?.[i] ?? 0),
        Math.round(d.flujoAcum?.[i] ?? 0),
      ].join(','));
    }
    return lines.join('\n');
  }

  function buildGammaPrompt(d) {
    if (!d) throw new Error('No hay análisis calculado. Genera el análisis primero.');
    const S = leerSupuestos();

    // KPIs (tal cual de lastData)
    const kpis = [
      `• Break-even (caja): **${beText(d)}**`,
      `• ROI final: **${pcts(d.roiFinal)}**`,
      `• VAN (NPV): **${eur(d.npvVal)}**`,
      `• TIR anual: **${pcts((d.irrAnual||0)*100)}**`,
      `• Necesidad máx. de caja: **${eur(d.necesidadMaxCaja)}**${d.mesMinCaja?` (${d.mesMinCaja})`:''}`,
      d.paybackMeses ? `• Payback: **${d.paybackMeses} meses**` : null,
    ].filter(Boolean).join('\n');

    // Agregados (presentación)
    const ingreso12 = sum((d.ingresos||[]).slice(0,12));
    const ebitda12  = sum((d.ebitda||[]).slice(0,12));
    const flujo12   = sum((d.flujoNeto||[]).slice(0,12));

    // Gráficos como imágenes (si existen en la página)
    const imgCash   = imgFromChart('#chartCash, canvas#chartCash');
    const imgPL     = imgFromChart('#chartPL, canvas#chartPL');
    const imgKPIs   = imgFromChart('#chartKPIs, canvas#chartKPIs');

    // Bloques de narrativa (sin tocar números)
    const riesgos = [
      '- **Liquidez**: tramo hasta necesidad máxima de caja, riesgo si ventas se retrasan o sube el DSO.',
      '- **Demanda**: sensibilidad elevada si pacientes efectivos ↓ 10–15% respecto al plan.',
      '- **Financiación**: fin de carencia y repago elevan outflows; revisar calendario de deuda.',
      '- **Costes variables**: margen sensible a material/insumos y % variable de médicos.',
    ].join('\n');

    const palancas = [
      '- **Aceleradores de demanda**: campañas de captación vinculadas a capacidad ociosa.',
      '- **Optimización del mix**: priorizar tratamientos de mayor margen/tiempo.',
      '- **Cobro**: reducir DSO (convenios con aseguradoras o anticipos).',
      '- **Gasto**: revisar costes fijos >3% de ingresos y renegociar insumos.',
    ].join('\n');

    const supuestos = [
      `- CAPEX: ${eur(S.capex)} · Horizonte: ${S.meses} meses`,
      `- DSO aseguradoras: ${S.dsoOn ? (S.dsoDias+' días') : 'No aplicado'}`,
      `- Impuesto sociedades: ${S.impOn ? (S.impPct+'%') : 'No aplicado'}`,
      `- Financiación CAPEX: Importe ${eur(S.finImporte)} · Interés ${S.finInteres}% · Plazo ${S.finPlazo}m · Carencia ${S.finCarencia}m`,
      `- Escenario: ${S.escenario}`,
      `> Nota: **Break-even de caja** (primer mes con flujo acumulado ≥ 0). No recalcular métricas.`,
    ].join('\n');

    // Tabla (primer año)
    const tablaY1 = tablaMeses(d, 12);

    // Anexo CSV (todo el horizonte)
    const csv = anexoCSV(d);

    // Texto ya generado por tu herramienta (si lo tienes)
    const analisis = (d.analisisTexto || '').replace(/<[^>]*>/g, '').trim();

    return `# OptimClinic – Informe Financiero para Gamma
Cliente: ${S.empresa}
Responsable: ${S.responsable}
Fecha: ${new Date().toLocaleDateString('es-ES')}

## 0) Guía de maquetación (no mostrar en la presentación)
- Formato: 16:9, estilo consultoría.
- Portada minimal + índice + bloques con 1 idea principal/slide.
- Tablas legibles (es-ES, símbolo €).
- **Usar cifras tal cual**; no recalcular.

---

## 1) Portada
Título: "${S.escenario} – Informe financiero"
Subtítulo: ${S.empresa} · ${S.responsable}

## 2) Resumen ejecutivo
${analisis || 'Resumen en 4–6 bullets con hallazgos clave, crecimiento, rentabilidad y liquidez.'}

## 3) Supuestos del escenario
${supuestos}

## 4) KPIs principales
${kpis}

## 5) Evolución financiera (gráfico)
${imgPL || '(Inserta línea: Ingresos, Costes, EBITDA por mes)'}
Notas: señalar mes de BE en el gráfico.

## 6) Flujo de caja y acumulado (gráfico)
${imgCash || '(Inserta área/columnas: Flujo neto y línea de flujo acumulado)'}
Resaltar la **necesidad máxima de caja** y el mes de BE.

## 7) Año 1 – Detalle mensual (tabla)
\`\`\`
${tablaY1}
\`\`\`
Total Año 1: Ingresos ${eur(ingreso12)}, EBITDA ${eur(ebitda12)}, Flujo ${eur(flujo12)}.

## 8) Financiación y calendario de deuda
- Carencia: ${S.finCarencia} meses · Tipo: ${S.finInteres}% · Plazo: ${S.finPlazo} meses.
- Señalar salto de outflows al finalizar carencia y su impacto en caja.

## 9) Sensibilidades (narrativa sin cálculo)
- Ventas ±10%: impacto directo en BE y necesidad de caja.
- DSO +15 días: desplaza BE y puede exigir circulante adicional.
- Coste variable +2 pp: erosiona margen y eleva payback.
*(Gamma: describir efectos cualitativos usando los KPIs facilitados, sin recalcular.)*

## 10) Riesgos y mitigaciones
${riesgos}

## 11) Palancas de mejora
${palancas}

## 12) Recomendaciones accionables (próximos 90 días)
- Checklist operativo y financiero (cobro, pricing, costes, marketing).

## 13) Conclusión
Mensaje síntesis: viabilidad, ventanas de riesgo y foco ejecutivo.

## 14) Anexo – Tabla completa (CSV pegado)
\`\`\`csv
${csv}
\`\`\`

## 15) Glosario y metodología
- BE de **caja**: primer mes con flujo acumulado ≥ 0.
- VAN/TIR calculados en herramienta (no recalcular aquí).
- DSO/Impuestos/Deuda según supuestos declarados arriba.

`;
  }

  // UI handlers existentes
  $('btnDossierFin')?.addEventListener('click', function () {
    if (!window.lastData) { alert('Pulsa "📊 Generar Análisis Completo" primero.'); return; }
    const prompt = buildGammaPrompt(window.lastData);
    $('taPrompt').value = prompt;
    $('modalPrompt').style.display = 'block';
  });
  $('btnCopy')?.addEventListener('click', () => navigator.clipboard.writeText($('taPrompt').value));
  $('btnClose')?.addEventListener('click', () => { $('modalPrompt').style.display = 'none'; });
  $('btnDownload')?.addEventListener('click', () => {
    const blob = new Blob([$('taPrompt').value], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gamma_prompt_completo.md';
    a.click();
  });

  // export opcional en window
  window.buildGammaPrompt = buildGammaPrompt;
})();
