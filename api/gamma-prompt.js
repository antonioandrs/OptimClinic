/* ======= Gamma (manual): construir prompt desde lastData + IA (Consultoría Pro, data-driven) ======= */
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
  const pct1 = (x) => {
    if (x==null || isNaN(x)) return "–";
    const v = Math.abs(x) > 1.5 ? x : x*100;
    return `${v.toFixed(1)}%`;
  };
  const safe  = (s) => (s ?? "").toString().trim();
  const round = (x) => Math.round((x ?? 0));
  const sum   = (arr) => (arr||[]).reduce((a,b)=>a+(+b||0),0);

  // Agrupa una serie mensual en años (bloques de 12 meses)
  function yearlySums(series){
    const out = [];
    const m = series?.length ?? 0;
    for (let i=0;i<m;i+=12){ out.push(sum(series.slice(i, i+12))); }
    return out;
  }
  const yearLabels = (n) => Array.from({length:n}, (_,i)=>`Año ${i+1}`);

  // === BRANDING ===
  const BRAND = {
    primary: "#2563eb",
    accent:  "#0891b2",
    font:    "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
    logoUrl: "https://i.imgur.com/eRKd3Hp.jpeg"
  };

  // Extrae texto de una tarjeta por su título visible
  function scrapeSectionByHeading(headingText){
    const all = Array.from(document.querySelectorAll("h3,h2,h4"));
    const h = all.find(el => el.textContent.trim().toLowerCase().includes(headingText.toLowerCase()));
    if (!h) return "";
    const card = h.closest(".card, .analysis-card, section, div") || h.parentElement;
    const clone = card.cloneNode(true);
    clone.querySelectorAll("button, input, select, textarea").forEach(n=>n.remove());
    return clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
  }

  // ===== Utilidades financieras =====
  function npv(rate, flows){
    if (!Array.isArray(flows) || !flows.length) return null;
    const r = (+rate || 0);
    return flows.reduce((acc, cf, t)=> acc + (cf / Math.pow(1+r, t+1)), 0);
  }
  function irr(flows, guess=0.1){
    if (!Array.isArray(flows) || flows.length<2) return null;
    let r = guess, maxIter = 50;
    const f  = (x)=> flows.reduce((acc,cf,t)=> acc + (cf/Math.pow(1+x, t)), 0);
    const df = (x)=> flows.reduce((acc,cf,t)=> acc + (-t*cf/Math.pow(1+x, t+1)), 0);
    for(let i=0;i<maxIter;i++){
      const y=f(r), dy=df(r);
      if (!isFinite(y) || !isFinite(dy) || Math.abs(dy)<1e-10) break;
      const r2 = r - y/dy;
      if (Math.abs(r2 - r) < 1e-7) { r = r2; break; }
      r = r2;
    }
    return isFinite(r) && r>-0.9999 ? r : null;
  }
  function firstNonNegIndexPrefixSum(arr){
    let acc=0;
    for (let i=0;i<arr.length;i++){ acc+= (+arr[i]||0); if (acc>=0) return i; }
    return null;
  }
  function cumulate(arr){ let acc=0; return (arr||[]).map(v=> acc += (+v||0)); }

  // ===== Enriquecedor: completa KPI si faltan (BE, ROI, VAN, TIR, cashflow, caja, sensibilidades) =====
  function enrichFinancials(d){
    const meses = d.ingresos?.length || 0;

    const ingresos     = d.ingresos || [];
    const cVar         = d.cVariables || [];
    const cFijos       = d.cfMensual || [];
    const deuda        = d.servicioDeuda || d.deuda || [];
    const impuestos    = d.impuestos || [];
    const otros        = d.otrosFlujos || [];
    const capexInicial = d.capexInicial ?? d.inversionInicial ?? null;

    // 1) Cash-flow mensual
    let cashflow = Array.isArray(d.cashflow) && d.cashflow.length===meses ? d.cashflow.slice() : null;
    let flowSource = "flujo de caja neto";
    if (!cashflow){
      const totCostesMes = ingresos.map((_,i)=> (cVar[i]||0) + (cFijos[i]||0));
      cashflow = ingresos.map((ing,i)=>
        (+ing||0) - totCostesMes[i] - (deuda[i]||0) - (impuestos[i]||0) + (otros[i]||0)
      );
      const tieneCostes = (cVar?.some(v=>v!=null) || cFijos?.some(v=>v!=null));
      if (!tieneCostes && Array.isArray(d.ebitda) && d.ebitda.length===meses){
        cashflow = d.ebitda.slice();
        flowSource = "EBITDA (proxy de caja)";
      } else {
        flowSource = "modelo (ingresos − costes − deuda − impuestos ± otros)";
      }
    }

    // 2) BE por flujo acumulado
    let mesBE = d.mesBE ?? d.breakEvenMonth ?? null;
    if (mesBE==null){
      const idx = firstNonNegIndexPrefixSum(cumulate(cashflow));
      mesBE = (idx!=null) ? (idx+1) : null;
    }

    // 3) ROI / VAN / TIR
    let roiFinal = d.roiFinal ?? d.roi ?? null;
    let van      = d.van ?? d.npv ?? null;
    let tir      = d.tirAnual ?? d.tir ?? null;

    const tasaDesc = (d.tasaDescuento ?? d.discountRate ?? 0.10); // anual 10% si no hay
    let flowsIRR = null;
    if (capexInicial!=null){
      flowsIRR = [-Math.abs(+capexInicial||0), ...cashflow];
      if (roiFinal==null){
        const totalCFPos = sum(cashflow);
        roiFinal = (totalCFPos - Math.abs(+capexInicial||0)) / Math.abs(+capexInicial||0);
      }
    }
    if (van==null){
      const serieDesc = flowsIRR ? flowsIRR.slice(1) : cashflow.slice();
      van = npv(tasaDesc/12, serieDesc);
      if (flowsIRR){ van -= Math.abs(+capexInicial||0); }
    }
    if (tir==null && flowsIRR){
      tir = irr(flowsIRR);
      if (tir!=null) tir = Math.pow(1+tir, 12) - 1; // anualizar
    }

    // 4) Necesidad máxima de caja
    const acum = cumulate(cashflow);
    const minAcum = Math.min(...acum, 0);
    const necesidadMaxCaja = (-minAcum) || 0;
    const mesMasTenso = (acum.indexOf(minAcum)>=0) ? (acum.indexOf(minAcum)+1) : null;

    // 5) Sensibilidades
    const sens = (d.sens || d.sensibilidades || {});
    const ingresosTotales = sum(ingresos);
    const cVarTotal       = sum(cVar);
    const cFijosTotal     = sum(cFijos);
    const margenBase      = ingresosTotales - (cVarTotal + cFijosTotal);
    const precio = (f)=> (ingresosTotales*f) - (cVarTotal + cFijosTotal);
    const occ    = (f)=> (ingresosTotales*f) - (cVarTotal*f + cFijosTotal);
    const sensFull = {
      precio_up5: sens.precio_up5 ?? precio(1.05),
      precio_dn5: sens.precio_dn5 ?? precio(0.95),
      occ_up10:   sens.occ_up10   ?? occ(1.10),
      occ_dn10:   sens.occ_dn10   ?? occ(0.90),
      margen_base: margenBase
    };

    return {
      ...d,
      cashflow,
      flowSource,
      mesBE,
      roiFinal,
      van,
      tirAnual: tir,
      necesidadMaxCaja,
      mesMasTenso,
      sens: sensFull
    };
  }

  // ------- Recs data-driven (sin genéricos) -------
