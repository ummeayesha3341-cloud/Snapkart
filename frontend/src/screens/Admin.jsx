import {useCallback,useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {api} from '../services/api';
import {Button,Input,Price,StatusBadge} from '../components/ui';
import {clean,shortId,when} from '../utils/format';
import AdminAnalytics from './AdminAnalytics';
import AdminReturns from './AdminReturns';
import AdminStaffAccess from './AdminStaffAccess';
import AdminReceiving from './AdminReceiving';
import AdminOverview from './AdminOverview';

const moneyValue=p=>(Number(p.priceMinor||0)/100).toFixed(2);
const blankProduct={barcode:'',name:'',description:'',category:'',brand:'',supplier:'',price:'',stock:'0',currency:'INR'};

export default function Admin(){
 const {notify,logout,user}=useApp(),navigate=useNavigate();
 const [tab,setTab]=useState('overview'),[summary,setSummary]=useState(null),[summaryError,setSummaryError]=useState('');
 const [products,setProducts]=useState([]),[total,setTotal]=useState(0),[query,setQuery]=useState(''),[lowOnly,setLowOnly]=useState(false),[loadingProducts,setLoadingProducts]=useState(false);
 const [orders,setOrders]=useState([]),[orderTotal,setOrderTotal]=useState(0),[orderPage,setOrderPage]=useState(1),[orderStatus,setOrderStatus]=useState(''),[loadingOrders,setLoadingOrders]=useState(false);
 const [showCreate,setShowCreate]=useState(false),[createForm,setCreateForm]=useState(blankProduct),[saving,setSaving]=useState(false),[editing,setEditing]=useState(null),[editForm,setEditForm]=useState({}),[adjusting,setAdjusting]=useState(null),[delta,setDelta]=useState(''),[reason,setReason]=useState('');
 const [historyProduct,setHistoryProduct]=useState(''),[historyItems,setHistoryItems]=useState([]),[loadingHistory,setLoadingHistory]=useState(false);

 const loadSummary=useCallback(async()=>{try{setSummary(await api.adminSummary());setSummaryError('')}catch(e){setSummaryError(e.message)}},[]);
 const loadProducts=useCallback(async()=>{setLoadingProducts(true);try{const d=await api.adminInventory(query,lowOnly?5:undefined,1,50);setProducts(d.items||[]);setTotal(d.total||0)}catch(e){notify(e.message,true)}finally{setLoadingProducts(false)}},[query,lowOnly,notify]);
 const loadOrders=useCallback(async(page=orderPage,status=orderStatus)=>{setLoadingOrders(true);try{const d=await api.adminOrders(page,20,status);setOrders(d.items||[]);setOrderTotal(d.total||0);setOrderPage(d.page||page)}catch(e){notify(e.message,true)}finally{setLoadingOrders(false)}},[orderPage,orderStatus,notify]);
 useEffect(()=>{loadSummary()},[loadSummary]);
 useEffect(()=>{const timer=setTimeout(loadProducts,250);return()=>clearTimeout(timer)},[loadProducts]);
 useEffect(()=>{if(tab==='orders')loadOrders(1,orderStatus)},[tab,orderStatus]);

 const field=(form,setter,key,label,type='text',props={})=>{if(typeof type==='object'){props=type;type='text'}return <Input label={label} type={type} value={form[key]??''} onChange={e=>setter({...form,[key]:e.target.value})} {...props}/>};
 const createProduct=async e=>{e.preventDefault();setSaving(true);try{await api.adminCreateProduct({...createForm,priceMinor:Math.round(Number(createForm.price)*100),stock:Number(createForm.stock),currency:createForm.currency.toUpperCase()});setCreateForm(blankProduct);setShowCreate(false);notify('Product created');await Promise.all([loadProducts(),loadSummary()])}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const saveProduct=async e=>{e.preventDefault();setSaving(true);try{await api.adminUpdateProduct(editing,{...editForm,priceMinor:Math.round(Number(editForm.price)*100),currency:editForm.currency.toUpperCase()});setEditing(null);notify('Product updated');await loadProducts()}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const collectCash=async id=>{setSaving(true);try{await api.adminCollectCash(id);notify('Cash payment recorded');await Promise.all([loadOrders(),loadSummary()])}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const adjustStock=async e=>{e.preventDefault();if(!adjusting)return;setSaving(true);try{await api.adminAdjustStock(adjusting,{delta:Number(delta),reason});setAdjusting(null);setDelta('');setReason('');notify('Inventory updated');await Promise.all([loadProducts(),loadSummary()])}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const toggleHistory=async id=>{if(historyProduct===id){setHistoryProduct('');setHistoryItems([]);return}setHistoryProduct(id);setLoadingHistory(true);try{const data=await api.adminInventoryHistory(id);setHistoryItems(data.items||[])}catch(err){notify(err.message,true);setHistoryItems([])}finally{setLoadingHistory(false)}};
 const startEdit=p=>{setEditing(p.id);setEditForm({barcode:p.barcode,name:p.name,description:p.description||'',category:p.category||'',brand:p.brand||'',supplier:p.supplier||'',price:moneyValue(p),currency:p.currency,active:p.active})};

 const sections=[['overview','Overview'],['inventory','Products & inventory'],['receiving','Stock receiving'],['orders','Orders'],['analytics','Sales & demand'],['returns','Returns'],['staff','Gate staff']];
 return <div className="admin-layout">
  <aside className="admin-sidebar"><a className="admin-brand" href="/admin" onClick={e=>{e.preventDefault();setTab('overview')}}><span className="admin-brand-mark">▣</span><span><strong>SnapKart</strong><small>STORE OPERATIONS</small></span></a><nav className="admin-nav" aria-label="Admin sections">{sections.map(([id,label])=><button type="button" key={id} className={`admin-nav-item section-${id} ${tab===id?'active':''}`} onClick={()=>setTab(id)}><span className="admin-nav-icon" aria-hidden="true">{({overview:'⌂',inventory:'▦',receiving:'↓',orders:'▤',analytics:'↗',returns:'↶',staff:'♙'})[id]}</span>{label}</button>)}</nav><div className="admin-sidebar-bottom"><p>Signed in as</p><strong>{clean(user?.name)||clean(user?.email)}</strong><small>{clean(user?.email)}</small><button type="button" onClick={()=>navigate('/admin/security')}>Account security</button><button type="button" onClick={async()=>{await logout();navigate('/login',{replace:true})}}>Sign out</button></div></aside>
  <main className="admin-main"><header className="admin-topbar"><div><p className="eyebrow">SNAPKART · STORE OPERATIONS</p><h1>Admin dashboard</h1></div><div className="admin-top-actions"><span className="admin-signed-in">{clean(user?.email)}</span><button className="admin-profile" type="button" aria-label="Account security" onClick={()=>navigate('/admin/security')}>{(clean(user?.name)||clean(user?.email)||'A').slice(0,1).toUpperCase()}</button><button className="admin-signout" type="button" onClick={async()=>{await logout();navigate('/login',{replace:true})}}>Sign out</button></div></header>
  <div className={`admin-content ${tab==='overview'?'dashboard-overview-active':''}`}>
  {summaryError&&<div className="card" style={{marginBottom:12}}><p className="ferr">{summaryError}</p><Button variant="sm sec2" style={{marginTop:10}} onClick={loadSummary}>Retry summary</Button></div>}
  {tab==='overview'&&<AdminOverview summary={summary} onOpen={setTab}/>}
  {tab==='inventory'&&<section>
   <div className="row sp" style={{marginBottom:8}}><h2 className="h1">Inventory <span className="mut">({total})</span></h2><Button variant="sm" onClick={()=>setShowCreate(v=>!v)}>{showCreate?'Close':'Add product'}</Button></div>
   <Input label="Search products or barcode" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search inventory"/>
   <Button variant="sec2" style={{marginBottom:12}} onClick={()=>setLowOnly(v=>!v)}>{lowOnly?'Showing stock ≤ 5 · Show all':'Show low stock only'}</Button>
   {showCreate&&<form className="card gap" style={{marginBottom:14}} onSubmit={createProduct}>
    <h3 className="h2">New product</h3>
    {field(createForm,setCreateForm,'name','Product name',{required:true})}
    {field(createForm,setCreateForm,'barcode','Barcode / scan code',{required:true})}
    {field(createForm,setCreateForm,'price','Price (₹)', 'number',{required:true,min:'0.01',step:'0.01'})}
    {field(createForm,setCreateForm,'stock','Opening stock','number',{required:true,min:0,step:1})}
    {field(createForm,setCreateForm,'category','Category')}{field(createForm,setCreateForm,'brand','Brand')}
    {field(createForm,setCreateForm,'supplier','Supplier')}{field(createForm,setCreateForm,'description','Description')}
    <Button type="submit" loading={saving}>Save product</Button>
   </form>}
   {loadingProducts&&!products.length?<p className="mut">Loading inventory…</p>:!products.length?<div className="card"><p className="mut">No products found.</p></div>:<div className="gap">
    {products.map(p=><article className="card gap" key={p.id}>
     {editing===p.id?<form className="gap" onSubmit={saveProduct}>
      <h3 className="h2">Edit product</h3>
      {field(editForm,setEditForm,'name','Name',{required:true})}{field(editForm,setEditForm,'barcode','Barcode',{required:true})}
      {field(editForm,setEditForm,'price','Price (₹)','number',{required:true,min:'0.01',step:'0.01'})}{field(editForm,setEditForm,'currency','Currency')}
      {field(editForm,setEditForm,'category','Category')}{field(editForm,setEditForm,'brand','Brand')}{field(editForm,setEditForm,'supplier','Supplier')}
      {field(editForm,setEditForm,'description','Description')}
      <label className="row"><input type="checkbox" checked={!!editForm.active} onChange={e=>setEditForm({...editForm,active:e.target.checked})}/> Product active</label>
      <div className="row"><Button type="submit" loading={saving}>Save</Button><Button type="button" variant="sec2" onClick={()=>setEditing(null)}>Cancel</Button></div>
     </form>:<>
      <div className="row sp"><div><h3 className="h2">{clean(p.name)}</h3><p className="mut">{clean(p.barcode)} · {[p.brand,p.category].filter(Boolean).map(clean).join(' · ')}</p></div><span className={`pill ${p.active?'':'err'}`}>{p.active?'Active':'Inactive'}</span></div>
      <div className="row sp"><span>Stock: <strong>{p.stock}</strong></span><Price minor={p.priceMinor} cur={p.currency}/></div>
      <div className="row"><Button variant="sec2" onClick={()=>startEdit(p)}>Edit</Button><Button variant="sec2" onClick={()=>{setAdjusting(adjusting===p.id?null:p.id);setDelta('');setReason('')}}>{adjusting===p.id?'Close stock form':'Adjust stock'}</Button><Button variant="sec2" onClick={()=>toggleHistory(p.id)}>{historyProduct===p.id?'Hide history':'Stock history'}</Button></div>
      {adjusting===p.id&&<form className="card gap" onSubmit={adjustStock}>
       <h4 className="h2">Adjust stock for {clean(p.name)}</h4>
       <Input label="Quantity change (+5 or -2)" type="number" min={-p.stock} max={99999} step="1" required value={delta} onChange={e=>setDelta(e.target.value)}/>
       <Input label="Reason" required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Delivery received, damaged item, correction…"/>
       <Button type="submit" loading={saving} disabled={!Number(delta)}>Apply adjustment</Button>
      </form>}
      {historyProduct===p.id&&<div className="card gap"><h4 className="h2">Stock movement history</h4>{loadingHistory?<p className="mut">Loading history…</p>:!historyItems.length?<p className="mut">No stock movements recorded yet.</p>:historyItems.map(movement=><div className="row sp" key={movement.id} style={{borderBottom:'1px solid var(--line)',paddingBottom:9}}><div><strong>{movement.movementType.replaceAll('_',' ')}</strong><p className="mut">{clean(movement.reason)} · {when(movement.createdAt)}</p><p className="mut">{movement.adminUser?`By ${clean(movement.adminUser.name)}`:'System'}{movement.order?` · Order ${shortId(movement.order.id)}`:''}{movement.stockReceipt?` · ${clean(movement.stockReceipt.supplier)} ${movement.stockReceipt.deliveryReference?`(${clean(movement.stockReceipt.deliveryReference)})`:''}`:''}</p></div><div style={{textAlign:'right'}}><strong>{movement.delta>0?'+':''}{movement.delta}</strong><p className="mut">Balance {movement.resultingStock}</p></div></div>)}</div>}
     </>}
    </article>)}
   </div>}
  </section>}
  {tab==='receiving'&&<AdminReceiving onInventoryChanged={async()=>{await Promise.all([loadProducts(),loadSummary()])}}/>}
  {tab==='orders'&&<section>
   <div className="row sp" style={{marginBottom:12}}><h2 className="h1">Orders</h2><select className="inp" aria-label="Filter order status" style={{width:'auto'}} value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}><option value="">All statuses</option><option value="PAID">Paid</option><option value="PENDING_PAYMENT">Pending payment</option><option value="PAYMENT_FAILED">Payment failed</option><option value="CANCELLED">Cancelled</option></select></div>
   {loadingOrders&&!orders.length?<p className="mut">Loading orders…</p>:!orders.length?<div className="card"><p className="mut">No orders found.</p></div>:<div className="gap">{orders.map(o=><article className="card gap" key={o.id}>
    <div className="row sp"><div><h3 className="h2">{shortId(o.id)}</h3><p className="mut">{when(o.createdAt)}</p></div><StatusBadge s={String(o.payment?.provider||'').startsWith('mock_')?'SIMULATED':o.payment?.provider==='mock'?'NOT_COLLECTED':o.payment?.status||o.status}/></div>
    <p><strong>{clean(o.user?.name)}</strong><br/><span className="mut">{clean(o.user?.email)}</span></p>
    <div className="row sp"><span className="mut">{o.items?.reduce((n,i)=>n+i.quantity,0)||0} items</span><Price minor={o.subtotalMinor} cur={o.currency}/></div>
    {o.payment?.provider==='cash_on_delivery'&&o.payment.status==='PENDING'&&<Button variant="sec2" loading={saving} onClick={()=>collectCash(o.id)}>Mark cash received</Button>}
   </article>)}</div>}
   <div className="row sp" style={{marginTop:14}}><Button variant="sec2" disabled={orderPage<=1||loadingOrders} onClick={()=>loadOrders(orderPage-1)}>Previous</Button><span className="mut">Page {orderPage} · {orderTotal} orders</span><Button variant="sec2" disabled={orderPage*20>=orderTotal||loadingOrders} onClick={()=>loadOrders(orderPage+1)}>Next</Button></div>
  </section>}
  {tab==='analytics'&&<AdminAnalytics/>}
  {tab==='returns'&&<AdminReturns/>}
  {tab==='staff'&&<AdminStaffAccess/>}
  </div></main>
 </div>;
}
