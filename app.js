(function () {
  'use strict';

  const state = { aircraft: 'NG', speedType: 'IAS', windType: 'HW', graphProfile: null, lastResult: null };
  const $ = (id) => document.getElementById(id);

  const refs = {
    shell: $('appShell'),
    weight: $('weightInput'),
    speed: $('speedInput'),
    oat: $('oatInput'),
    pa: $('paInput'),
    wind: $('windInput'),
    taxi: $('taxiInput'),
    paCard: $('paCard'),
    windCard: $('windCard'),
    windTypeSection: $('windTypeSection'),
    oatHint: $('oatHint'),
    modeNote: $('modeNote'),
    calculate: $('calculateButton'),
    result: $('resultCard'),
    energy: $('energyValue'),
    status: $('statusValue'),
    corrected: $('correctedSpeed'),
    event: $('eventEnergy'),
    taxiEnergy: $('taxiEnergy'),
    aircraftResult: $('aircraftResult'),
    range: $('rangeResult'),
    source: $('sourceText'),
    version: $('versionBadge'),
    aboutButton: $('aboutButton'),
    dialog: $('aboutDialog'),
    closeDialog: $('closeDialog'),
    graphCard: $('speedGraphCard'),
    graphCanvas: $('speedGraphCanvas'),
    cautionSpeed: $('cautionSpeedValue'),
    meltSpeed: $('meltSpeedValue'),
    graphNote: $('speedGraphNote')
  };

  function getInputPayload() {
    return {
      aircraft: state.aircraft,
      weightKg: readNumber(refs.weight),
      speed: readNumber(refs.speed),
      speedType: state.speedType,
      windType: state.windType,
      windComponent: readNumber(refs.wind),
      oat: readNumber(refs.oat),
      pressureAltitudeFt: readNumber(refs.pa),
      taxiMiles: readNumber(refs.taxi)
    };
  }

  function setSegment(group, value) {
    state[group] = value;
    document.querySelectorAll(`[data-group="${group}"] .segment`).forEach((button) => {
      button.classList.toggle('active', button.dataset.value === value);
    });
    if (group === 'aircraft') updateAircraftUI();
    if (group === 'speedType') updateSpeedMode();
  }

  document.querySelectorAll('.segmented').forEach((control) => {
    control.addEventListener('click', (event) => {
      const button = event.target.closest('.segment');
      if (!button || button.disabled) return;
      setSegment(control.dataset.group, button.dataset.value);
    });
  });

  function updateAircraftUI() {
    const table = B737_TABLES[state.aircraft];
    refs.version.textContent = state.aircraft;
    refs.shell.dataset.aircraft = state.aircraft;
    refs.aircraftResult.textContent = table.label;
    refs.source.textContent = `${state.aircraft}: ${table.source}`;
    refs.weight.min = table.axes.weights[0] * 1000;
    refs.weight.max = table.axes.weights[table.axes.weights.length - 1] * 1000;
    refs.pa.max = table.axes.alts[table.axes.alts.length - 1] * 1000;
    clearResult();
  }

  function updateSpeedMode() {
    const gs = state.speedType === 'GS';
    refs.pa.disabled = gs;
    refs.wind.disabled = gs;
    refs.paCard.classList.toggle('disabled', gs);
    refs.windCard.classList.toggle('disabled', gs);
    refs.windTypeSection.classList.toggle('disabled', gs);
    document.querySelectorAll('[data-group="windType"] .segment').forEach((button) => { button.disabled = gs; });
    refs.oatHint.textContent = gs ? 'Table entry fixed at 15°C; OAT is used for MAX taxi add.' : '';
    refs.modeNote.textContent = gs
      ? 'GS mode ignores wind and enters the QRH table at sea level / 15°C.'
      : 'IAS mode applies the QRH wind correction before table entry.';
    clearResult();
  }

  function readNumber(input) {
    return input.value.trim() === '' ? NaN : Number(input.value);
  }

  function formatEnergy(value, thresholds) {
    if (!Number.isFinite(value)) return '—';
    const nearBoundary = thresholds && [thresholds.caution, thresholds.melt].some((t) => Math.abs(value - t) < 0.1);
    return value.toFixed(nearBoundary ? 2 : 1);
  }

  function formatSpeed(value) {
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1)} kt`;
  }

  function hideGraph() {
    state.graphProfile = null;
    state.lastResult = null;
    refs.graphCard.classList.add('hidden');
    refs.cautionSpeed.textContent = '—';
    refs.meltSpeed.textContent = '—';
    refs.graphNote.textContent = 'Graph appears after a valid calculation.';
    const ctx = refs.graphCanvas.getContext('2d');
    ctx.clearRect(0, 0, refs.graphCanvas.width, refs.graphCanvas.height);
  }

  function clearResult() {
    refs.result.className = 'result-card idle';
    refs.energy.textContent = '—';
    refs.status.textContent = 'READY';
    refs.corrected.textContent = '—';
    refs.event.textContent = '—';
    refs.taxiEnergy.textContent = '—';
    refs.range.textContent = 'Awaiting input';
    refs.range.className = '';
    hideGraph();
  }

  function renderError(result) {
    refs.result.className = 'result-card error';
    refs.energy.textContent = '—';
    refs.status.textContent = result.code === 'NO_TABULATED_VALUE' ? 'NO TABULATED VALUE' : 'OUTSIDE QRH RANGE';
    refs.corrected.textContent = Number.isFinite(result.correctedSpeed) ? formatSpeed(result.correctedSpeed) : '—';
    refs.event.textContent = '—';
    refs.taxiEnergy.textContent = '—';
    refs.aircraftResult.textContent = B737_TABLES[state.aircraft].label;
    refs.range.textContent = result.message || 'Check inputs';
    refs.range.className = '';
    hideGraph();
  }

  function renderResult(result) {
    const className = result.status === 'MELT' ? 'melt' : result.status === 'CAUTION' ? 'caution' : 'normal';
    refs.result.className = `result-card ${className}`;
    refs.energy.textContent = formatEnergy(result.totalEnergy, result.thresholds);
    refs.status.textContent = result.status === 'MELT' ? 'FUSE PLUG MELT ZONE' : result.status === 'CAUTION' ? 'CAUTION ZONE' : 'NORMAL';
    refs.corrected.textContent = formatSpeed(result.correctedSpeed);
    refs.event.textContent = `${formatEnergy(result.eventEnergy, result.thresholds)} M`;
    refs.taxiEnergy.textContent = `${result.taxiEnergy.toFixed(1)} M (${result.taxiRate.toFixed(1)}/mi)`;
    refs.aircraftResult.textContent = result.aircraftLabel;
    refs.range.textContent = 'Valid';
    refs.range.className = 'valid';
    refs.source.textContent = `${state.aircraft}: ${result.source}`;
  }

  function formatThresholdSummary(point, modeText) {
    if (!point) return 'Not reached';
    return `${formatSpeed(point.actualSpeed)} ${modeText}`;
  }

  function renderGraph(profile, result) {
    refs.graphCard.classList.remove('hidden');
    state.graphProfile = profile;
    state.lastResult = result;

    const modeText = profile.speedType === 'GS' ? 'GS' : 'IAS';
    refs.cautionSpeed.textContent = formatThresholdSummary(profile.cautionStart, modeText);
    refs.meltSpeed.textContent = formatThresholdSummary(profile.meltStart, modeText);

    const windText = profile.speedType === 'GS'
      ? 'Graph uses brakes-on ground speed.'
      : `Graph uses brakes-on IAS with ${profile.windComponent.toFixed(0)} kt ${profile.windType === 'TW' ? 'tailwind' : 'headwind'} correction in the background.`;

    const thresholdText = `Caution threshold ${result.thresholds.caution.toFixed(1)} M; melt threshold ${result.thresholds.melt.toFixed(1)} M.`;
    const limitText = [
      profile.cautionStart ? null : 'Caution is not reached within the valid QRH speed range.',
      profile.meltStart ? null : 'Melt is not reached within the valid QRH speed range.'
    ].filter(Boolean).join(' ');

    refs.graphNote.textContent = `${windText} ${thresholdText}${limitText ? ` ${limitText}` : ''}`;
    drawSpeedGraph(profile, result);
  }

  function niceStep(maxValue, tickCount) {
    const raw = maxValue / Math.max(1, tickCount);
    const power = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const normalized = raw / power;
    let step;
    if (normalized <= 1) step = 1;
    else if (normalized <= 2) step = 2;
    else if (normalized <= 2.5) step = 2.5;
    else if (normalized <= 5) step = 5;
    else step = 10;
    return step * power;
  }

  function drawSpeedGraph(profile, result) {
    const canvas = refs.graphCanvas;
    const cssWidth = canvas.clientWidth || 640;
    const cssHeight = canvas.clientHeight || 290;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = { top: 18, right: 16, bottom: 32, left: 50 };
    const plotWidth = cssWidth - pad.left - pad.right;
    const plotHeight = cssHeight - pad.top - pad.bottom;

    const xMin = profile.minActualSpeed;
    const xMax = profile.maxActualSpeed;
    const thresholdMax = Math.max(result.thresholds.melt, result.thresholds.caution);
    const yMax = niceStep(Math.max(profile.maxEnergy, thresholdMax) * 1.08, 5);
    const yMin = 0;

    function xScale(value) {
      return pad.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;
    }
    function yScale(value) {
      return pad.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
    }

    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(pad.left, pad.top, plotWidth, plotHeight);

    // Threshold bands
    const cautionY = yScale(result.thresholds.caution);
    const meltY = yScale(result.thresholds.melt);
    ctx.fillStyle = 'rgba(245,172,57,0.08)';
    ctx.fillRect(pad.left, meltY, plotWidth, cautionY - meltY);
    ctx.fillStyle = 'rgba(255,87,87,0.08)';
    ctx.fillRect(pad.left, pad.top, plotWidth, meltY - pad.top);

    // Gridlines
    ctx.strokeStyle = 'rgba(148,170,194,0.14)';
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = 'rgba(145,165,189,0.88)';

    const yStep = niceStep(yMax, 5);
    for (let y = 0; y <= yMax + 0.001; y += yStep) {
      const py = yScale(y);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotWidth, py);
      ctx.stroke();
      ctx.fillText(String(Number(y.toFixed(1))), 8, py + 4);
    }

    const xTickCount = Math.min(6, Math.max(4, Math.round(plotWidth / 80)));
    const xStep = (xMax - xMin) / (xTickCount - 1 || 1);
    for (let i = 0; i < xTickCount; i += 1) {
      const value = xMin + xStep * i;
      const px = xScale(value);
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotHeight);
      ctx.strokeStyle = 'rgba(148,170,194,0.08)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(145,165,189,0.88)';
      ctx.textAlign = 'center';
      ctx.fillText(value.toFixed(Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1), px, cssHeight - 10);
    }
    ctx.textAlign = 'start';

    // Threshold lines
    function drawDashedLine(y, color, label) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotWidth, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.fillText(label, pad.left + 6, Math.max(pad.top + 12, y - 6));
    }
    drawDashedLine(cautionY, '#f5ac39', `Caution ${result.thresholds.caution.toFixed(1)} M`);
    drawDashedLine(meltY, '#ff5757', `Melt ${result.thresholds.melt.toFixed(1)} M`);

    // Curve fill + stroke
    const points = profile.points;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = xScale(point.actualSpeed);
      const y = yScale(point.totalEnergy);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = 2.75;
    ctx.strokeStyle = '#63a5ff';
    ctx.stroke();

    ctx.beginPath();
    points.forEach((point, index) => {
      const x = xScale(point.actualSpeed);
      const y = yScale(point.totalEnergy);
      if (index === 0) ctx.moveTo(x, cssHeight - pad.bottom);
      ctx.lineTo(x, y);
    });
    const lastPoint = points[points.length - 1];
    ctx.lineTo(xScale(lastPoint.actualSpeed), cssHeight - pad.bottom);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, pad.top, 0, cssHeight - pad.bottom);
    fill.addColorStop(0, 'rgba(99,165,255,0.28)');
    fill.addColorStop(1, 'rgba(99,165,255,0.02)');
    ctx.fillStyle = fill;
    ctx.fill();

    // Markers
    function drawMarker(speedValue, energyValue, color, label) {
      if (!Number.isFinite(speedValue) || !Number.isFinite(energyValue)) return;
      const x = xScale(speedValue);
      const y = yScale(energyValue);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotHeight);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(6,17,30,0.95)';
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      ctx.fillText(label, Math.min(pad.left + plotWidth - 90, x + 8), Math.max(pad.top + 12, y - 10));
    }

    drawMarker(result.speed, result.totalEnergy, '#63a5ff', 'Current');
    if (profile.cautionStart) drawMarker(profile.cautionStart.actualSpeed, result.thresholds.caution, '#f5ac39', 'Caution start');
    if (profile.meltStart) drawMarker(profile.meltStart.actualSpeed, result.thresholds.melt, '#ff5757', 'Melt start');

    // Axes borders
    ctx.strokeStyle = 'rgba(148,170,194,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotWidth, plotHeight);

    ctx.fillStyle = 'rgba(145,165,189,0.88)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Brakes-on speed (${result.speedType})`, pad.left + plotWidth / 2, cssHeight - 4);
    ctx.save();
    ctx.translate(13, pad.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Total brake energy (M ft-lb / brake)', 0, 0);
    ctx.restore();
  }

  function calculate() {
    const payload = getInputPayload();
    const result = B737Engine.calculate(payload);

    if (!result.ok) {
      renderError(result);
      return;
    }

    result.speed = payload.speed;
    renderResult(result);

    const profile = B737Engine.buildSpeedProfile(payload, { step: 2 });
    if (!profile.ok) {
      hideGraph();
      return;
    }
    renderGraph(profile, result);
  }

  refs.calculate.addEventListener('click', calculate);
  [refs.weight, refs.speed, refs.oat, refs.pa, refs.wind, refs.taxi].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') calculate();
    });
    input.addEventListener('input', () => {
      if (!refs.graphCard.classList.contains('hidden')) hideGraph();
    });
  });

  refs.aboutButton.addEventListener('click', () => refs.dialog.showModal());
  refs.closeDialog.addEventListener('click', () => refs.dialog.close());
  refs.dialog.addEventListener('click', (event) => {
    if (event.target === refs.dialog) refs.dialog.close();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!state.graphProfile || !state.lastResult) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => drawSpeedGraph(state.graphProfile, state.lastResult), 80);
  });

  updateAircraftUI();
  updateSpeedMode();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
