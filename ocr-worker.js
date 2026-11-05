'use strict';

// Tesseract may report that a tiny segmented region or line cannot be read
// even while the surrounding image is recognised successfully. Chromium
// records console.error from an extension worker as an extension error, so
// keep these two known diagnostics at debug level. All other errors remain
// visible, and OCR failures are still reported through the worker response.
(() => {
  const originalError = console.error.bind(console);
  console.error = (...args) => {
    const message = args.length === 1 && typeof args[0] === 'string' ? args[0] : '';
    if (/^Image too small to scale!! \(\d+x\d+ vs min width of \d+\)$/.test(message) ||
        message === 'Line cannot be recognized!!') {
      console.debug('[OCR diagnostic]', message);
      return;
    }
    originalError(...args);
  };

  // Both scripts are bundled locally with the extension; no network code loads.
  importScripts(new URL('ocr/worker.min.js', self.location.href).href);
})();
