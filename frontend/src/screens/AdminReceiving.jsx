import {useCallback,useEffect,useState} from 'react';
import {api} from '../services/api';
import {Button,Input} from '../components/ui';
import {clean,shortId,when} from '../utils/format';

const newLine=()=>({productId:'',quantity:'1'});

export default function AdminReceiving({onInventoryChanged}){
 const [supplier,setSupplier]=useState(''),[reference,setReference]=useState(''),[notes,setNotes]=useState(''),[lines,setLines]=useState([newLine()]);
 const [productQuery,setProductQuery]=useState(''),[products,setProducts]=useState([]),[receipts,setReceipts]=useState([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const loadReceipts=useCallback(async()=>{try{const data=await api.adminStockReceipts(50);setReceipts(data.items||[])}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{loadReceipts()},[loadReceipts]);
 useEffect(()=>{const timer=window.setTimeout(async()=>{try{const data=await api.adminInventory(productQuery,undefined,1,100);setProducts(data.items||[])}catch(e){setError(e.message)}},250);return()=>window.clearTimeout(timer)},[productQuery]);
 const updateLine=(index,key,value)=>setLines(current=>current.map((line,i)=>i===index?{...line,[key]:value}:line));
 const createDraft=async event=>{
  event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   await api.adminCreateStockReceipt({supplier:supplier.trim(),deliveryReference:reference.trim()||undefined,notes:notes.trim()||undefined,items:lines.map(line=>({productId:line.productId,quantity:Number(line.quantity)}))});
   setSupplier('');setReference('');setNotes('');setLines([newLine()]);setNotice('Delivery saved as a draft. Stock changes only when you mark it received.');await loadReceipts();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 };
 const receive=async receipt=>{
  setBusy(true);setError('');setNotice('');
  try{await api.adminReceiveStockReceipt(receipt.id);setNotice(`Delivery ${shortId(receipt.id)} received; stock and movement history updated.`);await Promise.all([loadReceipts(),onInventoryChanged?.()])}
  catch(e){setError(e.message)}finally{setBusy(false)}
 };
 return <section className="gap">
  <div><h2 className="h1">Stock receiving</h2><p className="mut">Record supplier deliveries as drafts, then confirm the quantities physically received. Confirmation updates stock once and records who received it.</p></div>
  {error&&<p className="ferr" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}
  <form className="card gap" onSubmit={createDraft}>
   <h3 className="h2">New delivery</h3>
   <Input label="Supplier" required maxLength={160} value={supplier} onChange={event=>setSupplier(event.target.value)} placeholder="Supplier name"/>
   <Input label="Delivery note / reference (optional)" maxLength={120} value={reference} onChange={event=>setReference(event.target.value)} placeholder="Invoice or delivery note number"/>
   <Input label="Find product" value={productQuery} onChange={event=>setProductQuery(event.target.value)} placeholder="Search name or barcode"/>
   <div className="gap">
    {lines.map((line,index)=><div className="row" key={index} style={{alignItems:'end',flexWrap:'wrap'}}>
     <label className="gap" style={{flex:'2 1 230px'}}>Product
      <select className="inp" required value={line.productId} onChange={event=>updateLine(index,'productId',event.target.value)}>
       <option value="">Choose a product</option>{products.map(product=><option key={product.id} value={product.id}>{clean(product.name)} · {clean(product.barcode)}</option>)}
      </select>
     </label>
     <Input label="Units received" type="number" min="1" max="100000" step="1" required style={{flex:'1 1 130px'}} value={line.quantity} onChange={event=>updateLine(index,'quantity',event.target.value)}/>
     {lines.length>1&&<Button type="button" variant="sec2" onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))}>Remove</Button>}
    </div>)}
   </div>
   {products.length===100&&<p className="mut">Showing the first 100 matches. Search by product name or barcode to narrow the list.</p>}
   <Button type="button" variant="sec2" disabled={lines.length>=100} onClick={()=>setLines(current=>[...current,newLine()])}>Add another product</Button>
   <Input label="Notes (optional)" maxLength={500} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Condition, shortages, or other receiving notes"/>
   <Button type="submit" loading={busy}>Save delivery draft</Button>
  </form>
  <div className="gap"><h3 className="h2">Recent deliveries</h3>
   {loading&&!receipts.length?<p className="mut">Loading deliveries…</p>:!receipts.length?<div className="card"><p className="mut">No deliveries recorded yet.</p></div>:receipts.map(receipt=><article className="card gap" key={receipt.id}>
    <div className="row sp"><div><h4 className="h2">{clean(receipt.supplier)}</h4><p className="mut">{receipt.deliveryReference?`Reference ${clean(receipt.deliveryReference)} · `:''}{when(receipt.createdAt)}</p></div><span className={`pill ${receipt.status==='RECEIVED'?'':'err'}`}>{receipt.status==='RECEIVED'?'Received':'Draft'}</span></div>
    <ul>{receipt.items.map(item=><li key={item.id}>{clean(item.product.name)} · {item.quantity} units</li>)}</ul>
    {receipt.notes&&<p className="mut">{clean(receipt.notes)}</p>}
    <p className="mut">Created by {clean(receipt.createdBy?.name)}{receipt.receivedAt?` · Received ${when(receipt.receivedAt)} by ${clean(receipt.receivedBy?.name)}`:''}</p>
    {receipt.status==='DRAFT'&&<Button disabled={busy} onClick={()=>receive(receipt)}>Mark delivery received</Button>}
   </article>)}
  </div>
 </section>;
}
