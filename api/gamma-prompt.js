/* api/gamma-prompt.js
   Genera un prompt listo para Gamma (presentación 16:9) a partir del estado actual de OptimClinic.
   No usa módulos ES: se auto-registra en window y cablea la UI existente (#btnDossierFin + modal).
*/
(function () {
  const $ = (id) => document.getElementById(id);
  const safe = (v, d = "") => (v === null || v === undefined || v === "" ? d : v);

  // --- Serializa el estado actual desde tu UI / cálculos ---
  function serializeForGamma() {
    const empresa = ($('empresaNombre')?.value || 'Clínica').trim();
    const responsable = ($('responsableNombre')?.value || '').trim();
    const fecha = new Date().toISOString().slice(0, 10);

    // Bloque "Inteligencia de mercado" (tomado de tu UI)
    const mercado = {
      provincia: $('provinciaActual')?.textContent || $('provincia')?.value || '',
      rangoConsulta: $('rangoConsulta')?.textContent || '',
      mixPrivado: $('mixPrivado')?.textContent || '',
      crecimiento: $('crecimientoSector')?.textContent || '',
      dso: $('dsoPromedio')?.textContent || ''
    };

    // Entradas financieras actuales (UI)
    const entradas = {
      capex: num('capex'),
      meses: num('meses'),
      mes_inicio: $('mesInicio')?.value || '',
      financ: {
        principal: num('finImporte'),
        interes_anual_pct: num('finInteres'),
        plazo_meses: num('finPlazo'),
        carencia_meses: num('finCarencia')
      },
      precios: {
        pctPriv: num('pctPriv'),
        tarPriv: num('tarPriv'),
        pctAseg: num('pctAseg'),
        tarAseg: num('tarAseg'),
        ticketMedio: num('ticketMedio'),
        noShow_pct: num('noShow')
      },
      capacidad: {
        profesionales: num('profesionales'),
        horasDia: num('horasDia'),
        diasMes: num('diasMes'),
        minVisita: num('minVisita'),
        capacidadCalc: num('capacidadCalc')
      },
      demanda: {
        serviciosMes: num('serviciosMes'),
        crecDemanda_pct_mes: num('crecDemanda'),
        mktMes: num('mktMes'),
        cpa: num('cpa')
      },
      costes: {
        fijosMes: num('costesFijos'),
        crecCF_anual_pct: num('crecCF'),
        cVar_por_paciente: num('costeVariable')
      },
      impuestos_dso: {
        imp_soc_pct: $('toggleImp')?.checked ? num('impSoc') : 0,
        dso_aseg_dias: $('toggleDSO')?.checked ? num('dsoAseg') : 0
      },
      colaboradores: {
        n: num('colabCount'),
        alquiler_mes: num('colabAlquiler'),
        share_pct: num('colabShare'),
        horasDia: num('colabHorasDia'),
        diasMes: num('colabDiasMes'),
        minVisita: num('colabMinVisita'),
        tarifaMedia: num('colabTarifa'),
        pacientesIni: num('colabPacientesIni'),
        crec_pct_mes: num('colabCrec')
      }
    };

    // Resultados detallados calculados (tu variable global lastData)
    const d = window.lastData || null;

    const kpis = d ? {
      breakeven_mes: d.beMes,
      roi_pct: isFinite(d.roiFinal) ? Number(d.roiFinal) : null,
      npv: Number(d.npvVal ?? null),
      irr_anual_pct: isFinite(d.irrAnual) ? Number(d.irrAnual * 100) : null,
      necesidad_max_caja: Number(d.necesidadMaxCaja ?? null),
      mes_min_caja: d.mesMinCaja || null,
      estado_rentabilidad: d.estadoRentabilidad || null,
      margen_actual_pct: Number(d.margenActual ?? null),
      precio_minimo: Number(d.precioMinimo ?? null),
      pacientes_minimos_mes1: Number(d.pacientesMinimos ?? null),
    } : {};

    // Serie mensual (limitamos a 36 por comodidad en slides)
    const tablaMensual = d ? d.mesesArr.map((_, i) => ({
      mes: d.monthLabels[i],
      pacientes_efectivos: d.pacientesEfectivos[i],
      ingresos_totales: d.ingresos[i],
      ingresos_colab: (d.ingresosColab?.[i] ?? 0),
      c_var: d.cVariables[i],
      c_fijos: d.cfMensual[i],
      ebitda: d.ebitda[i],
      flujo_mes: d.flujoNeto[i],
      flujo_acum: d.flujoAcum[i]
    })).slice(0, 36) : [];

    // Palancas top (a partir del análisis de sensibilidad ya implementado)
    const palancas = (() => {
      try {
        const imp = (window.calcularSensibilidad && window.calcularSensibilidad()) || [];
        return imp.slice(0, 5).map(x => ({
          variable: x.name,
          variacion: (x.variation * 100) + '%',
          impacto_positivo_pp: Number(x.positive?.toFixed?.(2) || x.positive || 0),
          impacto_negativo_pp: Number(x.negative?.toFixed?.(2) || x.negative || 0)
        }));
      } catch { return []; }
    })();

    return {
      meta: { empresa, responsable, fecha, herramienta: 'OptimClinic' },
      mercado,
      entradas,
      kpis,
      resumen_viabilidad_html: d?.analisisTexto || '',
      mensual: tablaMensual,
      palancas
    };

    function num(id) { const el = $(id); const v = Number(el && el.value || 0); return isFinite(v) ? v : 0; }
  }

  // --- Construye el prompt completo para Gamma ---
  function buildGammaPrompt(payload) {
    const header = `
# OptimClinic — Dossier Financiero y de Mercado
Cliente: ${safe(payload.meta?.empresa, 'Clínica')}
Fecha: ${safe(payload.meta?.fecha, new Date().toLocaleDateString('es-ES'))}
Idioma: Español (es-ES)
Formato: Presentación 16:9, estilo consultoría (titulares claros, 1 idea por slide, tablas legibles, bullets cortos).

**Reglas**
- No inventes datos: usa estrictamente el JSON adjunto.
- Moneda: euros (formato es-ES, símbolo €).
- Títulos breves; subtítulos con insight.
- Evita enlaces externos o notas largas.
`.trim();

    const indice = `
## Índice sugerido
1. Resumen ejecutivo
2. Situación financiera actual (KPIs, caja, break-even)
3. Evolución mensual (ingresos, EBITDA, flujo)
4. Sensibilidades y palancas (tornado)
5. Mercado y posicionamiento (rango de precios, mix, DSO)
6. Recomendaciones (90 días, riesgos, métricas de éxito)
7. Anexo: Tabla mensual (detalle, sin redondeos agresivos)
`.trim();

    const tareas = `
## Lo que quiero que generes
- Portada profesional + resumen ejecutivo cuantificado.
- Gráficos: 1 de KPIs, 1 de evolución, 1 de sensibilidad/palancas.
- Tabla mensual legible (si hay >6-8 columnas, partir en 2).
- Acciones a 90 días con dueño, plazo y KPI asociado.
`.trim();

    const jsonDatos = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
    return `${header}\n\n${indice}\n\n${tareas}\n\n---\n**Datos (no mostrar en la presentación, solo como fuente):**\n${jsonDatos}`;
  }

  // --- Modal & acciones ---
  function openModal(text) {
    const modal = $('modalPrompt');
    const ta = $('taPrompt');
    if (!modal || !ta) return;
    ta.value = text;
    modal.style.display = 'block';
    ta.scrollTop = 0;
  }
  function closeModal() {
    const modal = $('modalPrompt');
    if (modal) modal.style.display = 'none';
  }

  async function copyPrompt() {
    const ta = $('taPrompt');
    if (!ta) return;
    try {
      await navigator.clipboard.writeText(ta.value);
      const btn = $('btnCopy'); if (btn) { btn.textContent = '¡Copiado!'; setTimeout(() => btn.textContent = 'Copiar', 1000); }
    } catch {
      ta.select(); document.execCommand('copy');
    }
  }
  function downloadPrompt() {
    const ta = $('taPrompt'); if (!ta) return;
    const blob = new Blob([ta.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `OptimClinic_Prompt_Gamma_${new Date().toISOString().slice(0,10)}.md`;
    a.href = url; a.click();
    URL.revokeObjectURL(url);
  }

  // --- Init: cablea #btnDossierFin y botones del modal ---
  function init() {
    const btn = $('btnDossierFin');
    if (btn) {
      btn.addEventListener('click', () => {
        if (!window.lastData) { alert('Primero pulsa "📊 Generar Análisis Completo" en Planificación Financiera.'); return; }
        const payload = serializeForGamma();
        const prompt = buildGammaPrompt(payload);
        openModal(prompt);
      });
    }
    $('btnClose')?.addEventListener('click', closeModal);
    $('btnCopy')?.addEventListener('click', copyPrompt);
    $('btnDownload')?.addEventListener('click', downloadPrompt);

    // Cerrar al hacer click fuera del card
    document.addEventListener('click', (e) => {
      const modal = $('modalPrompt');
      if (!modal || modal.style.display !== 'block') return;
      const card = modal.querySelector('div[style*="max-width"]');
      if (card && !card.contains(e.target) && !e.target.closest('#btnDossierFin')) {
        closeModal();
      }
    }, true);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.GammaPrompt = { buildGammaPrompt, serializeForGamma };
})();
