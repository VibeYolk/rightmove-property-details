// All OCR code and the English model are bundled with the extension.
let workerPromise;
function worker() {
  if (!workerPromise) workerPromise = Tesseract.createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
    corePath: chrome.runtime.getURL('ocr/tesseract-core.wasm.js'),
    langPath: chrome.runtime.getURL('ocr'),
    workerBlobURL: false,
    cacheMethod: 'none',
    gzip: true
  }).catch(error => { workerPromise = null; throw error; });
  return workerPromise;
}
async function recognize(image) {
  if (typeof image !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(image) || image.length > 12 * 1024 * 1024) return {error:'image_invalid'};
  // Decode locally with browser image APIs; cap dimensions to bound OCR memory.
  let bitmap;
  try {
    const blob = await (await fetch(image)).blob();
    bitmap = await createImageBitmap(blob);
  } catch { return {error:'image_invalid'}; }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 25_000_000) return {error:'image_invalid'};
    const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    try {
      const result = await (await worker()).recognize(canvas);
      return {text: result?.data?.text || ''};
    } catch { return {error:'engine_error'}; }
  } finally { bitmap.close(); }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'floorplan-ocr' || message.type !== 'OCR_IMAGE') return;
  recognize(message.image).then(respond, () => respond({error:'engine_error'}));
  return true;
});
