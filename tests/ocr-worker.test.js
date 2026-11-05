const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const errors = [];
const diagnostics = [];
const imports = [];
const sandbox = {
  URL,
  self: { location: { href: 'chrome-extension://example/ocr-worker.js' } },
  importScripts: url => imports.push(url),
  console: {
    error: (...args) => errors.push(args),
    debug: (...args) => diagnostics.push(args)
  }
};
const script = fs.readFileSync(path.join(__dirname, '..', 'ocr-worker.js'), 'utf8');
vm.runInNewContext(script, sandbox);
assert.deepEqual(imports, ['chrome-extension://example/ocr/worker.min.js']);

sandbox.console.error('Image too small to scale!! (2x36 vs min width of 3)');
sandbox.console.error('Line cannot be recognized!!');
assert.equal(diagnostics.length, 2);
assert.equal(errors.length, 0);

// Unrelated errors, unusual variants, Error objects and multiple arguments
// remain untouched so actual failures are not hidden.
const failure = new Error('worker failed');
sandbox.console.error('Failed to initialise OCR');
sandbox.console.error('Image too small to scale!! unexpected');
sandbox.console.error(failure);
sandbox.console.error('Line cannot be recognized!!', 'extra context');
assert.equal(errors.length, 4);
assert.deepEqual(errors[0], ['Failed to initialise OCR']);
assert.equal(errors[2][0], failure);
console.log('OCR worker diagnostic tests passed');
