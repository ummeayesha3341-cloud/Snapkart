import {QRCodeSVG} from 'qrcode.react';

export default function InvoiceQr({receiptToken}){
 if(!receiptToken)return null;
 const invoiceUrl=new URL(`/receipt/${encodeURIComponent(receiptToken)}`,window.location.origin).toString();
 return <section className="invoice-qr" aria-label="Invoice QR code">
  <p className="sec">Your receipt verification QR</p>
  <div className="invoice-qr-code"><QRCodeSVG value={invoiceUrl} size={188} level="M" marginSize={2} fgColor="#153e2c" bgColor="#ffffff" title="Verify SnapKart receipt"/></div>
  <p className="mut">The QR verifies the receipt record only; it does not confirm the contents of the bag. No sign-in is required.</p>
 </section>;
}
