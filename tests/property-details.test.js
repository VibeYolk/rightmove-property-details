const assert = require('node:assert/strict');
const { parseProperty, parseFloorplanArea, parseFloorplanGarageAreas, toMetricArea } = require('../parser.js');

// Prefer the listing's own square-metre figure, and only convert when absent.
assert.equal(toMetricArea('641 sq ft / 59.5 sq m'), '59.5 sq m');
assert.equal(toMetricArea('641 sq ft'), '≈ 59.6 sq m');
assert.equal(toMetricArea('1,000 sqft'), '≈ 92.9 sq m');
assert.equal(toMetricArea('52.7 m² / 567 sq.ft.'), '52.7 sq m');
assert.equal(toMetricArea('52.7 m2'), '52.7 sq m');
assert.equal(toMetricArea('≈ 59.5 sq m'), '≈ 59.5 sq m');
assert.equal(toMetricArea('approximately 59.5 sq. metres'), '≈ 59.5 sq m');
assert.equal(toMetricArea('100 - 200 sq ft'), '≈ 9.3–18.6 sq m');
assert.equal(toMetricArea('10 - 20 sq m'), '10–20 sq m');
assert.equal(toMetricArea('Ask agent'), 'Ask agent');
assert.equal(toMetricArea(null), null);
assert.equal(toMetricArea('85 years'), null);

const metric = parseProperty({
  infoReelItems: [{ type: 'SIZE', primaryText: '641 sq ft', secondaryText: '59.5 sq m' }],
  tenure: { tenureType: 'SHARE_OF_FREEHOLD', yearsRemainingOnLease: 85 }
});
assert.equal(toMetricArea(metric.size), '59.5 sq m');
assert.equal(metric.tenureType, 'Share of freehold');
assert.equal(metric.lease, '85 years left');
assert.equal(parseProperty({ tenure: { tenureType: 'FREEHOLD' } }).tenureType, 'Freehold');
assert.equal(parseProperty({ tenure: { tenureType: 'LEASEHOLD' } }).tenureType, 'Leasehold');
assert.equal(parseProperty({ tenure: { yearsRemainingOnLease: 85 } }).tenureType, null);
assert.equal(parseProperty({ propertyDetailsInfo: { content: [{ type: 'tenure', value: 'Leasehold' }] } }).tenureType, 'Leasehold');
assert.equal(parseProperty({ infoReelItems: [{ type: 'TENURE', primaryText: 'Freehold' }] }).tenureType, 'Freehold');
assert.equal(parseProperty({ tenureInfo: { title: 'Commonhold' } }).tenureType, 'Commonhold');
assert.equal(parseProperty({ tenure: { tenureType: 'Ask agent' } }).tenureType, 'Ask agent');
assert.equal(parseProperty({ tenure: { tenureType: 'unknown' } }).tenureType, null);

const same = parseProperty({ sizings: [{ unit: 'sqft', minimumSize: 641, maximumSize: 641 }] });
assert.equal(toMetricArea(same.size), '≈ 59.6 sq m');
const range = parseProperty({ sizings: [{ unit: 'sqft', minimumSize: 100, maximumSize: 200 }] });
assert.equal(toMetricArea(range.size), '≈ 9.3–18.6 sq m');
const displayedRange = parseProperty({ infoReelItems: [{ type: 'SIZE', primaryText: '100 - 200 sq ft' }] });
assert.equal(toMetricArea(displayedRange.size), '≈ 9.3–18.6 sq m');
const approximate = parseProperty({ infoReelItems: [{ type: 'SIZE', primaryText: 'Approx. 59.5 sq m' }] });
assert.equal(toMetricArea(approximate.size), '≈ 59.5 sq m');
assert.equal(parseProperty({ sizings: [{ unit: 'sqft', minimumSize: 641 }] }).size, null);

const ocr = parseFloorplanArea('Total floor area 52.7 m? (567 sq.ft.) approx');
assert.equal(toMetricArea(ocr), '52.7 sq m');
assert.equal(toMetricArea(parseFloorplanArea('Total area: 641 sq ft')), '≈ 59.6 sq m');
assert.equal(parseFloorplanArea('Bedroom total area: 20 sq m'), null);
assert.equal(parseFloorplanArea('Total floor area 52.7 m? (1,567 sq.ft.) approx'), null);

