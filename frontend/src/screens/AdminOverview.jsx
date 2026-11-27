import {useCallback,useEffect,useMemo,useState} from 'react';
import {api} from '../services/api';
import {clean,shortId,when} from '../utils/format';
import {Price,StatusBadge} from '../components/ui';

const dayString=date=>date.toISOString().slice(0,10);
const money=(minor,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:0}).format((minor||0)/100);

export default function AdminOverview({summary,onOpen}){
 const [days,setDays]=useState(7),[sales,setSales]=useState(null),[demand,setDemand]=useState(null),[orders,setOrders]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  const end=new Date(),start=new Date();start.setUTCDate(start.getUTCDate()-(days-1));
  const results=await Promise.allSettled([
   api.adminSales(dayString(start),dayString(end),days===7?'day':'week'),
   api.adminDemand(`${dayString(start)}T00:00:00.000Z`,`${dayString(end)}T23:59:59.999Z`),
   api.adminOrders(1,5),
  ]);
  const messages=[];
  if(results[0].status==='fulfilled')setSales(results[0].value);else messages.push(results[0].reason?.message||'Sales could not be loaded');
  if(results[1].status==='fulfilled')setDemand(results[1].value);else messages.push(results[1].reason?.message||'Demand could not be loaded');
  if(results[2].status==='fulfilled')setOrders(results[2].value.items||[]);else messages.push(results[2].reason?.message||'Recent orders could not be loaded');
  setError(messages.join(' · '));setBusy(false);
 },[days]);
 useEffect(()=>{load()},[load]);
 const chart=useMemo(()=>{
  const items=sales?.items||[];
  const currencies=[...new Set(items.map(x=>x.currency))];
  return currencies.map(currency=>{
   let rows;
   if(sales.interval==='day'){
    const start=new Date(`${sales.from}T00:00:00Z`);rows=[];
    for(let offset=0;offset<days;offset++){const date=new Date(start);date.setUTCDate(start.getUTCDate()+offset);const key=dayString(date);const existing=items.find(x=>x.currency===currency&&x.date===key);rows.push(existing||{date:key,currency,orders:0,netSalesMinor:0})}
   }else rows=items.filter(x=>x.currency===currency);
   const max=Math.max(...rows.map(x=>x.netSalesMinor||0),1);
   return {currency,rows:rows.map(x=>({...x,height:x.netSalesMinor>0?Math.max(5,(x.netSalesMinor/max)*100):0}))};
  });
 },[sales,days]);
 const topDemand=(demand?.items||[]).slice(0,5);
 const maxDemand=Math.max(1,...topDemand.map(x=>x.purchasedUnits||x.cartAdds||x.scans||0));

 return <section className="admin-overview">
  <div className="admin-section-heading"><div><p className="eyebrow">STORE PERFORMANCE</p><h2 className="h1">Dashboard overview</h2><p className="mut">Live figures from SnapKart’s catalog, orders, sales and demand records.</p></div><div className="admin-period"><label className="field"><span>Sales period</span><select className="inp" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label><button className="admin-refresh" onClick={load} disabled={busy}>{busy?'Refreshing…':'Refresh'}</button></div></div>
  {error&&<p role="status" className="admin-data-note">Some overview data did not load: {error}</p>}
  <div className="admin-stats">
   <button className="admin-stat" onClick={()=>onOpen('inventory')}><span>Active products</span><strong>{summary?.products??'—'}</strong><small>Open inventory →</small></button>
   <div className="admin-stat"><span>Customers</span><strong>{summary?.customers??'—'}</strong><small>Registered customer accounts</small></div>
   <button className="admin-stat" onClick={()=>onOpen('orders')}><span>All orders</span><strong>{summary?.orders??'—'}</strong><small>Open order management →</small></button>
   <div className="admin-stat"><span>Net paid revenue</span><strong className="admin-revenue">{summary?money(summary.revenueMinor):'—'}</strong><small>Real payments less completed refunds</small></div>
  </div>
  <div className="admin-overview-columns">
   <div className="admin-overview-main">
    <article className="admin-panel admin-sales-panel"><div className="admin-panel-heading"><div><h3>Net sales</h3><p className="mut">Paid orders less completed returns · {days} days</p></div><button className="admin-text-link" onClick={()=>onOpen('analytics')}>Full analytics →</button></div>
     {!sales?.items?.length?<div className="admin-empty">No paid sales recorded in this period.</div>:chart.map(group=><div className="admin-chart-group" key={group.currency}><div className="admin-chart-total"><span>{group.currency} net sales</span><strong>{money(group.rows.reduce((n,x)=>n+(x.netSalesMinor||0),0),group.currency)}</strong></div><div className="admin-chart" role="img" aria-label={`Net sales trend in ${group.currency}`} style={{gridTemplateColumns:`repeat(${group.rows.length},minmax(0,1fr))`}}>
      {group.rows.map(row=><div className="admin-chart-column" key={`${row.date}-${row.currency}`} title={`${row.date}: ${money(row.netSalesMinor,row.currency)}`}><div className="admin-bar-track"><span className="admin-bar" style={{height:`${row.height}%`}}/></div><small>{row.date.slice(5)}</small></div>)}
     </div></div>)}
    </article>
    <article className="admin-panel"><div className="admin-panel-heading"><div><h3>Product demand</h3><p className="mut">Real scans, cart activity and purchases · {days} days</p></div><button className="admin-text-link" onClick={()=>onOpen('analytics')}>View analytics →</button></div>
     {!topDemand.length?<div className="admin-empty">No demand events recorded in this period.</div>:<div className="admin-demand-list">{topDemand.map(row=>{const signal=row.purchasedUnits||row.cartAdds||row.scans||0;return <div className="admin-demand-row" key={row.product.id}><div className="admin-demand-title"><strong>{clean(row.product.name)}</strong><span>{row.purchasedUnits} purchased · {row.cartAdds} cart adds · {row.scans} scans</span></div><div className="admin-demand-track"><span style={{width:`${Math.max(4,(signal/maxDemand)*100)}%`}}/></div><small>{row.product.stock} in stock</small></div>})}</div>}
    </article>
   </div>
   <aside className="admin-overview-side"><article className="admin-panel"><div className="admin-panel-heading"><div><h3>Recent orders</h3><p className="mut">Latest orders in the system</p></div><button className="admin-text-link" onClick={()=>onOpen('orders')}>All orders →</button></div>
    {!orders.length?<div className="admin-empty">No orders recorded yet.</div>:<div className="admin-recent-orders">{orders.map(order=><div className="admin-order-row" key={order.id}><div className="admin-order-person"><strong>{clean(order.user?.name)||clean(order.user?.email)||'Customer'}</strong><span>{shortId(order.id)} · {when(order.createdAt)}</span><span>{order.items?.reduce((n,item)=>n+item.quantity,0)||0} items</span></div><div className="admin-order-amount"><Price minor={order.subtotalMinor} cur={order.currency}/><StatusBadge s={String(order.payment?.provider||'').startsWith('mock_')?'SIMULATED':order.payment?.provider==='mock'?'NOT_COLLECTED':order.payment?.status||order.status}/></div></div>)}</div>}
   </article><article className="admin-panel admin-quick-panel"><h3>Store operations</h3><button onClick={()=>onOpen('receiving')}>Receive stock <span>→</span></button><button onClick={()=>onOpen('returns')}>Review returns <span>→</span></button><button onClick={()=>onOpen('staff')}>Gate staff access <span>→</span></button></article></aside>
  </div>
 </section>;
}
