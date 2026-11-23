import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeBarcodeFormats,RETAIL_BARCODE_FORMATS,SCANNER_BARCODE_FORMATS,zxingBarcodeFormats} from '../frontend/src/utils/barcodeFormats.js';

test('retail decoder configuration includes EAN-13, EAN-8, UPC-A and UPC-E',()=>{
  assert.deepEqual(RETAIL_BARCODE_FORMATS,['EAN_13','EAN_8','UPC_A','UPC_E']);
});

test('native camera detector requests only formats reported by that phone browser',()=>{
  assert.deepEqual(nativeBarcodeFormats(['ean_13','upc_a','qr_code']),['ean_13','upc_a','qr_code']);
  assert.deepEqual(nativeBarcodeFormats([]),[]);
});

test('ZXing receives every configured retail and 2D format when native detection is unavailable',()=>{
  const BarcodeFormat=Object.fromEntries(SCANNER_BARCODE_FORMATS.map((format)=>[format,format.toLowerCase()]));
  assert.deepEqual(zxingBarcodeFormats(BarcodeFormat),SCANNER_BARCODE_FORMATS.map((format)=>format.toLowerCase()));
});
