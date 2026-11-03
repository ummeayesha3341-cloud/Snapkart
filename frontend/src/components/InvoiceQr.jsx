import {QRCodeSVG} from 'qrcode.react';

export default function InvoiceQr({orderId}){
 if(!orderId)return null;
 // The encoded destination remains protected by the existing account login and order ownership checks.
 const invoiceUrl=new URL(`/bills/${encodeURIComponent(orderId)}`,window.location.origin).toString();
 return <section className="invoice-qr" aria-label="Invoice QR code">
  <p className="sec">Your invoice QR</p>
  <div className="invoice-qr-code"><QRCodeSVG value={invoiceUrl} size={188} level="M" marginSize={2} fgColor="#153e2c" bgColor="#ffffff" title={`SnapKart invoice ${orderId}`}/></div>
  <p className="mut">Scan to open this invoice in SnapKart. Sign in to the account that placed the order.</p>
 </section>;
}
