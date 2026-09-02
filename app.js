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

  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawPill(ctx, x, y, text, options) {
    const paddingX = options.paddingX || 10;
    const paddingY = options.paddingY || 7;
    ctx.save();
    ctx.font = options.font || '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    const width = ctx.measureText(text).width + paddingX * 2;
    const height = (options.height || 26);
    roundedRectPath(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = options.fill || 'rgba(8, 21, 34, 0.88)';
    ctx.fill();
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      ctx.lineWidth = options.lineWidth || 1;
      ctx.stroke();
    }
    ctx.fillStyle = options.textColor || '#f5f8fb';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + paddingX, y + height / 2 + 0.5);
    ctx.restore();
    return { width, height };
  }

  function buildSmoothLinePath(ctx, coordinates) {
    if (!coordinates.length) return;
    ctx.beginPath();
    ctx.moveTo(coordinates[0].x, coordinates[0].y);
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      const current = coordinates[i];
      const next = coordinates[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const last = coordinates[coordinates.length - 1];
    ctx.lineTo(last.x, last.y);
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

    const pad = { top: 18, right: 18, bottom: 34, left: 54 };
    const plotWidth = cssWidth - pad.left - pad.right;
    const plotHeight = cssHeight - pad.top - pad.bottom;

    const xMin = profile.minActualSpeed;
    const xMax = profile.maxActualSpeed;
    const thresholdMax = Math.max(result.thresholds.melt, result.thresholds.caution);
    const yMax = niceStep(Math.max(profile.maxEnergy, thresholdMax) * 1.12, 5);
    const yMin = 0;

    function xScale(value) {
      return pad.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;
    }
    function yScale(value) {
      return pad.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
    }

    // Background panel inside canvas
    const background = ctx.createLinearGradient(0, 0, 0, cssHeight);
    background.addColorStop(0, 'rgba(13, 31, 50, 0.98)');
    background.addColorStop(1, 'rgba(6, 17, 29, 0.98)');
    ctx.fillStyle = background;
    roundedRectPath(ctx, 0.5, 0.5, cssWidth - 1, cssHeight - 1, 16);
    ctx.fill();

    const plotGradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
    plotGradient.addColorStop(0, 'rgba(23, 54, 84, 0.18)');
    plotGradient.addColorStop(1, 'rgba(7, 16, 25, 0.02)');
    ctx.fillStyle = plotGradient;
    ctx.fillRect(pad.left, pad.top, plotWidth, plotHeight);

    // Invalid speed ranges from sparse QRH areas.
    profile.invalidRanges.forEach((range) => {
      const start = B737Engine.actualFromCorrected(range.from, profile.speedType, profile.windType, profile.windComponent);
      const end = B737Engine.actualFromCorrected(range.to, profile.speedType, profile.windType, profile.windComponent);
      const from = xScale(Math.max(xMin, Math.min(start, end)));
      const to = xScale(Math.min(xMax, Math.max(start, end)));
      const width = Math.max(2, to - from);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(from, pad.top, width, plotHeight);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = from - plotHeight; x < to; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, pad.top + plotHeight);
        ctx.lineTo(x + plotHeight, pad.top);
        ctx.stroke();
      }
      ctx.restore();
    });

    const cautionY = yScale(result.thresholds.caution);
    const meltY = yScale(result.thresholds.melt);

    // Zone fills
    ctx.fillStyle = 'rgba(245,172,57,0.08)';
    ctx.fillRect(pad.left, meltY, plotWidth, cautionY - meltY);
    ctx.fillStyle = 'rgba(255,87,87,0.10)';
    ctx.fillRect(pad.left, pad.top, plotWidth, meltY - pad.top);

    // Gridlines and ticks
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = 'rgba(145,165,189,0.88)';

    const yStep = niceStep(yMax, 5);
    for (let y = 0; y <= yMax + 0.001; y += yStep) {
      const py = yScale(y);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotWidth, py);
      ctx.strokeStyle = y === 0 ? 'rgba(148,170,194,0.22)' : 'rgba(148,170,194,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(String(Number(y.toFixed(1))), 10, py + 4);
    }

    const xTickCount = Math.min(6, Math.max(4, Math.round(plotWidth / 82)));
    const xStep = (xMax - xMin) / (xTickCount - 1 || 1);
    ctx.textAlign = 'center';
    for (let i = 0; i < xTickCount; i += 1) {
      const value = xMin + xStep * i;
      const px = xScale(value);
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotHeight);
      ctx.strokeStyle = 'rgba(148,170,194,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(145,165,189,0.88)';
      ctx.fillText(value.toFixed(Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1), px, cssHeight - 10);
    }
    ctx.textAlign = 'left';

    // Threshold lines with pills
    function drawThresholdLine(y, color, label, side) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotWidth, y);
      ctx.stroke();
      ctx.restore();
      const pillX = side === 'right' ? pad.left + plotWidth - 126 : pad.left + 8;
      drawPill(ctx, pillX, Math.max(pad.top + 4, y - 12), label, {
        fill: 'rgba(8,21,34,0.88)',
        stroke: color,
        textColor: color,
        height: 24,
        paddingX: 9,
        font: '700 10px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      });
    }
    drawThresholdLine(cautionY, '#f5ac39', `CAUTION ${result.thresholds.caution.toFixed(1)} M`, 'left');
    drawThresholdLine(meltY, '#ff6c6c', `MELT ${result.thresholds.melt.toFixed(1)} M`, 'right');

    const coordinates = profile.points.map((point) => ({ x: xScale(point.actualSpeed), y: yScale(point.totalEnergy) }));

    // Curve area fill
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(coordinates[0].x, pad.top + plotHeight);
    for (let i = 0; i < coordinates.length - 1; i += 1) {
      const current = coordinates[i];
      const next = coordinates[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const last = coordinates[coordinates.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(last.x, pad.top + plotHeight);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
    fill.addColorStop(0, 'rgba(99,165,255,0.25)');
    fill.addColorStop(0.6, 'rgba(99,165,255,0.09)');
    fill.addColorStop(1, 'rgba(99,165,255,0.02)');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    // Glow stroke
    buildSmoothLinePath(ctx, coordinates);
    ctx.strokeStyle = 'rgba(99,165,255,0.22)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Main stroke gradient
    const lineGradient = ctx.createLinearGradient(pad.left, pad.top, pad.left + plotWidth, pad.top + plotHeight);
    lineGradient.addColorStop(0, '#8fc1ff');
    lineGradient.addColorStop(0.5, '#5fa4ff');
    lineGradient.addColorStop(1, '#2f77d0');
    buildSmoothLinePath(ctx, coordinates);
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Current vertical highlight
    const currentX = xScale(result.speed);
    const currentY = yScale(result.totalEnergy);
    const verticalFade = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
    verticalFade.addColorStop(0, 'rgba(99,165,255,0.0)');
    verticalFade.addColorStop(0.15, 'rgba(99,165,255,0.18)');
    verticalFade.addColorStop(0.85, 'rgba(99,165,255,0.18)');
    verticalFade.addColorStop(1, 'rgba(99,165,255,0.0)');
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = verticalFade;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(currentX, pad.top);
    ctx.lineTo(currentX, pad.top + plotHeight);
    ctx.stroke();
    ctx.restore();

    function drawMarker(speedValue, energyValue, color, label, valueText, preferLeft) {
      if (!Number.isFinite(speedValue) || !Number.isFinite(energyValue)) return;
      const x = xScale(speedValue);
      const y = yScale(energyValue);

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(5,15,25,0.95)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const pillText = `${label}  ${valueText}`;
      ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      const width = ctx.measureText(pillText).width + 18;
      let pillX = preferLeft ? x - width - 12 : x + 12;
      if (pillX + width > pad.left + plotWidth) pillX = x - width - 12;
      if (pillX < pad.left + 4) pillX = x + 12;
      const pillY = Math.max(pad.top + 6, Math.min(pad.top + plotHeight - 30, y - 30));
      drawPill(ctx, pillX, pillY, pillText, {
        fill: 'rgba(8,21,34,0.92)',
        stroke: color,
        textColor: '#f5f8fb',
        height: 26,
        paddingX: 10,
        font: '700 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      });
    }

    drawMarker(result.speed, result.totalEnergy, '#63a5ff', 'Current', `${formatSpeed(result.speed).replace(' kt', '')} kt`, false);
    if (profile.cautionStart) {
      drawMarker(profile.cautionStart.actualSpeed, result.thresholds.caution, '#f5ac39', 'Caution', `${formatSpeed(profile.cautionStart.actualSpeed).replace(' kt', '')} kt`, true);
    }
    if (profile.meltStart) {
      drawMarker(profile.meltStart.actualSpeed, result.thresholds.melt, '#ff6c6c', 'Melt', `${formatSpeed(profile.meltStart.actualSpeed).replace(' kt', '')} kt`, false);
    }

    // Plot border and subtle gloss
    ctx.strokeStyle = 'rgba(148,170,194,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotWidth, plotHeight);

    const gloss = ctx.createLinearGradient(0, pad.top, 0, pad.top + 50);
    gloss.addColorStop(0, 'rgba(255,255,255,0.045)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(pad.left + 1, pad.top + 1, plotWidth - 2, 36);

    // Axis labels
    ctx.fillStyle = 'rgba(145,165,189,0.92)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Brakes-on speed (${result.speedType})`, pad.left + plotWidth / 2, cssHeight - 4);
    ctx.save();
    ctx.translate(14, pad.top + plotHeight / 2);
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
