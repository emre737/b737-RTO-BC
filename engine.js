(function (global) {
  'use strict';

  const TABLES = global.B737_TABLES || (typeof require !== 'undefined' ? require('./data.js') : null);
  const EPS = 1e-9;

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function bracket(axis, value) {
    if (!isFiniteNumber(value)) return null;
    if (value < axis[0] - EPS || value > axis[axis.length - 1] + EPS) return null;

    for (let i = 0; i < axis.length; i += 1) {
      if (Math.abs(value - axis[i]) <= EPS) {
        return [{ value: axis[i], weight: 1 }];
      }
      if (value < axis[i]) {
        const lo = axis[i - 1];
        const hi = axis[i];
        const t = (value - lo) / (hi - lo);
        return [
          { value: lo, weight: 1 - t },
          { value: hi, weight: t }
        ];
      }
    }
    return [{ value: axis[axis.length - 1], weight: 1 }];
  }

  function indexOfExact(axis, value) {
    return axis.findIndex((v) => Math.abs(v - value) <= EPS);
  }

  function lookup(table, weight, oat, speed, altitude) {
    const w = String(weight);
    const o = String(oat);
    const row = table.rows[w] && table.rows[w][o];
    if (!row) return null;
    const sIndex = indexOfExact(table.axes.speeds, speed);
    const aIndex = indexOfExact(table.axes.alts, altitude);
    if (sIndex < 0 || aIndex < 0) return null;
    const idx = sIndex * table.axes.alts.length + aIndex;
    const value = row[idx];
    return value == null ? null : Number(value);
  }

  function interpolate(table, weight, oat, speed, altitude) {
    const dimensions = [
      bracket(table.axes.weights, weight),
      bracket(table.axes.oats, oat),
      bracket(table.axes.speeds, speed),
      bracket(table.axes.alts, altitude)
    ];

    if (dimensions.some((d) => !d)) {
      return { ok: false, code: 'OUT_OF_RANGE', message: 'Input is outside the QRH table range.' };
    }

    let total = 0;
    let missing = false;

    function walk(dim, values, combinedWeight) {
      if (dim === dimensions.length) {
        const cell = lookup(table, values[0], values[1], values[2], values[3]);
        if (cell == null) {
          missing = true;
          return;
        }
        total += cell * combinedWeight;
        return;
      }

      for (const option of dimensions[dim]) {
        walk(dim + 1, values.concat(option.value), combinedWeight * option.weight);
      }
    }

    walk(0, [], 1);

    if (missing) {
      return {
        ok: false,
        code: 'NO_TABULATED_VALUE',
        message: 'This combination crosses an unpopulated area of the QRH table.'
      };
    }

    return { ok: true, value: total };
  }

  function correctedSpeed(speed, speedType, windType, windComponent) {
    if (speedType === 'GS') return speed;
    const wind = Math.max(0, Number(windComponent) || 0);
    return windType === 'TW' ? speed + 1.5 * wind : speed - 0.5 * wind;
  }

  function actualFromCorrected(corrected, speedType, windType, windComponent) {
    if (speedType === 'GS') return corrected;
    const wind = Math.max(0, Number(windComponent) || 0);
    return windType === 'TW' ? corrected - 1.5 * wind : corrected + 0.5 * wind;
  }

  function taxiRate(table, aircraft, actualOat) {
    if (aircraft === 'MAX') {
      if (actualOat < table.taxiRate.extremeLow || actualOat > table.taxiRate.extremeHigh) {
        return table.taxiRate.extremeOat;
      }
    }
    return table.taxiRate.default;
  }

  function classify(totalEnergy, table) {
    if (totalEnergy >= table.thresholds.melt) return 'MELT';
    if (totalEnergy >= table.thresholds.caution) return 'CAUTION';
    return 'NORMAL';
  }

  function prepareContext(input) {
    const aircraft = input.aircraft === 'MAX' ? 'MAX' : 'NG';
    const table = TABLES[aircraft];
    const weightKg = Number(input.weightKg);
    const actualOat = Number(input.oat);
    const taxiMiles = Number(input.taxiMiles || 0);
    const pressureAltitudeFt = Number(input.pressureAltitudeFt);
    const speedType = input.speedType === 'GS' ? 'GS' : 'IAS';
    const windType = input.windType === 'TW' ? 'TW' : 'HW';
    const windComponent = Number(input.windComponent || 0);

    if (![weightKg, actualOat, taxiMiles, windComponent].every(isFiniteNumber)) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Enter valid numeric values.' };
    }
    if (weightKg <= 0 || taxiMiles < 0 || windComponent < 0) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Weight and distances must be valid positive values.' };
    }
    if (speedType === 'IAS' && !isFiniteNumber(pressureAltitudeFt)) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Enter a valid pressure altitude.' };
    }

    const weight = weightKg / 1000;
    const tableOat = speedType === 'GS' ? 15 : actualOat;
    const tableAltitude = speedType === 'GS' ? 0 : pressureAltitudeFt / 1000;
    const rate = taxiRate(table, aircraft, actualOat);
    const taxiEnergy = taxiMiles * rate;

    return {
      ok: true,
      aircraft,
      table,
      weightKg,
      weight,
      actualOat,
      taxiMiles,
      speedType,
      windType,
      windComponent,
      pressureAltitudeFt,
      tableOat,
      tableAltitude,
      taxiRate: rate,
      taxiEnergy,
      aircraftLabel: table.label,
      brakeLabel: table.brake,
      source: table.source,
      thresholds: table.thresholds
    };
  }

  function evaluateAtCorrected(context, corrected) {
    const interp = interpolate(context.table, context.weight, context.tableOat, corrected, context.tableAltitude);
    if (!interp.ok) {
      return { ...interp, correctedSpeed: corrected };
    }

    const totalEnergy = interp.value + context.taxiEnergy;
    return {
      ok: true,
      correctedSpeed: corrected,
      eventEnergy: interp.value,
      taxiEnergy: context.taxiEnergy,
      taxiRate: context.taxiRate,
      totalEnergy,
      status: classify(totalEnergy, context.table)
    };
  }

  function calculate(input) {
    const speed = Number(input.speed);
    if (!isFiniteNumber(speed) || speed <= 0) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Enter a valid speed.' };
    }

    const context = prepareContext(input);
    if (!context.ok) return context;

    const corrected = correctedSpeed(speed, context.speedType, context.windType, context.windComponent);
    const evaluated = evaluateAtCorrected(context, corrected);
    if (!evaluated.ok) {
      return {
        ...evaluated,
        aircraft: context.aircraft,
        correctedSpeed: corrected,
        tableOat: context.tableOat,
        tableAltitude: context.tableAltitude
      };
    }

    return {
      ok: true,
      aircraft: context.aircraft,
      aircraftLabel: context.aircraftLabel,
      brakeLabel: context.brakeLabel,
      source: context.source,
      correctedSpeed: corrected,
      tableOat: context.tableOat,
      tableAltitude: context.tableAltitude,
      eventEnergy: evaluated.eventEnergy,
      taxiMiles: context.taxiMiles,
      taxiRate: context.taxiRate,
      taxiEnergy: context.taxiEnergy,
      totalEnergy: evaluated.totalEnergy,
      status: evaluated.status,
      thresholds: context.thresholds,
      speedType: context.speedType
    };
  }

  function refineThreshold(context, targetEnergy, loCorrected, hiCorrected) {
    let lo = loCorrected;
    let hi = hiCorrected;
    let loEval = evaluateAtCorrected(context, lo);
    let hiEval = evaluateAtCorrected(context, hi);

    if (!loEval.ok || !hiEval.ok) return null;
    if (loEval.totalEnergy >= targetEnergy) {
      return {
        actualSpeed: actualFromCorrected(lo, context.speedType, context.windType, context.windComponent),
        correctedSpeed: lo,
        totalEnergy: loEval.totalEnergy,
        bounded: 'lower'
      };
    }
    if (hiEval.totalEnergy < targetEnergy) return null;

    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      const midEval = evaluateAtCorrected(context, mid);
      if (!midEval.ok) break;
      if (midEval.totalEnergy >= targetEnergy) {
        hi = mid;
        hiEval = midEval;
      } else {
        lo = mid;
        loEval = midEval;
      }
    }

    return {
      actualSpeed: actualFromCorrected(hi, context.speedType, context.windType, context.windComponent),
      correctedSpeed: hi,
      totalEnergy: hiEval.totalEnergy,
      bounded: null
    };
  }

  function buildSpeedProfile(input, options) {
    const context = prepareContext(input);
    if (!context.ok) return context;

    const step = (options && isFiniteNumber(options.step) && options.step > 0) ? options.step : 2;
    const correctedAxis = context.table.axes.speeds;
    const correctedMin = correctedAxis[0];
    const correctedMax = correctedAxis[correctedAxis.length - 1];
    const points = [];
    const invalidRanges = [];
    let lastInvalid = null;

    for (let corrected = correctedMin; corrected <= correctedMax + EPS; corrected += step) {
      const exactCorrected = corrected > correctedMax ? correctedMax : Number(corrected.toFixed(6));
      const evaluated = evaluateAtCorrected(context, exactCorrected);
      if (!evaluated.ok) {
        if (!lastInvalid) lastInvalid = { from: exactCorrected, to: exactCorrected, code: evaluated.code };
        else lastInvalid.to = exactCorrected;
        continue;
      }
      if (lastInvalid) {
        invalidRanges.push(lastInvalid);
        lastInvalid = null;
      }
      points.push({
        correctedSpeed: exactCorrected,
        actualSpeed: actualFromCorrected(exactCorrected, context.speedType, context.windType, context.windComponent),
        eventEnergy: evaluated.eventEnergy,
        totalEnergy: evaluated.totalEnergy,
        status: evaluated.status
      });
    }
    if (lastInvalid) invalidRanges.push(lastInvalid);

    if (!points.length) {
      return { ok: false, code: 'NO_TABULATED_VALUE', message: 'No valid speed curve is available for this combination.' };
    }

    function findThreshold(target) {
      if (points[0].totalEnergy >= target) {
        return refineThreshold(context, target, points[0].correctedSpeed, points[0].correctedSpeed) || {
          actualSpeed: points[0].actualSpeed,
          correctedSpeed: points[0].correctedSpeed,
          totalEnergy: points[0].totalEnergy,
          bounded: 'lower'
        };
      }
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        if (prev.totalEnergy < target && curr.totalEnergy >= target) {
          return refineThreshold(context, target, prev.correctedSpeed, curr.correctedSpeed);
        }
      }
      return null;
    }

    const cautionStart = findThreshold(context.thresholds.caution);
    const meltStart = findThreshold(context.thresholds.melt);

    const minEnergy = Math.min.apply(null, points.map((p) => p.totalEnergy));
    const maxEnergy = Math.max.apply(null, points.map((p) => p.totalEnergy));

    return {
      ok: true,
      points,
      invalidRanges,
      aircraft: context.aircraft,
      aircraftLabel: context.aircraftLabel,
      speedType: context.speedType,
      windType: context.windType,
      windComponent: context.windComponent,
      taxiEnergy: context.taxiEnergy,
      taxiRate: context.taxiRate,
      thresholds: context.thresholds,
      cautionStart,
      meltStart,
      minActualSpeed: Math.min.apply(null, points.map((p) => p.actualSpeed)),
      maxActualSpeed: Math.max.apply(null, points.map((p) => p.actualSpeed)),
      minEnergy,
      maxEnergy
    };
  }

  const api = {
    calculate,
    interpolate,
    correctedSpeed,
    actualFromCorrected,
    classify,
    lookup,
    bracket,
    buildSpeedProfile
  };
  global.B737Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
