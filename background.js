importScripts('parser.js');
const cache = new Map();
const waiting = new Map();
let serial = Promise.resolve();
let requestClock = Promise.resolve();
let lastStart = 0;
let blocked = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const maxImageBytes = 8 * 1024 * 1024;
const ocrPending = new Map();
const ocrQueue = [];
let ocrBusy = false;
let activeAutomaticController = null;

// Detail reads and image reads share a rate limiter, but OCR never holds it.
function reserveRequest() {
  const slot = requestClock.then(async () => {
    await pause(Math.max(0, 1500 - (Date.now() - lastStart)));
    if (blocked) throw new Error('blocked');
    lastStart = Date.now();
  });
  requestClock = slot.catch(() => {});
  return slot;
}
async function autoEnabled() {
  const settings = await chrome.storage.local.get({ocrEnabled: false});
  return settings.ocrEnabled === true;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.ocrEnabled && changes.ocrEnabled.newValue !== true) activeAutomaticController?.abort();
});

function floorplanUrl(property) {
  if (!Array.isArray(property.floorplans)) return null;
  for (const image of property.floorplans) {
    for (const candidate of [image?.maxSizeUrl, image?.url]) {
      try {
        const url = new URL(candidate);
        if (url.protocol === 'https:' && url.hostname === 'media.rightmove.co.uk' && !url.port && !url.username && !url.password) return url.href;
      } catch { /* invalid or absent URL */ }
    }
  }
  return null;
}
async function readFloorplan(url, signal) {
  if (!url) return {status:'unavailable'};
  if (blocked) return {status:'blocked'};
  await reserveRequest();
  if (blocked) return {status:'blocked'};
  if (signal?.aborted) throw new Error('cancelled');
  let response;
  try { response = await fetch(url, {credentials:'omit', redirect:'error', signal:AbortSignal.any([signal, AbortSignal.timeout(20000)])}); }
  catch { if (signal?.aborted) throw new Error('cancelled'); return {status:'download_failed'}; }
  if (response.status === 403 || response.status === 429) { blocked = true; return {status:'blocked'}; }
  const finalUrl = new URL(response.url);
  if (!response.ok || finalUrl.protocol !== 'https:' || finalUrl.hostname !== 'media.rightmove.co.uk' || finalUrl.port || finalUrl.username || finalUrl.password) return {status:'download_failed'};
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg','image/png','image/webp'].includes(contentType) || Number(response.headers.get('content-length')) > maxImageBytes) return {status:'image_unsupported'};
  const reader = response.body?.getReader();
  if (!reader) return {status:'download_failed'};
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxImageBytes) { await reader.cancel(); return {status:'image_unsupported'}; }
      chunks.push(value);
    }
  } catch { if (signal?.aborted) throw new Error('cancelled'); return {status:'download_failed'}; }
  if (!length) return {status:'download_failed'};
  const bytes = new Uint8Array(length); let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  let answer;
  try {
    if (!await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.createDocument({url:'offscreen.html', reasons:['WORKERS'], justification:'Run packaged offline OCR on the floorplan image.'});
    }
    answer = await chrome.runtime.sendMessage({target:'floorplan-ocr', type:'OCR_IMAGE', image:`data:${contentType};base64,${btoa(binary)}`});
  } catch { return {status:'engine_error'}; }
  if (answer?.error === 'image_invalid') return {status:'image_unsupported'};
  if (answer?.error || typeof answer?.text !== 'string') return {status:'engine_error'};
  if (!answer.text.trim()) return {status:'no_text'};
  const area = parseFloorplanArea(answer.text);
  return area ? {status:'ok', area} : {status:'no_area'};
}

async function load(id) {
  if (blocked) return {error:'blocked'};
  const prior = cache.get(id);
  if (prior && Date.now() - prior.time < 30 * 60 * 1000) return prior.result;
  await reserveRequest();
  if (blocked) return {error:'blocked'};
  const url = `https://www.rightmove.co.uk/properties/${id}`;
  try {
    const response = await fetch(url, { credentials:'omit', redirect:'follow', signal: AbortSignal.timeout(15000) });
    if (response.status === 403 || response.status === 429) { blocked = true; return {error:'blocked'}; }
    if (!response.ok || !new RegExp(`^https://www\\.rightmove\\.co\\.uk/properties/${id}/?(?:[?#].*)?$`).test(response.url)) return {error:'unavailable'};
    const html = await response.text();
    const model = readModel(html);
    const property = model?.propertyData;
    if (!property || String(property.id) !== id) return {error:'unreadable'};
    const data = parseProperty(property);
    if (data.size) data.size = withMetricArea(data.size);
    const floorplan = (!data.size || data.size === 'Ask agent') ? floorplanUrl(property) : null;
    const result = {data, hasFloorplan: !!floorplan};
    cache.set(id, {time:Date.now(), result, floorplan});
    return result;
  } catch { return {error:'unavailable'}; }
}

// Single OCR worker, separate from detail requests. Manual scans have priority.
function queueOcr(id, automatic) {
  const existing = ocrPending.get(id);
  if (existing) return existing;
  if (ocrQueue.length >= 30) return Promise.resolve({status:'busy'});
  let resolve;
  const task = new Promise(r => { resolve = r; });
  const job = {id, automatic, resolve};
  ocrPending.set(id, task);
  if (automatic) ocrQueue.push(job); else ocrQueue.unshift(job);
  runOcrQueue();
  return task;
}
async function runOcrQueue() {
  if (ocrBusy) return;
  ocrBusy = true;
  while (ocrQueue.length) {
    const job = ocrQueue.shift();
    let result;
    try {
      const entry = cache.get(job.id);
      if (!entry?.floorplan) result = {status:'unavailable'};
      else if (job.automatic && !await autoEnabled()) result = {status:'cancelled'};
      else if (blocked) result = {status:'blocked'};
      else {
        const controller = new AbortController();
        if (job.automatic) activeAutomaticController = controller;
        const value = await readFloorplan(entry.floorplan, controller.signal);
        if (job.automatic && !await autoEnabled()) result = {status:'cancelled'};
        else if (value.status === 'ok') result = {status:'ok', size:`≈ ${withMetricArea(value.area)} (floorplan OCR)`};
        else result = value;
      }
    } catch { result = {status:job.automatic && !await autoEnabled() ? 'cancelled' : (blocked ? 'blocked' : 'download_failed')}; }
    activeAutomaticController = null;
    ocrPending.delete(job.id);
    job.resolve(result);
  }
  ocrBusy = false;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['GET_PROPERTY', 'GET_FLOORPLAN'].includes(message?.type) || !/^\d{4,12}$/.test(message.id || '')) return;
  try { if (new URL(sender.tab?.url).origin !== 'https://www.rightmove.co.uk') return; } catch { return; }
  const id = message.id;
  if (message.type === 'GET_FLOORPLAN') {
    queueOcr(id, message.automatic === true).then(respond, () => respond({status:'unavailable'}));
    return true;
  }
  if (!waiting.has(id)) {
    const task = serial.then(() => load(id));
    serial = task.catch(() => {});
    waiting.set(id, task);
    task.finally(() => waiting.delete(id));
  }
  waiting.get(id).then(respond, () => respond({error:'unavailable'}));
  return true;
});