function generateDataDrivenRecs(d, ctx){
  const bullets = [];   // conclusiones/diagnóstico
  const out     = [];   // buffer de salida final

  const meses = d.ingresos?.length || 0;
  const ingresosTotales = (d.ingresos||[]).reduce((a,b)=>a+(+b||0),0);
  const costesTotales   = (d.cVariables||[]).reduce((a,b)=>a+(+b||0),0) + (d.cfMensual||[]).reduce((a,b)=>a+(+b||0),0);
  const margenTotal     = ingresosTotales - costesTotales;
  const margenPct       = ingresosTotales>0 ? (margenTotal/ingresosTotales) : null;

  const roi     = d.roiFinal ?? null;
  const tir     = d.tirAnual ?? null;
  const van     = d.van ?? null;
  const cajaMax = d.necesidadMaxCaja ?? null;

  const sens = ctx.sens || {};
  const baseMargin = margenTotal;
  const dPrecioUp  = (sens.precio_up5 ?? null) - baseMargin;
  const dPrecioDn  = baseMargin - (sens.precio_dn5 ?? null);
  const dOccUp     = (sens.occ_up10 ?? null) - baseMargin;
  const dOccDn     = baseMargin - (sens.occ_dn10 ?? null);

  const ticketMedio   = Number(document.getElementById("ticketMedio")?.value || 0);
  const costeVariable = Number(document.getElementById("costeVariable")?.value || 0);
  const costeFijo     = Number(document.getElementById("costesFijos")?.value || 0);
  const mcUnitario    = (ticketMedio && costeVariable>=0) ? (ticketMedio - costeVariable) : null;
  const mcRatio       = (ticketMedio>0) ? (mcUnitario/ticketMedio) : null;

  // Desglose anual
  const sum = (arr)=> (arr||[]).reduce((a,b)=>a+(+b||0),0);
  const yearlySums = (series)=> {
    const out=[]; for(let i=0;i<(series?.length||0); i+=12){ out.push(sum(series.slice(i,i+12))); } return out;
  };
  const yIngresos = yearlySums(d.ingresos||[]);
  const yCostes   = yearlySums((d.cVariables||[]).map((v,i)=> v + (d.cfMensual?.[i]||0)));
  const yMargen   = yIngresos.map((v,i)=> v - (yCostes[i] ?? 0));
  const nYears    = Math.max(yIngresos.length, yCostes.length);
  let gIng = null, gMar = null;
  if (nYears>=2 && yIngresos[0]>0){
    gIng = (yIngresos[1]-yIngresos[0])/yIngresos[0];
    gMar = (yMargen[1]-yMargen[0])/(yMargen[0] || 1);
  }

  // 1) Diagnóstico por ROI/margen/VAN
  if (roi!=null){
    if (roi < 0.10) bullets.push("ROI por debajo del 10%. Priorizar palancas de precio y ocupación para elevar retornos.");
    else if (roi < 0.15) bullets.push("ROI en zona 10–15%. Pricing y eficiencia pueden llevarlo al 15% sectorial.");
    else bullets.push("ROI competitivo (≥15%). Mantener disciplina de precios y coste variable.");
  }
  if (margenPct!=null){
    if (margenPct < 0.30) bullets.push("Margen operativo <30%. Requiere eficiencia operativa y revisión de estructura.");
    else if (margenPct < 0.35) bullets.push("Margen 30–35% (sector): aún mejorable.");
    else bullets.push("Margen ≥35%: consolidar buenas prácticas y estandarizar.");
  }
  if (van!=null){
    if (van <= 0) bullets.push("VAN no positivo: revisar supuestos de precio/ocupación y coste de capital.");
    else bullets.push("VAN positivo: el proyecto crea valor a la tasa de descuento actual.");
  }

  // 2) Liquidez
  if (typeof cajaMax === "number"){
    if (cajaMax > 0) bullets.push(`Riesgo de liquidez: necesidad máxima ${fEUR(cajaMax)}. Preparar línea de crédito o escalado de gastos.`);
    else bullets.push("Sin necesidad máxima de caja: holgura operativa suficiente.");
  }

  // 3) Palancas por sensibilidad
  const impacts = [];
  if (Number.isFinite(dPrecioUp)) impacts.push({k:"Precio +5%",  v:dPrecioUp});
  if (Number.isFinite(dOccUp))    impacts.push({k:"Ocupación +10%", v:dOccUp});
  if (Number.isFinite(dPrecioDn)) impacts.push({k:"Precio −5%",  v:-dPrecioDn});
  if (Number.isFinite(dOccDn))    impacts.push({k:"Ocupación −10%", v:-dOccDn});
  impacts.sort((a,b)=> (b.v||0)-(a.v||0));
  if (impacts.length){
    const top = impacts.slice(0,2).map(x=> x.k).join(" y ");
    bullets.push(`Palancas con mayor impacto en margen: ${top}. Priorizar experimentos controlados.`);
  }

  // 4) Unit economics
  if (mcRatio!=null){
    if (mcRatio < 0.5) bullets.push("Margen contribución unitario <50%: negociar consumibles y optimizar tiempos por acto.");
    else bullets.push("Margen contribución unitario ≥50%: mantener protocolos y compras eficientes.");
  }

  // 5) Crecimiento anual
  if (gIng!=null){
    if (gIng < 0) bullets.push("Ingresos Año 2 < Año 1: reforzar adquisición y fidelización para recuperar tracción.");
    else bullets.push(`Ingresos crecen ${pct1(gIng)} entre años. Vigilar que el crecimiento no erosione margen.`);
  }

  // 6) Break-even
  const beMes = ctx.be?.mes ?? d.mesBE ?? null;
  if (beMes!=null && meses){
    const tarde = beMes > Math.ceil(meses*0.75);
    if (tarde) bullets.push(`Break-even tardío (mes ${beMes} de ${meses}). Reforzar pricing/ocupación y escalado progresivo de fijos.`);
    else bullets.push(`Break-even en mes ${beMes}. Acelerar amortización y mejora de caja tras ese punto.`);
  }

  if (!bullets.length) {
    return "No se emiten recomendaciones automatizadas: faltan datos suficientes (ROI/margen/sensibilidades/BE).";
  }

  const palancas = [];
  if (Number.isFinite(dPrecioUp) || Number.isFinite(dPrecioDn)) palancas.push("- **Precio (test A/B, mix, premiumización)** en servicios con elasticidad controlada.");
  if (Number.isFinite(dOccUp) || Number.isFinite(dOccDn))       palancas.push("- **Ocupación (agenda, primeras visitas, recall)** para absorber fijos.");
  if (mcRatio!=null && mcRatio < 0.5)                           palancas.push("- **Coste variable/paciente**: protocolos, proveedores, compras a rotación.");
  if (!palancas.length)                                         palancas.push("- **Foco en la palanca dominante** según sensibilidades y priorización por ROI operativo.");

  const operativas = [];
  if (typeof cajaMax === "number" && cajaMax > 0)              operativas.push("- Línea de crédito / escalado de CAPEX y gastos.");
  operativas.push("- Cuadro de mando mensual (margen, ROI, caja) y revisión trimestral de precios.");
  operativas.push("- Recordatorios, prepago de señal y overbooking prudente en horas pico.");
  operativas.push("- Optimizar CPA con tracking de conversión y ramp-up por etapas.");

  out.push("## Conclusiones de diagnóstico");
  bullets.forEach(b => out.push(`- ${b}`));
  out.push("\n## Palancas prioritarias");
  palancas.forEach(p => out.push(p));
  out.push("\n## Recomendaciones operativas");
  operativas.forEach(p => out.push(p));

  return out.join("\n");
}


  // ===== IA / narrativa base + BE robusto =====
  function buildIAFromData(d, ctxExtras){
    // --- detección robusta del Break-even ---
    function detectBEMonth(){
      const candidates = [
        d.mesBE, d.breakEvenMonth, d.break_even_month, d.beMes, d.breakEvenMes,
        d.breakEven?.mes, d.breakEven?.month, d.kpis?.breakEvenMes, d.kpis?.beMes
      ];
      for (const v of candidates) {
        if (typeof v === "number" && isFinite(v)) return { hit:true, mes:v };
        if (typeof v === "string") {
          let m = v.match(/mes\s*(\d{1,2})/i) || v.match(/(\d{1,2})\s*\/\s*\d{1,2}/);
          if (!m) m = v.match(/\b(\d{1,2})\b/);
          if (m) return { hit:true, mes:Number(m[1]) };
          if (/no\s+alcanzad/i.test(v)) return { hit:false, mes:null };
        }
      }
      const banner = Array.from(document.querySelectorAll("*"))
        .find(el => /proyecto\s+viable|proyecto\s+no\s+viable/i.test(el.textContent||""));
      if (banner) {
        const txt = banner.closest(".card,div,section")?.innerText || banner.textContent || "";
        const m = txt.match(/break-?even\s+mes\s+(\d{1,2})/i);
        if (m) return { hit:true, mes:Number(m[1]) };
        if (/no\s+viable|no\s+alcanzad/i.test(txt)) return { hit:false, mes:null };
      }
      const tile = Array.from(document.querySelectorAll("*"))
        .find(el => /break-?even/i.test(el.textContent||""));
      if (tile) {
        const txt = (tile.closest(".card,div,section")?.innerText || tile.textContent || "").trim();
        const m1 = txt.match(/Mes\s*(\d{1,2})\s*\/\s*\d{1,2}/i);
        if (m1) return { hit:true, mes:Number(m1[1]) };
        if (/no\s+alcanzad/i.test(txt)) return { hit:false, mes:null };
      }
      const roi = d.roiFinal ?? d.roi;
      const van = d.van ?? d.npv;
      if ((roi!=null && roi>0) || (van!=null && van>0)) {
        const serie = (d.ebitda||[]).map(x=>+x||0);
        let acc=0;
        for (let i=0;i<serie.length;i++){ acc+=serie[i]; if (acc>=0) return {hit:true, mes:i+1}; }
        if (serie.length) return {hit:true, mes:serie.length};
      }
      return { hit:false, mes:null };
    }

    const be = detectBEMonth();
    const roi     = d.roiFinal ?? null;
    const tir     = d.tirAnual ?? null;
    const van     = d.van ?? null;
    const cajaMax = d.necesidadMaxCaja ?? null;
    const mesTenso= d.mesMasTenso ?? null;

    const resumenBE   = be.hit ? `Se alcanza el punto de equilibrio en el mes ${be.mes}.`
                               : `No se alcanza el punto de equilibrio (break-even) en el horizonte modelado.`;
    const resumenROI  = roi!=null ? `ROI proyectado: ${pct1(roi)}${roi<0?' (bajo)':''}.` : "";
    const resumenTIR  = tir!=null ? `TIR anual estimada: ${pct1(tir)}${tir<0?' (negativa)':''}.` : "";
    const resumenVAN  = van!=null ? `VAN (valor actual neto): ${fEUR(van)}.` : "";
    const resumenCaja = cajaMax!=null ? `Necesidad máxima de caja: ${fEUR(cajaMax)}${mesTenso?` (momento más tenso: ${mesTenso}).`:''}` : "";

    // 1) Prioriza recomendaciones de la UI
    const recsUI = scrapeSectionByHeading("Recomendaciones") || scrapeSectionByHeading("Recomendaciones prácticas");

    // 2) Prioriza recomendaciones del objeto IA si existen
    const iaObj = (typeof window.ANALISIS_FIN_IA === "object" && window.ANALISIS_FIN_IA) ? window.ANALISIS_FIN_IA : null;
    const recsIA = iaObj?.recomendaciones || iaObj?.recs || iaObj?.palancas || null;

    // 3) Data-driven si no hay UI/IA
    const recsData = generateDataDrivenRecs(d, { sens: ctxExtras?.sens, be });

    const recomendaciones_finales = safe(recsUI) || safe(recsIA) || safe(recsData);

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
      recomendaciones_financieras: recomendaciones_finales,
      resumen_visual: "Usar tarta de costes y barra de margen medio para lectura rápida.",
      guia_no_financieros: `• Break-even: cobros = pagos.\n• ROI: retorno sobre inversión.\n• VAN: valor hoy de flujos futuros.\n• TIR: “interés” anual equivalente.\n• EBITDA: resultado operativo antes de amortizaciones e intereses.`
    };
  }

  // Escenarios si no existen (Base = real; Opt/Pes ±10% ingresos, ±2% fijos)
  function ensureScenarios(d){
    const esc = (window.OPTICLINIC_FIN?.escenarios || d.escenarios || {});
    if (esc.base && esc.opt && esc.pes) return esc;

    const ingresos = sum(d.ingresos);
    const cVar     = sum(d.cVariables);
    const cFijos   = sum(d.cfMensual);
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

    const ingresos = sum(d.ingresos);
    const cVar     = sum(d.cVariables);
    const cFijos   = sum(d.cfMensual);

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
    // Enriquecer con KPIs si faltan
    const dd = enrichFinancials(window.lastData);

    // Series mensuales
    const ingresosMes_JSON = JSON.stringify((dd.ingresos || []).map(round));
    const costesMes_JSON   = JSON.stringify((dd.cVariables||[]).map((v,i)=> round(v + (dd.cfMensual?.[i]||0))));
    const margenMes_JSON   = JSON.stringify((dd.ebitda || []).map(round));

    // Escenarios / sensibilidades (para IA y prompt)
    const esc  = ensureScenarios(dd);
    const sens = dd.sens || ensureSens(dd);

    // IA / narrativa (con recs data-driven)
    const ia = buildIAFromData(dd, { sens, esc });

    // Agregados totales
    const ingresosTotales = sum(dd.ingresos);
    const costesTotales   = sum(dd.cVariables) + sum(dd.cfMensual);
    const margenTotal     = ingresosTotales - costesTotales;
    const margenPct       = ingresosTotales>0 ? (margenTotal/ingresosTotales) : 0;

    // ROI / TIR / VAN
    const roiFinal  = dd.roiFinal;
    const tirAnual  = dd.tirAnual;
    const van       = dd.van;

    // Inputs de UI
    const clinica       = document.getElementById("empresaNombre")?.value || "Clínica Ejemplo";
    const ticketMedio   = Number(document.getElementById("ticketMedio")?.value || 0);
    const costeVariable = Number(document.getElementById("costeVariable")?.value || 0);
    const costeFijo     = Number(document.getElementById("costesFijos")?.value || 0);
    const meses         = dd.ingresos?.length || 0;
    const mesesModelados= dd.mesesProyeccion || dd.horizonte || meses || "—";
    const mesInicialUI  = document.getElementById("mesInicial")?.value || "configurado en la app";
    const now = new Date().toLocaleDateString("es-ES");

    // Desglose anual
    const yIngresos = yearlySums(dd.ingresos||[]);
    const yCostes   = yearlySums((dd.cVariables||[]).map((v,i)=> v + (dd.cfMensual?.[i]||0)));
    const yMargen   = yIngresos.map((v,i)=> v - (yCostes[i] ?? 0));
    const yMargenPct= yIngresos.map((v,i)=> v>0 ? (yMargen[i]/v) : null);
    const nYears    = Math.max(yIngresos.length, yCostes.length, yMargen.length);
    const labels    = yearLabels(nYears);

    // Flujo de caja acumulado (ya enriquecido)
    const flowAcum = cumulate(dd.cashflow).map(round);
    const flowAcum_JSON = JSON.stringify(flowAcum);
    const flujoSource = dd.flowSource;

    // Tabla por médico (si existe)
    const topMedicos = Array.isArray(window.OPTICLINIC_FIN?.topMedicos) ? window.OPTICLINIC_FIN.topMedicos : [];
    const tabla_medicos = topMedicos.map(m =>
      `| ${safe(m.nombre)} | ${m.modulos??0} | ${fEUR(m.ticket??0)} | ${fEUR(m.margen??0)} | ${safe(m.insight)||"-"} |`
    ).join("\n") || "| – | – | – | – | – |";

    // Tabla KPIs por año
    const rowYears = (arr, fmt=(x)=>fEUR(x)) =>
      labels.map((_, i)=> arr[i]!=null ? fmt(arr[i]) : "—");
    const kpiTableByYear = [
      `| Indicador | ${labels.join(" | ")} | Total | Insight |`,
      `|---|${labels.map(()=> '---:').join('|')}|---:|---|`,
      `| Ingresos | ${rowYears(yIngresos).join(" | ")} | ${fEUR(ingresosTotales)} | Evolución de actividad e ingresos. |`,
      `| Costes   | ${rowYears(yCostes).join(" | ")}   | ${fEUR(costesTotales)}   | Estructura fija + variable. |`,
      `| Margen   | ${rowYears(yMargen).join(" | ")}   | ${fEUR(margenTotal)}     | Eficiencia operativa. |`,
      `| % Margen | ${rowYears(yMargenPct, pct1).join(" | ")} | ${pct1(margenPct)} | Rentabilidad por periodo. |`
    ].join("\n");

    let growthInsight = "";
    if (labels.length >= 2 && yIngresos[0]>0) {
      const gIng = (yIngresos[1]-yIngresos[0]) / yIngresos[0];
      const gCos = (yCostes[1]-yCostes[0]) / (yCostes[0]||1);
      growthInsight = `• Los ingresos crecen ${pct1(gIng)} entre ${labels[0]} y ${labels[1]}, mientras que los costes crecen ${pct1(gCos)}, mejorando el margen operativo.`;
    }

    // ---------- TEMPLATE ----------
    return `
# OptiClinic – Informe Financiero Integral
Cliente: ${clinica}
Fecha: ${now}
Idioma: Español (es-ES)
Formato: Presentación 16:9, estilo consultoría (titulares claros → 1 idea por slide, tablas legibles, bullets cortos).

No inventes datos ni reinterpretes los KPIs del bloque JSON “Datos (no mostrar)”.
En gráficos y ejes **usa siempre euros (símbolo € y formato es-ES)**.
Si tu librería dibuja $ por defecto, **sustituye las etiquetas por texto manual en €**.
**No añadas enlaces externos ni créditos en el contenido.**

Branding:
• Primario ${BRAND.primary}, acento ${BRAND.accent}, tipografía ${BRAND.font}.
• Fondo blanco, iconografía sencilla, alto contraste para legibilidad.
• Coloca el logo corporativo en la esquina superior derecha de la portada (logo: ${BRAND.logoUrl}).

---
**Datos (no mostrar, solo usar)**

\`\`\`json
{
  "be_month": ${JSON.stringify(dd.mesBE)},
  "roi_final_pct": ${JSON.stringify(roiFinal)},
  "tir_anual_pct": ${JSON.stringify(tirAnual)},
  "van_eur": ${JSON.stringify(van)},
  "ingresos_totales": ${JSON.stringify(ingresosTotales)},
  "costes_totales": ${JSON.stringify(costesTotales)},
  "margen_total": ${JSON.stringify(margenTotal)},
  "margen_pct": ${JSON.stringify(margenPct)},
  "year_labels": ${JSON.stringify(labels)},
  "ingresos_years": ${JSON.stringify(yIngresos)},
  "costes_years": ${JSON.stringify(yCostes)},
  "margen_years": ${JSON.stringify(yMargen)},
  "margen_pct_years": ${JSON.stringify(yMargenPct)},
  "flow_cumulative": ${flowAcum_JSON},
  "flow_source": ${JSON.stringify(flujoSource)}
}
\`\`\`

---
# Propósito del informe
Analizar la rentabilidad operativa y la viabilidad financiera del proyecto, identificando riesgos y oportunidades de mejora, en un formato visual adaptado a presentaciones directivas.

---
# Diagnóstico inicial del proyecto
• Sector: clínicas de medicina estética con foco en rentabilidad por paciente y optimización de capacidad.  
• Objetivo: validar la viabilidad económica del modelo operativo (horizonte ${mesesModelados} meses).  
• Hipótesis base: crecimiento del ticket medio sin aumento proporcional de estructura fija.  
• Variables críticas: ocupación, coste variable por paciente, estructura de financiación del CAPEX.

---
# Contexto y objetivos
${safe(ia.contexto)}
Objetivo: ofrecer una visión clara del rendimiento económico, riesgos y oportunidades de mejora; y recomendaciones accionables.

---
# Guía para no financieros
${safe(ia.guia_no_financieros)}

---
# KPIs principales (totales)
| Indicador | Valor | Insight |
|---|---:|---|
| Ingresos Totales | ${fEUR(ingresosTotales)} | ${safe(ia.ingresos)} |
| Costes Totales   | ${fEUR(costesTotales)}   | ${safe(ia.costes)}   |
| Margen Neto      | ${fEUR(margenTotal)} (${pct1(margenPct)}) | ${safe(ia.margen)} |
| Ticket Medio     | ${fEUR(ticketMedio)}     | ${safe(ia.ticket)}   |

---
# KPIs por año
${kpiTableByYear}

${growthInsight ? ("\n" + growthInsight) : ""}

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
# Punto de equilibrio y payback
- Coste fijo mensual: ${fEUR(costeFijo)}
- Margen contribución medio: ${fEUR(ticketMedio - costeVariable)}
- Consultas necesarias para cubrir costes: ${dd.pacientesMinimos ?? "–"}
Comentario: ${safe(ia.punto_equilibrio)}

---
# Flujo de caja acumulado
Instrucciones de gráfico: línea acumulada del **${flujoSource}**.
• El punto de corte indica recuperación de inversión (payback).  
• Si se usa EBITDA como proxy, indicarlo en nota metodológica.
**Flujo acumulado (mensual)**: ${flowAcum_JSON}

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
- +5% precio ⇒ margen: ${fEUR(sens.precio_up5)}
- −5% precio ⇒ margen: ${fEUR(sens.precio_dn5)}
- +10% ocupación ⇒ margen: ${fEUR(sens.occ_up10)}
- −10% ocupación ⇒ margen: ${fEUR(sens.occ_dn10)}
Insight: ${safe(ia.sensibilidades)}

---
# Benchmarking con proyectos similares
• ROI medio del sector: 12–15%.  
• Margen operativo medio: 32–36%.  
• La proyección de OptiClinic se sitúa **${(roiFinal!=null && roiFinal>0.15) ? "por encima" : "en línea"}** del promedio.  
• Riesgo principal: demora en maduración comercial y dependencia del flujo asegurado.

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
# Conclusiones finales
• Rentabilidad proyectada ${roiFinal!=null ? pct1(roiFinal) : "—"} con margen medio ${pct1(margenPct)}.  
• ${ (dd.mesBE!=null) ? `Break-even previsto en el mes ${dd.mesBE}.` : "Break-even dentro del horizonte modelado según evolución del margen." }  
• Escenario optimista robusto y pesimista todavía sostenible con ajustes.  
• Revisión trimestral de KPIs y calibración de supuestos recomendada.

---
# Próximos pasos sugeridos
1. Implantar cuadro de mando (margen, ROI, caja) y ritual mensual de revisión.  
2. Política de precios trimestral según elasticidad observada.  
3. Control presupuestario por área (costes directos vs indirectos).  
4. Evaluar expansión tras el mes 30 si ROI > 20%.

---
# Metodología y supuestos
• Horizonte modelado: ${mesesModelados} meses (mes inicial: ${mesInicialUI}).  
• Supuestos de precio, ocupación y mix: según configuración actual en OptiClinic.  
• Los cálculos usan los datos y parámetros visibles en la app; no se incluyen fuentes externas.  
• Flujo acumulado basado en **${flujoSource}**.  
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
