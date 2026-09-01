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
        const [w, o, s, a] = values;
        const cell = lookup(table, w, o, s, a);
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

  function calculate(input) {
    const aircraft = input.aircraft === 'MAX' ? 'MAX' : 'NG';
    const table = TABLES[aircraft];
    const weightKg = Number(input.weightKg);
    const speed = Number(input.speed);
    const actualOat = Number(input.oat);
    const pressureAltitudeFt = Number(input.pressureAltitudeFt);
    const taxiMiles = Number(input.taxiMiles || 0);
    const speedType = input.speedType === 'GS' ? 'GS' : 'IAS';
    const windType = input.windType === 'TW' ? 'TW' : 'HW';
    const windComponent = Number(input.windComponent || 0);

    if (![weightKg, speed, actualOat, taxiMiles].every(isFiniteNumber)) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Enter valid numeric values.' };
    }
    if (weightKg <= 0 || speed <= 0 || taxiMiles < 0 || windComponent < 0) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Weight, speed and distances must be valid positive values.' };
    }
    if (speedType === 'IAS' && !isFiniteNumber(pressureAltitudeFt)) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Enter a valid pressure altitude.' };
    }

    const weight = weightKg / 1000;
    const corrected = correctedSpeed(speed, speedType, windType, windComponent);
    const tableOat = speedType === 'GS' ? 15 : actualOat;
    const tableAltitude = speedType === 'GS' ? 0 : pressureAltitudeFt / 1000;

    const interp = interpolate(table, weight, tableOat, corrected, tableAltitude);
    if (!interp.ok) {
      return {
        ...interp,
        aircraft,
        correctedSpeed: corrected,
        tableOat,
        tableAltitude
      };
    }

    const rate = taxiRate(table, aircraft, actualOat);
    const taxiEnergy = taxiMiles * rate;
    const totalEnergy = interp.value + taxiEnergy;
    const status = classify(totalEnergy, table);

    return {
      ok: true,
      aircraft,
      aircraftLabel: table.label,
      brakeLabel: table.brake,
      source: table.source,
      correctedSpeed: corrected,
      tableOat,
      tableAltitude,
      eventEnergy: interp.value,
      taxiMiles,
      taxiRate: rate,
      taxiEnergy,
      totalEnergy,
      status,
      thresholds: table.thresholds,
      speedType
    };
  }

  const api = { calculate, interpolate, correctedSpeed, classify, lookup, bracket };
  global.B737Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
