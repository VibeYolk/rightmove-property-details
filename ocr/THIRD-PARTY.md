# OCR components

These files are bundled for local OCR and do not need a remote CDN.

- `tesseract.min.js`, `worker.min.js`: `tesseract.js` 7.0.0, Apache-2.0, https://github.com/naptha/tesseract.js. See `TESSERACT-JS-LICENSE.md` and the accompanying `.LICENSE.txt` files.
- `tesseract-core.wasm.js`, `tesseract-core.wasm`: `tesseract.js-core` 7.0.0, Apache-2.0, https://github.com/naptha/tesseract.js-core. See `TESSERACT-CORE-LICENSE.txt`.
- `eng.traineddata.gz`: `@tesseract.js-data/eng` 1.0.0 (`4.0.0_best_int`), npm package metadata declares MIT, https://github.com/naptha/tessdata. The npm package itself does not contain a separate license file. The upstream [tessdata documentation](https://github.com/naptha/tessdata/blob/gh-pages/README.md) describes this as an integerized version of Tessdata Best. The [Tessdata Best repository](https://github.com/tesseract-ocr/tessdata_best) licenses its data under Apache-2.0; the full Apache-2.0 text is included in `TESSERACT-CORE-LICENSE.txt`.

SHA-256 hashes of bundled files:

```
000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e  tesseract.min.js
576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d  worker.min.js
0bc6ce3e5fbbd0cd89706cf2fd70960e3372f4f01ee24265b26990808aaeb286  tesseract-core.wasm.js
c7f5ace62ac0ad065e71e9c6725f1d7cdf82e7eda8fba532cbb9563964da7098  tesseract-core.wasm
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  eng.traineddata.gz
```

## Bundled JavaScript notices

The bundled worker includes components whose upstream license texts are provided in the [licenses](licenses/) directory: buffer (MIT), ieee754 (BSD-3-Clause), regenerator-runtime (MIT), and zlib.js (MIT). The accompanying .LICENSE.txt files retain the notices emitted by the upstream bundles. The core also depends on native upstream libraries; see [tesseract.js-core third_party](https://github.com/naptha/tesseract.js-core/tree/master/third_party) for its dependencies and notices.
