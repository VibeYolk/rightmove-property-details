const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function createWorker({status = 200, auto = true, ocrResult = {status:'ok', area:'363 sq m'}} = {}) {
  let count = 0;
  let onMessage;
  const context = vm.createContext({
    URL, AbortController, AbortSignal, Uint8Array, Promise, setTimeout,
    Date: class extends Date { static now() { return count * 2000 + 2000000; } },
    importScripts() {},
    chrome: {
      storage: {local: {get: async () => ({ocrEnabled: auto})}, onChanged: {addListener() {}}},
      runtime: {onMessage: {addListener(cb) {onMessage = cb;}}}
    },
    fetch: async url => {
      count++;
      await Promise.resolve();
      return {status, ok: status === 200, url, text: async () => 'mock'};
    },
    readModel: () => ({propertyData: {id: '94500594', floorplans: [{url:'https://media.rightmove.co.uk/a.png'}]}}),
    parseProperty: () => ({size: 'Ask agent'}),
    toMetricArea: value => value === 'Ask agent' ? value : '363 sq m'
  });
  context.ocrResult = ocrResult;
  vm.runInContext(fs.readFileSync(__dirname + '/../background.js', 'utf8') + '\nreadFloorplan = async () => ocrResult;', context);
  function message(type, automatic = false) {
    return new Promise(resolve => onMessage({type, id:'94500594', automatic}, {tab:{url:'https://www.rightmove.co.uk/property-for-sale.html'}}, resolve));
  }
  return {message, count: () => count};
}

(async () => {
  const worker = createWorker();
  // Simulates a service-worker restart while a search card remains open.
  const result = await worker.message('GET_FLOORPLAN');
  assert.equal(result.status, 'ok');
  assert.equal(worker.count(), 1);

  const garage = createWorker({ocrResult: {status:'ok', garageAreas:{excluding:'471 sq m', excludedStructure:'garage', restrictedHeadHeight:true}}});
  assert.equal((await garage.message('GET_FLOORPLAN')).size, '≈ 471 sq m (excluding garage and restricted head height; floorplan OCR)');
  const garageOnly = createWorker({ocrResult: {status:'ok', garageAreas:{excluding:'363 sq m', excludedStructure:'garage', restrictedHeadHeight:false}}});
  assert.equal((await garageOnly.message('GET_FLOORPLAN')).size, '≈ 363 sq m (excluding garage; floorplan OCR)');
  const outbuilding = createWorker({ocrResult: {status:'ok', garageAreas:{excluding:'218 sq m', excludedStructure:'outbuilding', restrictedHeadHeight:false}}});
  assert.equal((await outbuilding.message('GET_FLOORPLAN')).size, '≈ 218 sq m (excluding outbuilding; floorplan OCR)');

  const blocked = createWorker({status:403});
  assert.equal((await blocked.message('GET_FLOORPLAN')).status, 'blocked');

  const disabled = createWorker({auto:false});
  assert.equal((await disabled.message('GET_FLOORPLAN', true)).status, 'cancelled');
  assert.equal(disabled.count(), 0);

  const concurrent = createWorker();
  const [details, scan] = await Promise.all([concurrent.message('GET_PROPERTY'), concurrent.message('GET_FLOORPLAN')]);
  assert.equal(scan.status, 'ok');
  assert.equal(details.hasFloorplan, true);
  assert.equal(concurrent.count(), 1);
  console.log('background recovery tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
