// Keep camera and decoder format lists aligned. These are the retail 1D formats
// SnapKart supports; 2D formats remain available for non-product workflows.
export const RETAIL_BARCODE_FORMATS = Object.freeze([
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
]);

export const OTHER_BARCODE_FORMATS = Object.freeze([
  'CODE_128',
  'CODE_39',
  'ITF',
  'QR_CODE',
  'DATA_MATRIX',
]);

export const SCANNER_BARCODE_FORMATS = Object.freeze([
  ...RETAIL_BARCODE_FORMATS,
  ...OTHER_BARCODE_FORMATS,
]);

const NATIVE_FORMATS = Object.freeze({
  EAN_13: 'ean_13', EAN_8: 'ean_8', UPC_A: 'upc_a', UPC_E: 'upc_e',
  CODE_128: 'code_128', CODE_39: 'code_39', ITF: 'itf',
  QR_CODE: 'qr_code', DATA_MATRIX: 'data_matrix',
});

export function nativeBarcodeFormats(supportedFormats = []) {
  const supported = new Set(supportedFormats);
  return SCANNER_BARCODE_FORMATS
    .map((format) => NATIVE_FORMATS[format])
    .filter((format) => supported.has(format));
}

export function zxingBarcodeFormats(BarcodeFormat) {
  return SCANNER_BARCODE_FORMATS.map((name) => BarcodeFormat[name]).filter(Boolean);
}
