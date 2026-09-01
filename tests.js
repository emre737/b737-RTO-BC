const assert = require('assert');
require('./data.js');
const E = require('./engine.js');

function close(actual, expected, tol = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
}

// Exact QRH grid-node checks.
let r = E.calculate({ aircraft:'NG', weightKg:80000, speed:80, speedType:'IAS', windType:'HW', windComponent:0, oat:0, pressureAltitudeFt:0, taxiMiles:0 });
assert.equal(r.ok, true); close(r.eventEnergy, 15.1); assert.equal(r.status, 'NORMAL');

r = E.calculate({ aircraft:'NG', weightKg:70000, speed:140, speedType:'IAS', windType:'HW', windComponent:0, oat:15, pressureAltitudeFt:5000, taxiMiles:0 });
assert.equal(r.ok, true); close(r.eventEnergy, 43.0); assert.equal(r.status, 'MELT');

r = E.calculate({ aircraft:'MAX', weightKg:70000, speed:140, speedType:'IAS', windType:'HW', windComponent:0, oat:20, pressureAltitudeFt:12000, taxiMiles:0 });
assert.equal(r.ok, true); close(r.eventEnergy, 54.4); assert.equal(r.status, 'MELT');

r = E.calculate({ aircraft:'MAX', weightKg:40000, speed:160, speedType:'IAS', windType:'HW', windComponent:0, oat:10, pressureAltitudeFt:14500, taxiMiles:0 });
assert.equal(r.ok, true); close(r.eventEnergy, 42.1); assert.equal(r.status, 'MELT');

// Ground-speed mode must force SL / 15C table entry.
r = E.calculate({ aircraft:'NG', weightKg:60000, speed:120, speedType:'GS', windType:'TW', windComponent:40, oat:45, pressureAltitudeFt:9000, taxiMiles:0 });
assert.equal(r.ok, true); close(r.eventEnergy, 25.6); close(r.correctedSpeed, 120);

// Wind correction checks.
close(E.correctedSpeed(140,'IAS','HW',20),130);
close(E.correctedSpeed(140,'IAS','TW',20),170);

// 4D interpolation at midpoint of a complete NG hypercube.
// Average of 16 surrounding corners: W 60/70, OAT 10/15, speed 120/140, alt 0/5.
r = E.calculate({ aircraft:'NG', weightKg:65000, speed:130, speedType:'IAS', windType:'HW', windComponent:0, oat:12.5, pressureAltitudeFt:2500, taxiMiles:0 });
assert.equal(r.ok, true);
const corners=[];
for (const w of [60,70]) for (const o of [10,15]) for (const s of [120,140]) for (const a of [0,5]) corners.push(E.lookup(B737_TABLES.NG,w,o,s,a));
const expected = corners.reduce((a,b)=>a+b,0)/corners.length;
close(r.eventEnergy, expected, 1e-10);

// Sparse MAX region must be rejected rather than extrapolated through blank cells.
r = E.calculate({ aircraft:'MAX', weightKg:90000, speed:170, speedType:'IAS', windType:'HW', windComponent:0, oat:20, pressureAltitudeFt:5000, taxiMiles:0 });
assert.equal(r.ok, false); assert.equal(r.code, 'NO_TABULATED_VALUE');

// Taxi add: NG 1.0 per mile; MAX 2.0 normally and 3.0 above 30C.
r = E.calculate({ aircraft:'NG', weightKg:60000, speed:100, speedType:'GS', windType:'HW', windComponent:0, oat:15, pressureAltitudeFt:0, taxiMiles:2.5 });
assert.equal(r.ok, true); close(r.taxiEnergy, 2.5);
r = E.calculate({ aircraft:'MAX', weightKg:60000, speed:100, speedType:'GS', windType:'HW', windComponent:0, oat:31, pressureAltitudeFt:0, taxiMiles:2 });
assert.equal(r.ok, true); close(r.taxiEnergy, 6.0);

// Thresholds.
assert.equal(E.classify(29.99, B737_TABLES.NG), 'NORMAL');
assert.equal(E.classify(30.0, B737_TABLES.NG), 'CAUTION');
assert.equal(E.classify(29.9, B737_TABLES.MAX), 'CAUTION');
assert.equal(E.classify(41.0, B737_TABLES.NG), 'MELT');
assert.equal(E.classify(41.0, B737_TABLES.MAX), 'MELT');

console.log('All B737 RTO engine tests passed.');
