import {useCallback,useEffect,useState} from 'react';
import {useApp} from '../context/AppContext';
import {api} from '../services/api';
import {Button,Header,Input,Price,StatusBadge} from '../components/ui';
import {clean,shortId,when} from '../utils/format';

const moneyValue=p=>(Number(p.priceMinor||0)/100).toFixed(2);
const blankProduct={barcode:'',name:'',description:'',category:'',brand:'',supplier:'',price:'',stock:'0',currency:'INR'};

export default function Admin(){
 const {notify}=useApp();
 const [tab,setTab]=useState('inventory'),[summary,setSummary]=useState(null),[summaryError,setSummaryError]=useState('');
 const [products,setProducts]=useState([]),[total,setTotal]=useState(0),[query,setQuery]=useState(''),[lowOnly,setLowOnly]=useState(false),[loadingProducts,setLoadingProducts]=useState(false);
 const [orders,setOrders]=useState([]),[orderTotal,setOrderTotal]=useState(0),[orderPage,setOrderPage]=useState(1),[orderStatus,setOrderStatus]=useState(''),[loadingOrders,setLoadingOrders]=useState(false);
 const [showCreate,setShowCreate]=useState(false),[createForm,setCreateForm]=useState(blankProduct),[saving,setSaving]=useState(false),[editing,setEditing]=useState(null),[editForm,setEditForm]=useState({}),[adjusting,setAdjusting]=useState(null),[delta,setDelta]=useState(''),[reason,setReason]=useState('');

 const loadSummary=useCallback(async()=>{try{setSummary(await api.adminSummary());setSummaryError('')}catch(e){setSummaryError(e.message)}},[]);
 const loadProducts=useCallback(async()=>{setLoadingProducts(true);try{const d=await api.adminInventory(query,lowOnly?5:undefined,1,50);setProducts(d.items||[]);setTotal(d.total||0)}catch(e){notify(e.message,true)}finally{setLoadingProducts(false)}},[query,lowOnly,notify]);
 const loadOrders=useCallback(async(page=orderPage,status=orderStatus)=>{setLoadingOrders(true);try{const d=await api.adminOrders(page,20,status);setOrders(d.items||[]);setOrderTotal(d.total||0);setOrderPage(d.page||page)}catch(e){notify(e.message,true)}finally{setLoadingOrders(false)}},[orderPage,orderStatus,notify]);
 useEffect(()=>{loadSummary()},[loadSummary]);
 useEffect(()=>{const timer=setTimeout(loadProducts,250);return()=>clearTimeout(timer)},[loadProducts]);
 useEffect(()=>{if(tab==='orders')loadOrders(1,orderStatus)},[tab,orderStatus]);

 const field=(form,setter,key,label,type='text',props={})=>{if(typeof type==='object'){props=type;type='text'}return <Input label={label} type={type} value={form[key]??''} onChange={e=>setter({...form,[key]:e.target.value})} {...props}/>};
 const createProduct=async e=>{e.preventDefault();setSaving(true);try{await api.adminCreateProduct({...createForm,priceMinor:Math.round(Number(createForm.price)*100),stock:Number(createForm.stock),currency:createForm.currency.toUpperCase()});setCreateForm(blankProduct);setShowCreate(false);notify('Product created');await Promise.all([loadProducts(),loadSummary()])}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const saveProduct=async e=>{e.preventDefault();setSaving(true);try{await api.adminUpdateProduct(editing,{...editForm,priceMinor:Math.round(Number(editForm.price)*100),currency:editForm.currency.toUpperCase()});setEditing(null);notify('Product updated');await loadProducts()}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const adjustStock=async e=>{e.preventDefault();if(!adjusting)return;setSaving(true);try{await api.adminAdjustStock(adjusting,{delta:Number(delta),reason});setAdjusting(null);setDelta('');setReason('');notify('Inventory updated');await Promise.all([loadProducts(),loadSummary()])}catch(err){notify(err.message,true)}finally{setSaving(false)}};
 const startEdit=p=>{setEditing(p.id);setEditForm({barcode:p.barcode,name:p.name,description:p.description||'',category:p.category||'',brand:p.brand||'',supplier:p.supplier||'',price:moneyValue(p),currency:p.currency,active:p.active})};

 return <div className="page">
  <Header title="Admin dashboard" back/>
  <p className="mut" style={{marginTop:-12,marginBottom:16}}>Store operations · inventory, products, and orders</p>
  {summaryError&&<div className="card" style={{marginBottom:12}}><p className="ferr">{summaryError}</p><Button variant="sm sec2" style={{marginTop:10}} onClick={loadSummary}>Retry summary</Button></div>}
  <div className="grid2" style={{marginBottom:18}}>
   <div className="card"><p className="sec">Products</p><strong className="disp">{summary?.products??'—'}</strong></div>
   <div className="card"><p className="sec">Customers</p><strong className="disp">{summary?.customers??'—'}</strong></div>
   <div className="card"><p className="sec">Orders</p><strong className="disp">{summary?.orders??'—'}</strong></div>
   <div className="card"><p className="sec">Paid revenue</p><strong className="h2">{summary?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(summary.revenueMinor/100):'—'}</strong></div>
  </div>
  <div className="row" style={{marginBottom:16}}>
   {['inventory','orders'].map(x=><Button key={x} variant={tab===x?'':'sec2'} onClick={()=>setTab(x)}>{x==='inventory'?'Inventory':'Orders'}</Button>)}
  </div>
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
      <div className="row"><Button variant="sec2" onClick={()=>startEdit(p)}>Edit</Button><Button variant="sec2" onClick={()=>{setAdjusting(adjusting===p.id?null:p.id);setDelta('');setReason('')}}>{adjusting===p.id?'Close stock form':'Adjust stock'}</Button></div>
      {adjusting===p.id&&<form className="card gap" onSubmit={adjustStock}>
       <h4 className="h2">Adjust stock for {clean(p.name)}</h4>
       <Input label="Quantity change (+5 or -2)" type="number" min={-p.stock} max={99999} step="1" required value={delta} onChange={e=>setDelta(e.target.value)}/>
       <Input label="Reason" required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Delivery received, damaged item, correction…"/>
       <Button type="submit" loading={saving} disabled={!Number(delta)}>Apply adjustment</Button>
      </form>}
     </>}
    </article>)}
   </div>}
  </section>}
  {tab==='orders'&&<section>
   <div className="row sp" style={{marginBottom:12}}><h2 className="h1">Orders</h2><select className="inp" aria-label="Filter order status" style={{width:'auto'}} value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}><option value="">All statuses</option><option value="PAID">Paid</option><option value="PENDING_PAYMENT">Pending payment</option><option value="PAYMENT_FAILED">Payment failed</option><option value="CANCELLED">Cancelled</option></select></div>
   {loadingOrders&&!orders.length?<p className="mut">Loading orders…</p>:!orders.length?<div className="card"><p className="mut">No orders found.</p></div>:<div className="gap">{orders.map(o=><article className="card gap" key={o.id}>
    <div className="row sp"><div><h3 className="h2">{shortId(o.id)}</h3><p className="mut">{when(o.createdAt)}</p></div><StatusBadge s={o.payment?.status||o.status}/></div>
    <p><strong>{clean(o.user?.name)}</strong><br/><span className="mut">{clean(o.user?.email)}</span></p>
    <div className="row sp"><span className="mut">{o.items?.reduce((n,i)=>n+i.quantity,0)||0} items</span><Price minor={o.subtotalMinor} cur={o.currency}/></div>
   </article>)}</div>}
   <div className="row sp" style={{marginTop:14}}><Button variant="sec2" disabled={orderPage<=1||loadingOrders} onClick={()=>loadOrders(orderPage-1)}>Previous</Button><span className="mut">Page {orderPage} · {orderTotal} orders</span><Button variant="sec2" disabled={orderPage*20>=orderTotal||loadingOrders} onClick={()=>loadOrders(orderPage+1)}>Next</Button></div>
  </section>}
 </div>;
}
