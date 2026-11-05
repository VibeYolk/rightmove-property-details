(() => {
  const seen = new WeakSet();
  const observed = new WeakSet();
  const records = new Map();
  let autoOcr = false;
  chrome.storage.local.get({ocrEnabled:false}).then(settings => {
    autoOcr = settings.ocrEnabled === true;
    if (autoOcr) for (const record of records.values()) startScan(record, true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.ocrEnabled) return;
    autoOcr = changes.ocrEnabled.newValue === true;
    for (const [card, record] of records) {
      if (!card.isConnected) { records.delete(card); continue; }
      if (autoOcr) startScan(record, true);
      else if (record.scanning && record.automatic) {
        record.seq++; record.scanning = false; record.status = '';
        render(record);
      }
    }
  });
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      load(entry.target);
    }
  }, {rootMargin:'500px'});

  function findCard(link) {
    let el = link.parentElement;
    let fallback = null;
    while (el && el !== document.body) {
      const ids = new Set(Array.from(el.querySelectorAll('a[href*="/properties/"]'), a => a.getAttribute('href')?.match(/\/properties\/(\d+)/)?.[1]).filter(Boolean));
      if (ids.size > 1) return fallback;
      const rect = el.getBoundingClientRect();
      if (ids.size === 1 && rect.width > 280 && rect.height > 140 && el.querySelector('img') && el.textContent.trim().length > 50) {
        if (el.matches('article, .propertyCard, [data-testid="property-card"]') || /^propertyCard-\d+$/.test(el.getAttribute('data-testid') || '')) return el;
        if (!fallback) fallback = el;
      }
      el = el.parentElement;
    }
    return fallback;
  }
  function scan() {
    for (const link of document.querySelectorAll('a[href*="/properties/"]')) {
      const id = link.getAttribute('href')?.match(/\/properties\/(\d+)/)?.[1];
      if (!id) continue;
      const card = findCard(link);
      if (!card || seen.has(card)) continue;
      seen.add(card); card.classList.add('rm-extra-host'); card.dataset.rmPropertyId = id;
      if (!observed.has(card)) { observed.add(card); observer.observe(card); }
    }
  }
  function row(label, value) {
    const line = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = label + ': ';
    line.append(name, document.createTextNode(value)); return line;
  }
  function render(record) {
    const {box, data} = record;
    const size = record.ocrSize || data.size || 'Not found';
    const sizeRow = row('Size', size);
    if (record.hasFloorplan && !record.ocrSize) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'rm-scan-button';
      button.textContent = record.scanning ? 'Scanning…' : 'Scan floorplan';
      button.disabled = record.scanning;
      button.title = 'Use local OCR to read the floorplan';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); startScan(record, false); });
      sizeRow.append(' ', button);
    }
    if (record.status) sizeRow.append(document.createTextNode(` (${record.status})`));
    box.replaceChildren(sizeRow, row('Council tax', data.tax || 'Not found'), row('Ground rent', data.ground || 'Not found'), row('Service charge', data.service || 'Not found'), row('Lease remaining', data.lease || 'Not found'));
    box.title = 'Not found means the extension could not find a value, not that the listing has none. Verify all details with the agent.';
  }
  async function startScan(record, automatic) {
    if (!record.hasFloorplan || record.ocrSize || record.scanning || !record.card.isConnected) return;
    if (automatic && !autoOcr) return;
    record.scanning = true; record.automatic = automatic; record.status = '';
    const seq = ++record.seq;
    render(record);
    try {
      const result = await chrome.runtime.sendMessage({type:'GET_FLOORPLAN', id:record.id, automatic});
      if (seq !== record.seq) return;
      if (result?.status === 'ok') record.ocrSize = result.size;
      else if (result?.status !== 'cancelled') {
        const messages = {
          blocked: 'Floorplan request blocked', busy: 'Queue full; try again',
          unavailable: 'Floorplan unavailable; refresh', download_failed: 'Floorplan could not be downloaded',
          image_unsupported: 'Floorplan image unsupported or too large', engine_error: 'OCR could not start',
          no_text: 'No text recognised', no_area: 'Text found; total area not recognised'
        };
        record.status = messages[result?.status] || 'Floorplan could not be read';
      }
    } catch { if (seq === record.seq) record.status = 'Floorplan could not be read'; }
    if (seq === record.seq) { record.scanning = false; render(record); }
  }
  async function load(card) {
    if (!card.isConnected) return;
    const box = document.createElement('div'); box.className = 'rm-extra-details';
    box.setAttribute('aria-label', 'Additional property details'); box.textContent = 'Loading property details…';
    card.appendChild(box);
    try {
      const result = await chrome.runtime.sendMessage({type:'GET_PROPERTY', id:card.dataset.rmPropertyId});
      if (!result || result.error) {
        box.textContent = result?.error === 'blocked' ? 'Details unavailable: Rightmove blocked automatic requests.' : 'Details could not be loaded.';
        box.classList.add('rm-extra-error'); return;
      }
      const record = {card, box, id:card.dataset.rmPropertyId, data:result.data, hasFloorplan:result.hasFloorplan, seq:0, scanning:false, status:'', ocrSize:null};
      records.set(card, record);
      render(record);
      if (autoOcr) startScan(record, true);
    } catch { box.textContent = 'Details could not be loaded. Reload after updating the extension.'; box.classList.add('rm-extra-error'); }
  }
  let timer;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 250); }).observe(document.documentElement, {childList:true, subtree:true});
  scan();
})();
