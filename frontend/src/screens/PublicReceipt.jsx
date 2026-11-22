import {useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
import {api} from '../services/api';
import {Header,Price,ErrorState,Skeleton} from '../components/ui';
import {when,clean} from '../utils/format';

export default function PublicReceipt(){
 const {token}=useParams(),[state,setState]=useState({loading:true});
 useEffect(()=>{
  let active=true;
  api.receipt(token).then(data=>{if(active)setState({receipt:data.receipt})}).catch(error=>{if(active)setState({error:error.message})});
  return()=>{active=false};
 },[token]);
 if(state.loading)return <div className="page"><Header title="Receipt verification"/><Skeleton n={3}/></div>;
 if(state.error)return <div className="page"><Header title="Receipt verification"/><ErrorState title="Receipt unavailable" text={state.error}/></div>;
 const receipt=state.receipt;
 return <div className="page receipt-page">
  <Header title="Receipt verification"/>
  <section className="card gap">
   <span className="pill" style={{width:'fit-content',background:'var(--mint)',color:'var(--ink)'}}>✓ Valid SnapKart receipt</span>
   <div><p className="eyebrow">PURCHASE VERIFIED</p><h1 className="h1">Receipt confirmed</h1><p className="mut">This purchase is recorded in SnapKart.</p></div>
   <div className="row sp"><span className="mut">Receipt</span><b>#{receipt.receiptNumber}</b></div>
   <div className="row sp"><span className="mut">Date</span><span>{when(receipt.createdAt)}</span></div>
  </section>
  <p className="sec" style={{margin:'20px 0 8px'}}>Items</p>
  <section className="card gap">{receipt.items.map((item,index)=><div className="row sp" key={`${item.name}-${index}`}>
   <div><b>{clean(item.name)}</b><p className="mut">{item.quantity} × <Price minor={item.unitPriceMinor} cur={receipt.currency}/></p></div>
   <Price minor={item.lineTotalMinor} cur={receipt.currency}/>
  </div>)}</section>
  <section className="card gap" style={{marginTop:16}}>
   <div className="row sp"><span className="mut">Payment method</span><span>{receipt.paymentMethod}</span></div>
   <div className="row sp"><span className="mut">Payment status</span><b>{receipt.paymentStatus}</b></div>
   <div className="row sp"><span className="h2">Total</span><Price minor={receipt.totalMinor} cur={receipt.currency} className="h1"/></div>
  </section>
 </div>;
}
