import {useState} from 'react';
import {useNavigate,Link} from 'react-router-dom';
import {api} from '../services/api';
import {useApp} from '../context/AppContext';
import {Header,Button,Price,Icon,EmptyState} from '../components/ui';
import InvoiceQr from '../components/InvoiceQr';
import {clean,when,shortId} from '../utils/format';
const KEY='sk_idem';
const newKey=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export default function Checkout(){
 const {cart,loadCart}=useApp(),nav=useNavigate(),[st,setSt]=useState('review'),[order,setOrder]=useState(null),[err,setErr]=useState(''),[method,setMethod]=useState('CASH');
 // Same idempotency key is reused for retries of the same attempt (network error / pending); cleared after a definitive result.
 const pay=async()=>{if(st==='processing')return;setSt('processing');setErr('');const key=`${KEY}_${method}`;let k=sessionStorage.getItem(key);if(!k){k=newKey();sessionStorage.setItem(key,k)}
  try{const r=await api.checkout(k,method);const d=r.data||{};const o=d.order||d;setOrder(o);
   if(method==='CASH'){sessionStorage.removeItem(key);setSt('success');await loadCart();return}
   const s=String(o.paymentStatus||o.payment?.status||o.status||'').toUpperCase();
   if(r.status===202||/PEND|PROC/.test(s)){setSt('pending')}else{sessionStorage.removeItem(key);setSt('success');loadCart()}}
  catch(e){if(e.code==='PAYMENT_DECLINED'||e.status===409||e.status===400)sessionStorage.removeItem(key);setErr(e.message);setSt('failed');if(e.status===409)loadCart()}};
 const oid=order?.id;
 if(st==='success')return <div className="page" style={{textAlign:'center',paddingTop:72}}><div style={{width:72,height:72,borderRadius:'50%',background:'var(--acc)',color:'#fff',display:'grid',placeItems:'center',margin:'0 auto 20px',animation:'pop .4s'}}><Icon n="check" s={36}/></div><h1 className="h1">Order placed</h1><p className="mut">{order?.payment?.provider==='cash_on_delivery'?'Pay cash when your order is handed over.':'Your order was recorded.'}</p>
  <div className="card gap" style={{margin:'24px 0',textAlign:'left'}}><div className="row sp"><span className="mut">Order ID</span><b>{shortId(oid)}</b></div><div className="row sp"><span className="mut">Total</span><Price minor={order.totalMinor??order.subtotalMinor} cur={order.currency}/></div><div className="row sp"><span className="mut">Date</span><span>{when(order.createdAt||Date.now())}</span></div></div>
  <InvoiceQr orderId={oid}/>
  <div className="gap">{oid&&<Button onClick={()=>nav(`/bills/${oid}`)}>View bill</Button>}<Button variant="sec2" onClick={()=>nav('/')}>Done</Button></div></div>;
 if(st==='pending')return <div className="page" style={{textAlign:'center',paddingTop:72}}><span className="spin" style={{width:40,height:40,color:'var(--warn)'}}/><h1 className="h1" style={{marginTop:20}}>Order processing</h1><p className="mut" style={{margin:'6px 0 24px'}}>No payment was collected. Check your orders before trying again.</p><Button onClick={()=>nav('/bills')}>View my orders</Button></div>;
 if(!cart?.items?.length)return <div className="page"><Header title="Checkout" back/><EmptyState title="Your cart is empty" text="Scan a product to get started." action="Start scanning" onAction={()=>nav('/scan')}/></div>;
 const cur=cart.items[0].currency;
 return <div className="page"><Header title="Review your purchase" back/>
 <div className="card gap">{cart.items.map(i=><div key={i.barcode} className="row sp"><span>{clean(i.name)} <span className="mut">× {i.quantity}</span></span><Price minor={i.lineTotalMinor} cur={cur}/></div>)}</div>
 <div className="card gap" style={{margin:'16px 0'}}><div className="row sp"><span className="mut">Subtotal</span><Price minor={cart.subtotalMinor} cur={cur}/></div><div className="row sp"><span className="h2">Total</span><Price minor={cart.subtotalMinor} cur={cur} className="h1"/></div></div>
 <section className="payment-methods" aria-labelledby="payment-title"><div><p className="eyebrow">HOW WOULD YOU LIKE TO PAY?</p><h2 id="payment-title">Payment method</h2></div>
  <button type="button" className={`payment-option ${method==='CASH'?'selected':''}`} onClick={()=>setMethod('CASH')} aria-pressed={method==='CASH'}><span className="payment-radio"/><span className="payment-copy"><b>Cash at hand-off</b><small>Pay when you collect your order</small></span><span className="payment-tag">Available</span></button>
  <div className="payment-option unavailable" aria-disabled="true"><span className="payment-radio"/><span className="payment-copy"><b>UPI apps</b><small>PhonePe · Google Pay · Paytm</small></span><span className="payment-tag">Gateway setup needed</span></div>
  <div className="payment-option unavailable" aria-disabled="true"><span className="payment-radio"/><span className="payment-copy"><b>Debit or credit card</b><small>Cards are processed securely by a payment gateway</small></span><span className="payment-tag">Gateway setup needed</span></div>
 </section>
 {st==='failed'&&<p className="ferr" role="alert" style={{marginBottom:12,fontSize:14}}>{err||'Payment could not be completed.'}</p>}
 <Button loading={st==='processing'} onClick={pay}>{st==='processing'?'Placing order...':st==='failed'?'Try again':'Place order · Pay cash'}</Button>
 <p className="mut" style={{textAlign:'center',marginTop:12}}>Online payments are not connected yet. <Link to="/cart" style={{color:'var(--acc)'}}>Edit basket</Link></p></div>;
}
