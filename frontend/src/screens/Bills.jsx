import {useEffect,useState,useCallback} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {api} from '../services/api';
import {Header,Price,Skeleton,EmptyState,ErrorState,StatusBadge,Button,Input} from '../components/ui';
import InvoiceQr from '../components/InvoiceQr';
import {when,dayKey,shortId,clean} from '../utils/format';
const useLoad=fn=>{const [s,set]=useState({loading:true});const go=useCallback(()=>{set({loading:true});fn().then(d=>set({d}),e=>set({e:e.message}))},[fn]);useEffect(go,[go]);return [s,go]};
const st=o=>String(o.payment?.provider||'').startsWith('mock_')||o.payment?.provider==='mock'?'SIMULATED':o.paymentStatus||o.payment?.status||o.status||'PAID';
const tot=o=>o.totalMinor??o.subtotalMinor;
export function Bills(){
 const nav=useNavigate(),f=useCallback(()=>api.orders(),[]),[s,go]=useLoad(f);
 if(s.loading)return <div className="page"><Header title="My Bills"/><p className="mut" style={{marginTop:-12,marginBottom:12}}>Loading your bills...</p><Skeleton/></div>;
 if(s.e)return <div className="page"><Header title="My Bills"/><ErrorState text={s.e} onRetry={go}/></div>;
 const list=(Array.isArray(s.d)?s.d:s.d.items||s.d.orders||[]);
 if(!list.length)return <div className="page"><Header title="My Bills"/><EmptyState title="No bills yet" text="Your completed purchases will appear here." action="Start scanning" onAction={()=>nav('/scan')}/></div>;
 const g={};list.forEach(o=>(g[dayKey(o.createdAt)]??=[]).push(o));
 return <div className="page"><Header title="My Bills"/>{Object.entries(g).map(([k,os])=><section key={k} style={{marginBottom:20}}><p className="sec" style={{marginBottom:8}}>{k}</p><div className="gap">{os.map(o=><Link key={o.id} to={`/bills/${o.id}`} className="card row sp" style={{textDecoration:'none',color:'inherit'}}><div><b>Order #{shortId(o.id)}</b><p className="mut">{o.items?.reduce((n,i)=>n+i.quantity,0)??o.itemCount??''} items · {when(o.createdAt)}</p></div><div style={{textAlign:'right',display:'grid',gap:4}}><Price minor={tot(o)} cur={o.currency}/><StatusBadge s={st(o)}/></div></Link>)}</div></section>)}</div>;
}
export function BillDetail(){
 const {id}=useParams(),f=useCallback(()=>api.order(id),[id]),[s,go]=useLoad(f);
 const [returns,setReturns]=useState([]),[selected,setSelected]=useState({}),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[returnError,setReturnError]=useState(''),[returnNotice,setReturnNotice]=useState('');
 useEffect(()=>{if(s.d){api.returns(id).then(d=>setReturns(d.items||[])).catch(e=>setReturnError(e.message))}},[s.d,id]);
 if(s.loading)return <div className="page"><Header title="Bill" back/><Skeleton n={4}/></div>;
 if(s.e)return <div className="page"><Header title="Bill" back/><ErrorState text={s.e} onRetry={go}/></div>;
 const o=s.d.order||s.d;const cur=o.currency||o.items?.[0]?.currency;
 const returned=new Map();for(const request of returns)if(request.status!=='REJECTED')for(const item of request.items||[])returned.set(item.orderItemId,(returned.get(item.orderItemId)||0)+item.quantity);
 const returnAge=Date.now()-new Date(o.createdAt).getTime();const canReturn=o.status==='PAID'&&o.payment?.status==='SUCCEEDED'&&returnAge>=0&&returnAge<=30*86400000;
 const submitReturn=async e=>{e.preventDefault();setSaving(true);setReturnError('');setReturnNotice('');try{const items=Object.entries(selected).filter(([,quantity])=>Number(quantity)>0).map(([orderItemId,quantity])=>({orderItemId,quantity:Number(quantity)}));await api.requestReturn(id,{reason,unusedAttested:true,items});setSelected({});setReason('');setReturnNotice('Return request sent for review. Refunds are not automatic.');setReturns((await api.returns(id)).items||[])}catch(err){setReturnError(err.message)}finally{setSaving(false)}};
 return <div className="page"><Header title={`Order #${shortId(o.id)}`} back/>
 <InvoiceQr receiptToken={o.receiptToken}/>
 <div className="card gap"><div className="row sp"><span className="mut">Date</span><span>{when(o.createdAt)}</span></div><div className="row sp"><span className="mut">Payment</span><StatusBadge s={st(o)}/></div></div>
 <p className="sec" style={{margin:'20px 0 8px'}}>Items</p><div className="card gap">{(o.items||[]).map((i,x)=><div key={x} className="row sp"><div><b>{clean(i.productName||i.name)}</b><p className="mut">{i.quantity} × <Price minor={i.unitPriceMinor} cur={cur}/></p></div><Price minor={i.lineTotalMinor??i.unitPriceMinor*i.quantity} cur={cur}/></div>)}</div>
 <div className="card gap" style={{marginTop:16}}><div className="row sp"><span className="mut">Subtotal</span><Price minor={o.subtotalMinor??tot(o)} cur={cur}/></div><div className="row sp"><span className="h2">Total</span><Price minor={tot(o)} cur={cur} className="h1"/></div></div>
 {canReturn&&<section style={{marginTop:18}}><h2 className="h2">Request a return</h2><p className="mut">Within 30 days of purchase for unused items. The store reviews each request before deciding how to handle it.</p><form className="card gap" onSubmit={submitReturn}>
  {(o.items||[]).map(item=>{const remaining=item.quantity-(returned.get(item.id)||0);return <label className="row sp" key={item.id} style={{alignItems:'center'}}><span><input type="checkbox" disabled={remaining<=0} checked={Number(selected[item.id]||0)>0} onChange={e=>setSelected(v=>({...v,[item.id]:e.target.checked?1:0}))}/> {clean(item.productName)} · {remaining} returnable</span><input aria-label={`Quantity to return for ${item.productName}`} type="number" min="1" max={Math.max(1,remaining)} disabled={remaining<=0||!selected[item.id]} value={selected[item.id]||1} onChange={e=>setSelected(v=>({...v,[item.id]:Number(e.target.value)}))} style={{width:74}}/></label>})}
  <Input label="Reason for return" value={reason} onChange={e=>setReason(e.target.value)} minLength={3} maxLength={500} required/>
  <label className="row"><input type="checkbox" required/> I confirm the selected items are unused.</label>
  {returnError&&<p role="alert" className="ferr">{returnError}</p>}{returnNotice&&<p role="status" className="auth-notice">{returnNotice}</p>}
  <Button type="submit" loading={saving} disabled={!Object.values(selected).some(Number)}>Submit return request</Button>
 </form></section>}
 {returns.length>0&&<section style={{marginTop:18}}><h2 className="h2">Return history</h2><div className="gap">{returns.map(r=><article key={r.id} className="card gap"><div className="row sp"><b>Return #{shortId(r.id)}</b><StatusBadge s={r.status}/></div><p className="mut">{clean(r.reason)} · {when(r.createdAt)}</p><p>{r.refundStatus==='SIMULATED'?'Refund simulated; no money was moved.':r.refundStatus==='CASH_PAID_OUT'?'Cash refund recorded as paid out.':'Refund is decided by the store after review.'}</p></article>)}</div></section>}
 </div>;
}
