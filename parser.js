/* Extract only fields attributable to the property, and never execute page scripts. */
function decodeModel(model) {
  if (!model || model.encoding !== 'on' || typeof model.data !== 'string') return model;
  const table = JSON.parse(model.data), seen = new Map();
  function get(i) {
    if (!Number.isInteger(i) || i < 0 || i >= table.length) return null;
    if (seen.has(i)) return seen.get(i);
    const val = table[i];
    if (!val || typeof val !== 'object') return val;
    const out = Array.isArray(val) ? [] : {}; seen.set(i, out);
    if (Array.isArray(val)) val.forEach(v => out.push(get(v)));
    else for (const [k,v] of Object.entries(val)) out[k] = get(v);
    return out;
  }
  return get(0);
}
function readModel(html) {
  const m = /(?:window\.)?(?:__?)?PAGE_MODEL\s*=\s*/.exec(html);
  if (!m) return null;
  let start = html.indexOf('{', m.index + m[0].length), depth = 0, inString = false, escape = false;
  if (start < 0) return null;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return decodeModel(JSON.parse(html.slice(start, i + 1))); } catch { return null; }
    }
  }
  return null;
}
function plain(value) {
  return String(value || '').replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi,' ').replace(/&pound;|&#163;|&#xA3;/gi,'£').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}
function parseTenure(p) {
  function normalise(value) {
    if (typeof value !== 'string') return null;
    const clean = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    const recognised = {
      'freehold': 'Freehold', 'leasehold': 'Leasehold',
      'share of freehold': 'Share of freehold', 'share freehold': 'Share of freehold',
      'commonhold': 'Commonhold', 'feuhold': 'Feuhold',
      'ask agent': 'Ask agent', 'ask the agent': 'Ask agent'
    };
    return recognised[clean] || null;
  }
  const model = p.tenure && typeof p.tenure === 'object' ? p.tenure : {};
  const candidates = [typeof p.tenure === 'string' ? p.tenure : null,
    model.tenureType, model.type, model.displayValue, p.tenureType];
  for (const group of [p.infoReelItems, p.propertyDetailsInfo?.content]) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      if (/^tenure$/i.test(item?.type || item?.title || '')) candidates.push(item.primaryText || item.value);
    }
  }
  candidates.push(p.tenureInfo?.title);
  for (const candidate of candidates) {
    const value = normalise(candidate);
    if (value) return value;
  }
  return null;
}
function parseProperty(p) {
  const costs = p.livingCosts || {}, tenure = p.tenure || {};
  const unknown = value => typeof value === 'string' && /^ask\s+(?:the\s+)?agent$/i.test(value.trim());
  let tax = typeof costs.councilTaxBand === 'string' && /^[A-I]$/i.test(costs.councilTaxBand.trim()) ? 'Band ' + costs.councilTaxBand.trim().toUpperCase() : (unknown(costs.councilTaxBand) ? 'Ask agent' : null);
  let ground = null, service = null, lease = null, size = null;
  function annualAmount(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return `£${value.toLocaleString('en-GB')} per year`;
    if (typeof value === 'string' && /^£?\s*[\d,]+(?:\.\d{1,2})?$/.test(value.trim())) return `${value.trim().startsWith('£') ? '' : '£'}${value.trim()} per year`;
    if (unknown(value)) return 'Ask agent';
    return null;
  }
  ground = annualAmount(costs.annualGroundRent ?? tenure.annualGroundRent ?? p.annualGroundRent);
  service = annualAmount(costs.annualServiceCharge ?? tenure.annualServiceCharge ?? p.annualServiceCharge);
  const years = tenure.yearsRemainingOnLease ?? p.yearsRemainingOnLease;
  if ((typeof years === 'number' && Number.isFinite(years) && years >= 0) || (typeof years === 'string' && /^\d+(?:\.\d+)?$/.test(years.trim()))) lease = `${years} years left`;
  else if (typeof years === 'string' && /^\d+(?:\.\d+)?\s+years?\s+(?:left|remaining)$/i.test(years.trim())) lease = years.trim();
  else if (unknown(years)) lease = 'Ask agent';
  const area = /\b([\d,]+(?:\.\d+)?)\s*(sq\.?\s*(?:ft|feet|m(?:et(?:re|er)s?)?)\.?|square\s*(?:feet|foot|metres?|meters?)|sqft|sqm|m(?:²|\^?2)|ft(?:²|\^?2))(?!\w)/i;
  const rangeArea = /\b([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*([\d,]+(?:\.\d+)?)\s*(sq\.?\s*(?:ft|feet|m(?:et(?:re|er)s?)?)\.?|square\s*(?:feet|foot|metres?|meters?)|sqft|sqm|m(?:²|\^?2)|ft(?:²|\^?2))(?!\w)/i;
  // Some page models include the same information as display-ready labelled entries.
  for (const item of Array.isArray(p.tenureInfo?.content) ? p.tenureInfo.content : []) {
    const value = typeof item?.value === 'string' ? plain(item.value) : '';
    if (item.type === 'groundRent' && !ground && /^(?:£\s*[\d,]+(?:\.\d{1,2})?(?:\s+(?:per\s+(?:year|annum|month)|p\.?a\.?|p\.?m\.?|pcm))?|ask\s+(?:the\s+)?agent|(?:a\s+)?peppercorn|nil|zero)$/i.test(value)) ground = value;
    if (item.type === 'annualServiceCharge' && !service && /^(?:£\s*[\d,]+(?:\.\d{1,2})?(?:\s+(?:per\s+(?:year|annum|month)|p\.?a\.?|p\.?m\.?|pcm))?|ask\s+(?:the\s+)?agent|nil|zero)$/i.test(value)) service = value;
    if (item.type === 'lengthOfLease' && !lease && /^(?:\d+(?:\.\d+)?\s+years?\s+(?:left|remaining)|ask\s+(?:the\s+)?agent)$/i.test(value)) lease = value;
  }
  for (const item of Array.isArray(p.councilTaxInfo?.content) ? p.councilTaxInfo.content : []) {
    const value = typeof item?.value === 'string' ? plain(item.value) : '';
    if (item.type === 'councilTaxBand' && !tax && /^(?:band:?\s*)?([A-I])$/i.test(value)) tax = 'Band ' + value.match(/([A-I])$/i)[1].toUpperCase();
    else if (item.type === 'councilTaxBand' && !tax && unknown(value)) tax = 'Ask agent';
  }
  const sizeItems = [...(Array.isArray(p.infoReelItems) ? p.infoReelItems : []), ...(Array.isArray(p.propertyDetailsInfo?.content) ? p.propertyDetailsInfo.content : [])];
  for (const item of sizeItems) {
    if (!/^size$/i.test(item?.type || item?.title || '')) continue;
    const value = plain(item.primaryText || item.value || '');
    const match = value.match(rangeArea) || value.match(area);
    if (match) {
      const secondary = plain(item.secondaryText || '');
      const second = secondary.match(rangeArea) || secondary.match(area);
      const approximate = /(?:\bapprox(?:imately|imate)?\.?|\bcirca|≈|~)\s*$/i;
      const firstText = (approximate.test(value.slice(0, match.index)) ? '≈ ' : '') + match[0];
      const secondText = second ? (approximate.test(secondary.slice(0, second.index)) ? '≈ ' : '') + second[0] : '';
      size = firstText + (second && second[0].toLowerCase() !== match[0].toLowerCase() ? ' / ' + secondText : '');
      break;
    }
    if (unknown(value)) size = 'Ask agent';
  }
  const values = Array.isArray(p.sizings) ? p.sizings : [];
  const areaParts = [];
  const addAreas = value => {
    let text = plain(value);
    const storeArea = match => {
      const part = match[0];
      const isImperial = /(?:ft|feet|foot|ft(?:²|\^?2))\.?$/i.test(part);
      const approximate = /(?:\bapprox(?:imately|imate)?\.?|\bcirca|≈|~)\s*$/i.test(text.slice(0, match.index));
      if (!areaParts.some(entry => entry.imperial === isImperial)) areaParts.push({text: (approximate ? '≈ ' : '') + part, imperial: isImperial});
    };
    const ranges = [...text.matchAll(new RegExp(rangeArea.source, 'ig'))];
    for (const match of ranges) storeArea(match);
    text = text.replace(new RegExp(rangeArea.source, 'ig'), ' ');
    for (const match of text.matchAll(new RegExp(area.source, 'ig'))) storeArea(match);
  };
  if (size && size !== 'Ask agent') addAreas(size);
  for (const item of values) {
    const s = typeof item === 'string' ? item : [item?.displaySize, item?.displayValue, item?.size, item?.unit].filter(v=>v != null).join(' ');
    addAreas(s);
    if (item && typeof item === 'object') {
      const unit = typeof item.unit === 'string' ? item.unit.trim().toLowerCase() : '';
      const imperial = /^(?:sq\.?\s*ft\.?|sqft|square\s*feet|ft(?:²|\^?2))$/i.test(unit);
      const metric = /^(?:sq\.?\s*m\.?|sqm|square\s*(?:metres?|meters?)|m(?:²|\^?2))$/i.test(unit);
      const min = Number(item.minimumSize), max = Number(item.maximumSize);
      if ((imperial || metric) && item.minimumSize != null && item.maximumSize != null &&
          Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min &&
          !areaParts.some(entry => entry.imperial === imperial)) {
        areaParts.push({text: `${min === max ? min : `${min} - ${max}`} ${unit}`, imperial});
      }
    }
  }
  if (areaParts.length) size = areaParts.map(part => part.text).join(' / ');
  const features = Array.isArray(p.keyFeatures) ? p.keyFeatures.map(plain) : [];
  const description = plain(p.text?.description);
  for (const s of features) {
    const m = s.match(area);
    if ((!size || size === 'Ask agent') && m && (!/\b(bedroom|reception|garden|balcony|terrace|kitchen|living room)\b/i.test(s) || /\b(total|overall|internal|property|floor area)\b/i.test(s))) size = (/(?:\bapprox(?:imately|imate)?\.?|\bcirca|≈|~)\s*$/i.test(s.slice(0, m.index)) ? '≈ ' : '') + m[0];
  }
  const all = [...features, description];
  for (const s of all) {
    if (!tax) { const m = s.match(/\bcouncil\s*tax\s*(?:band(?:ing)?\s*)?[:\-]?\s*([A-I])\b/i); if (m) tax = 'Band ' + m[1].toUpperCase(); }
    const valueAfterLabel = label => {
      const m = s.match(new RegExp('\\b' + label + '\\s*(?:is\\s+|of\\s+|:|[-–])?\\s*(£\\s*[\\d,]+(?:\\.\\d{1,2})?(?:\\s*(?:per\\s+(?:annum|year|month)|p\\.?a\\.?|p\\.?m\\.?|pcm|annually|yearly|monthly))?|(?:a\\s+)?peppercorn|nil|zero|ask\\s+(?:the\\s+)?agent)\\b', 'i'));
      return m ? m[1].trim().replace(/\s+/g, ' ') : null;
    };
    if (!ground || ground === 'Ask agent') ground = valueAfterLabel('ground\\s+rent') || ground;
    if (!service || service === 'Ask agent') service = valueAfterLabel('(?:annual\\s+)?service\\s+charges?') || service;
    if (!lease || lease === 'Ask agent') {
      const m = s.match(/\b(?:lease\s+(?:length|remaining)|remaining\s+lease|length\s+of\s+lease)\s*(?:is\s+|of\s+|:|[-–])?\s*(\d+\s+years?\s*(?:left|remaining)?|ask\s+(?:the\s+)?agent)\b/i) || s.match(/\b(\d+)\s+years?\s+(?:left|remaining)\s+on\s+(?:the\s+)?lease\b/i);
      if (m) lease = /^\d+$/.test(m[1]) ? `${m[1]} years left` : m[1].trim();
    }
    if (!size || size === 'Ask agent') {
      const m = s.match(/(?:total\s+(?:floor\s+)?area|overall\s+(?:floor\s+)?area|internal\s+(?:floor\s+)?area|floor\s+area|property\s+(?:size|area))\s*(?:of\s*)?[:\-]?\s*(?:approximately\s*|approx\.?\s*|circa\s*)?([\d,]+(?:\.\d+)?\s*(?:sq\.?\s*(?:ft|feet|m)\.?|square\s*(?:feet|foot|metres?|meters?)|sqft|sqm|m²|ft²))/i);
      if (m) size = (/\b(?:approximately|approx\.?|circa)\b/i.test(m[0]) ? '≈ ' : '') + m[1].trim();
    }
  }
  return { size, tax, ground, service, lease, tenureType: parseTenure(p) };
}
// Display the supplied metric measurement when available; otherwise convert
// square feet and explicitly mark the result as approximate.
function toMetricArea(size) {
  if (typeof size !== 'string' || !size.trim()) return size;
  if (/^ask\s+(?:the\s+)?agent$/i.test(size.trim())) return 'Ask agent';
  const numeric = '(\\d[\\d,]*(?:\\.\\d+)?)';
  const range = numeric + '(?:\\s*(?:-|–|to)\\s*' + numeric + ')?';
  const metric = new RegExp('\\b' + range + '\\s*(?:sq\\.?\\s*m(?:et(?:re|er)s?)?\\.?|square\\s*(?:metres?|meters?)|m(?:²|\\^?2))(?!\\w)', 'i');
  const imperial = new RegExp('\\b' + range + '\\s*(?:sq\\.?\\s*(?:ft|feet)\\.?|square\\s*(?:feet|foot)|ft(?:²|\\^?2))(?!\\w)', 'i');
  const match = size.match(metric) || size.match(imperial);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  const end = match[2] ? Number(match[2].replace(/,/g, '')) : null;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (end !== null && (!Number.isFinite(end) || end < value)) return null;
  if (metric.test(match[0])) {
    const approx = /(?:\bapprox(?:imately|imate)?\.?|\bcirca|≈|~)\s*$/i.test(size.slice(0, match.index));
    return `${approx ? '≈ ' : ''}${match[1]}${match[2] ? `–${match[2]}` : ''} sq m`;
  }
  return `≈ ${(value * 0.09290304).toFixed(1)}${end !== null ? `–${(end * 0.09290304).toFixed(1)}` : ''} sq m`;
}
// Only accept an explicitly labelled whole-property area, never room dimensions.
function parseFloorplanArea(text) {
  if (typeof text !== 'string') return null;
  const source = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const label = /\b(?:gross\s+internal\s+(?:floor\s+)?area|total\s+(?:internal\s+)?(?:floor\s+)?area|(?:approx(?:imate(?:ly)?)?\.?\s+)?floor\s+area|approx(?:imate(?:ly)?)?\.?\s+area|GIA)\b/ig;
  const number = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(sq\\.?\\s*(?:ft|feet|m(?:et(?:re|er)s?)?)\\.?|square\\s*(?:feet|foot|metres?|meters?)|sqft|sqm|m(?:²|\\^?2)|ft(?:²|\\^?2))';
  const area = new RegExp('^\\s*(?:(?:[=:~–-]\\s*)|(?:(?:of|approximately|approx\\.?|circa)\\s*))*' + number + '(?![a-z])(?:\\s*(?:/|\\(|=)\\s*' + number + '(?![a-z])\\s*\\)?)?', 'i');
  const matches = [];
  for (const m of source.matchAll(label)) {
    const prefix = source.slice(Math.max(0, m.index - 80), m.index).split('\n').pop();
    if (/\b(?:bedroom|kitchen|reception|bathroom|living\s+room|garden|garage|balcony|terrace|outbuilding|loft)\b[^\n]{0,50}$/i.test(prefix)) continue;
    const previous = source.slice(0, m.index).split('\n').slice(-2, -1)[0] || '';
    if (/^\s*(?:bedroom|kitchen|reception|bathroom|living\s+room|garden|garage|balcony|terrace|outbuilding|loft)(?:\s+\d+)?\s*[:\-]?\s*$/i.test(previous)) continue;
    let candidate = source.slice(m.index + m[0].length, m.index + m[0].length + 100);
    // OCR can read the superscript in m² as '?'. Only repair it when an
    // independently stated square-foot value follows; the ratio check below
    // must also validate that both values describe the same area.
    candidate = candidate.replace(/(\d[\d,]*(?:\.\d+)?\s*)m\?(?=\s*(?:\(|\/|=)\s*\d[\d,]*(?:\.\d+)?\s*(?:sq\.?\s*(?:ft|feet)|square\s*(?:feet|foot)|sqft|ft(?:²|\^?2)))/i, '$1m²');
    const value = candidate.match(area);
    if (!value) continue;
    const first = Number(value[1].replace(/,/g, ''));
    if (!Number.isFinite(first) || first <= 0) continue;
    const clean = (n, unit) => `${n} ${unit.replace(/\s+/g, ' ').trim()}`;
    let result = clean(value[1], value[2]);
    if (value[3]) {
      const second = Number(value[3].replace(/,/g, ''));
      const isMetres = u => /(?:\bm\b|sqm|met|m(?:²|\^?2))/i.test(u);
      if (!Number.isFinite(second) || second <= 0 || isMetres(value[2]) === isMetres(value[4])) continue;
      const sqm = isMetres(value[2]) ? first : second;
      const sqft = isMetres(value[2]) ? second : first;
      if (Math.abs(sqft / sqm - 10.7639) > 1.1) continue;
      result += ' / ' + clean(value[3], value[4]);
    }
    matches.push(result);
  }
  if (matches.length) return matches.length === 1 ? matches[0] : null;
  // A standalone approximation can refer to a room. Accept it only when it is
  // the sole candidate and neighbouring lines do not label a room or garden.
  const lines = source.split('\n');
  const approxOnly = new RegExp('^\\s*(?:approx(?:imate(?:ly)?)?\\.?|circa)\\s*' + number + '(?![a-z])(?:\\s*(?:/|\\(|=)\\s*' + number + '(?![a-z])\\s*\\)?)?\\s*$', 'i');
  const standalone = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(approxOnly);
    if (!m) continue;
    if (/\b(?:bedroom|kitchen|reception|bathroom|living\s+room|garden|garage|balcony|terrace|outbuilding|loft)\b/i.test([lines[i-1], lines[i+1]].filter(Boolean).join(' '))) continue;
    const first = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(first) || first <= 0) continue;
    let result = `${m[1]} ${m[2].replace(/\s+/g, ' ').trim()}`;
    if (m[3]) {
      const second = Number(m[3].replace(/,/g, ''));
      const isMetres = u => /(?:\bm\b|sqm|met|m(?:²|\^?2))/i.test(u);
      if (!Number.isFinite(second) || second <= 0 || isMetres(m[2]) === isMetres(m[4])) continue;
      const sqm = isMetres(m[2]) ? first : second;
      const sqft = isMetres(m[2]) ? second : first;
      if (Math.abs(sqft / sqm - 10.7639) > 1.1) continue;
      result += ` / ${m[3]} ${m[4].replace(/\s+/g, ' ').trim()}`;
    }
    standalone.push(result);
  }
  return standalone.length === 1 ? standalone[0] : null;
}
if (typeof module !== 'undefined') module.exports = { parseProperty, decodeModel, readModel, parseFloorplanArea, toMetricArea, parseTenure };
