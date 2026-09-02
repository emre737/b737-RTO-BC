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
    cautionSpeed: $('cautionSpeedValue'),
    meltSpeed: $('meltSpeedValue'),
    currentSpeed: $('currentSpeedValue'),
    cautionDelta: $('cautionDeltaValue'),
    meltDelta: $('meltDeltaValue'),
    thresholdSummary: $('thresholdSummary')
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
    refs.currentSpeed.textContent = '—';
    refs.cautionDelta.textContent = '—';
    refs.meltDelta.textContent = '—';
    refs.thresholdSummary.textContent = 'Calculated from the current QRH inputs.';
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
    const current = Number(result.speed);
    refs.currentSpeed.textContent = `${formatSpeed(current)} ${modeText}`;
    refs.cautionSpeed.textContent = formatThresholdSummary(profile.cautionStart, modeText);
    refs.meltSpeed.textContent = formatThresholdSummary(profile.meltStart, modeText);

    function deltaText(point, label) {
      if (!point) return `${label} not reached in valid QRH range`;
      const delta = point.actualSpeed - current;
      if (Math.abs(delta) < 0.05) return `At ${label.toLowerCase()} threshold`;
      if (delta > 0) return `${delta.toFixed(1)} kt margin to ${label.toLowerCase()}`;
      return `Current is ${Math.abs(delta).toFixed(1)} kt above ${label.toLowerCase()}`;
    }

    refs.cautionDelta.textContent = deltaText(profile.cautionStart, 'Caution');
    refs.meltDelta.textContent = deltaText(profile.meltStart, 'Melt');

    const cautionText = profile.cautionStart
      ? `Caution starts at ${formatSpeed(profile.cautionStart.actualSpeed)} ${modeText}`
      : 'Caution is not reached within the valid QRH speed range';
    const meltText = profile.meltStart
      ? `melt starts at ${formatSpeed(profile.meltStart.actualSpeed)} ${modeText}`
      : 'melt is not reached within the valid QRH speed range';
    refs.thresholdSummary.textContent = `${cautionText}; ${meltText}. Values include the current QRH inputs and taxi-energy add.`;
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

  updateAircraftUI();
  updateSpeedMode();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