assert.equal(toMetricArea(parseFloorplanArea('INTERNAL FLOOR AREA (APPROX.) 1526 sq ft/ 141.8 sq m')), '141.8 sq m');
assert.equal(parseFloorplanArea('Bedroom floor area (approx.) 20 sq m'), null);
assert.equal(parseFloorplanArea('FLOOR AREA (APPROX.) 1526 sq ft / 300 sq m'), null);
assert.equal(parseFloorplanArea('FLOOR AREA (APPROX.) 1526 sq ft / 155 sq m'), null);
assert.equal(parseFloorplanArea('FLOOR AREA (garden) 141.8 sq m'), null);
const garagePair = 'TOTAL APPROX FLOOR PLAN AREA INCLUDING GARAGE 4247 SQ.FT (395 SQ.M)\nTOTAL APPROX FLOOR PLAN AREA EXCLUDING GARAGE 3907 SQ.FT (363 SQ.M)';
assert.deepEqual(parseFloorplanGarageAreas(garagePair), {excluding: '363 sq m', excludedStructure: 'garage', restrictedHeadHeight: false});
assert.equal(parseFloorplanGarageAreas(garagePair.split('\n')[0]), null);
assert.equal(parseFloorplanGarageAreas(garagePair + '\n' + garagePair.split('\n')[0]), null);
assert.equal(parseFloorplanGarageAreas(garagePair.replace('363 SQ.M', '563 SQ.M')), null);
assert.equal(parseFloorplanGarageAreas(garagePair.replace('395 SQ.M', '360 SQ.M')), null);
assert.equal(parseFloorplanGarageAreas(garagePair + '\nTOTAL APPROX FLOOR PLAN AREA EXCLUDING GARAGE 3907 SQ.FT (563 SQ.M) EXTRA'), null);
assert.equal(parseFloorplanGarageAreas(garagePair + '\nTOTAL FLOOR AREA 100 sq m'), null);
assert.equal(parseFloorplanGarageAreas(garagePair + '\nTOTAL APPROX FLOOR PLAN AREA 800 SQ.M'), null);
const restricted = 'TOTAL APPROX FLOOR PLAN AREA INCLUDING GARAGE/RESTRICTED HEAD HEIGHT 5453 SQ.FT (507 SQ.M)\nTOTAL APPROX FLOOR PLAN AREA EXCLUDING GARAGE/RESTRICTED HEAD HEIGHT 5070 SQ.FT (471 SQ.M)';
assert.deepEqual(parseFloorplanGarageAreas(restricted), {excluding: '471 sq m', excludedStructure: 'garage', restrictedHeadHeight: true});
assert.equal(parseFloorplanGarageAreas(restricted.replace('471 SQ.M', '571 SQ.M')), null);
assert.equal(parseFloorplanGarageAreas(restricted + '\nTOTAL FLOOR AREA 100 sq m'), null);
assert.equal(parseFloorplanGarageAreas(restricted.replace('INCLUDING GARAGE/RESTRICTED HEAD HEIGHT', 'INCLUDING GARAGE')), null);
assert.equal(parseFloorplanGarageAreas('TOTAL APPROX FLOOR PLAN AREA INCLUDING GARAGE 4247 SQ.FT (395 SQ.M)'), null);
assert.deepEqual(parseFloorplanGarageAreas('TOTAL APPROX FLOOR PLAN AREA EXCLUDING GARAGE 3907 SQ.FT (363 SQ.M)'), {excluding:'363 sq m', excludedStructure:'garage', restrictedHeadHeight:false});
const outbuildingPair = 'TOTAL APPROX FLOOR PLAN AREA INCLUDING OUTBUILDING 2925 SQ.FT (272 SQ.M)\nTOTAL APPROX FLOOR PLAN AREA EXCLUDING OUTBUILDING 2326 SQ.FT (218 SQ.M)';
assert.deepEqual(parseFloorplanGarageAreas(outbuildingPair), {excluding:'218 sq m', excludedStructure:'outbuilding', restrictedHeadHeight:false});
assert.deepEqual(parseFloorplanGarageAreas(outbuildingPair.split('\n')[1]), {excluding:'218 sq m', excludedStructure:'outbuilding', restrictedHeadHeight:false});
assert.equal(parseFloorplanGarageAreas(outbuildingPair.replace('218 SQ.M', '400 SQ.M')), null);
assert.equal(parseFloorplanGarageAreas(outbuildingPair.replace('INCLUDING OUTBUILDING', 'INCLUDING GARAGE')), null);
assert.equal(parseFloorplanGarageAreas(outbuildingPair.replace(/OUTBUILDING/g, 'GARAGE AND OUTBUILDING')), null);
assert.equal(parseFloorplanGarageAreas(outbuildingPair + '\nTOTAL FLOOR AREA 100 sq m'), null);
assert.equal(parseFloorplanGarageAreas(outbuildingPair + '\nTOTAL APPROX FLOOR PLAN AREA 800 SQ.M'), null);
console.log('Property details tests passed');
