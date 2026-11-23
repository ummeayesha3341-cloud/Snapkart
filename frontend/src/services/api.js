// Centralized API client: base URL, auth header, JSON, timeouts, error mapping, 401 handling.
import { supabase } from './supabase';
const BASE=import.meta.env.VITE_API_BASE_URL||'http://localhost:3000';
export class ApiError extends Error{constructor(status,code,message,data){super(message);this.status=status;this.code=code;this.data=data}}
function friendly(status,d,auth){
 const x=d?.error&&typeof d.error==='object'?d.error:d||{};const c=String(x.code||(typeof d?.error==='string'?d.error:'')).toUpperCase();
 if(status===404&&c==='RECEIPT_NOT_FOUND')return {code:c,msg:'This receipt QR is invalid or no longer available.'};
 if(status===404&&c==='STAFF_ACCOUNT_NOT_FOUND')return {code:c,msg:x.message||'That account is not registered in SnapKart yet.'};
 if(status===404&&(c==='PRODUCT_NOT_FOUND'||!c))return {code:'PRODUCT_NOT_FOUND',msg:"This barcode isn't available in the SnapKart catalog. Try scanning again."};
 if(c==='ONLINE_PAYMENTS_NOT_CONFIGURED')return {code:c,msg:'Test UPI and card payments are not enabled on the backend yet. Set PAYMENT_PROVIDER=mock on the backend and restart it.'};
 if(status===403&&c==='CUSTOMER_ACCESS_REQUIRED')return {code:c,msg:'This shopping feature requires a customer account.'};
 if(status===403&&c==='STAFF_ACCESS_REQUIRED')return {code:c,msg:'This feature requires store staff access.'};
 if(status===409&&c==='PAYMENT_NOT_SETTLED')return {code:c,msg:'Payment is not settled. Hold the exit and contact the store owner.'};
 if(status===409&&c==='RECEIPT_ALREADY_CLEARED')return {code:c,msg:'This receipt has already been cleared at the gate.'};
 if(status===409&&c==='GATE_REVIEW_REQUIRED')return {code:c,msg:'This receipt is on hold for a supervisor review.'};
 if(status===409&&c==='GATE_EXCEPTION_NOT_CURRENT')return {code:c,msg:'A newer gate review exists. Refresh the exception list.'};
 if(status===401)return {code:'UNAUTHORIZED',msg:auth?'Your session has expired. Please sign in again.':'Incorrect email or password.'};
 if(status===409&&c.includes('STOCK')){const n=x.available??x.stock??x.details?.available;return {code:'INSUFFICIENT_STOCK',msg:(n!=null?`Only ${n} units are currently available.`:'Not enough stock is available.')+' Your cart has been updated.'}}
 if(status===409)return {code:c||'CONFLICT',msg:'An account with this email already exists.'};
 if(c==='EMPTY_CART')return {code:c,msg:'Your cart is empty. Scan a product to get started.'};
 if(status===402)return {code:'PAYMENT_DECLINED',msg:'Payment could not be completed.'};
 if(c.includes('IDEMPOTENCY')||status>=500)return {code:'SERVER',msg:'Something went wrong on our side. Please try again.'};
 const m=typeof x.message==='string'?x.message:'';return {code:c||'ERROR',msg:m&&m.length<120?m:'Something went wrong. Please try again.'};
}
async function req(path,{method='GET',body,headers={},auth=true}={}){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),15000);
 const {data:{session}}=auth&&supabase?await supabase.auth.getSession():{data:{session:null}};
 const tk=session?.access_token;
 const h={...headers};if(body)h['Content-Type']='application/json';if(auth&&tk)h.Authorization=`Bearer ${tk}`;
 let r;try{r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined,signal:ctl.signal})}
 catch(e){throw new ApiError(0,'NETWORK',e.name==='AbortError'?'The request timed out. Please try again.':"Can't reach SnapKart. Check your connection and try again.")}
 finally{clearTimeout(t)}
 let d=null;try{d=await r.json()}catch{}
 if(r.status===401&&auth&&tk)window.dispatchEvent(new Event('sk:unauthorized'));
 if(!r.ok){const f=friendly(r.status,d,auth&&!!tk);throw new ApiError(r.status,f.code,f.msg,d)}
 return {status:r.status,data:d};
}
const J=async(p,o)=>(await req(p,o)).data;
export const api={
 health:()=>J('/health',{auth:false}),
 me:()=>J('/auth/me'),
 products:(q='',page=1,limit=20,category='')=>{const p=new URLSearchParams({q,page:String(page),limit:String(limit)});if(category)p.set('category',category);return J(`/products?${p}`)},
 byBarcode:c=>J(`/products/barcode/${encodeURIComponent(c)}`),
 cart:()=>J('/cart'),
 addItem:(barcode,quantity)=>J('/cart/items',{method:'POST',body:{barcode,quantity}}),
 setQty:(id,quantity)=>J(`/cart/items/${encodeURIComponent(id)}`,{method:'PATCH',body:{quantity}}),
 removeItem:id=>J(`/cart/items/${encodeURIComponent(id)}`,{method:'DELETE'}),
 checkout:(key,paymentMethod,upiApp)=>req('/checkout',{method:'POST',headers:{'Idempotency-Key':key},body:{paymentMethod,...(upiApp?{upiApp}:{})}}),
 orders:()=>J('/orders'),
 order:id=>J(`/orders/${encodeURIComponent(id)}`),
 returns:id=>J(`/orders/${encodeURIComponent(id)}/returns`),
 requestReturn:(id,body)=>J(`/orders/${encodeURIComponent(id)}/returns`,{method:'POST',body}),
 receipt:token=>J(`/receipts/${encodeURIComponent(token)}`,{auth:false}),
 staffGateReceipt:token=>J(`/staff/gate/receipts/${encodeURIComponent(token)}`),
 staffGateCheck:(token,outcome,note)=>J(`/staff/gate/receipts/${encodeURIComponent(token)}/checks`,{method:'POST',body:{outcome,...(note?{note}:{})}}),
 adminStaffAccess:()=>J('/admin/staff-access'),
 adminGateChecks:()=>J('/admin/gate-checks'),
 adminResolveGateCheck:(id,note)=>J(`/admin/gate-checks/${encodeURIComponent(id)}/resolve`,{method:'POST',body:{note}}),
 adminGrantStaff:email=>J('/admin/staff-access',{method:'POST',body:{email}}),
 adminRevokeStaff:id=>J(`/admin/staff-access/${encodeURIComponent(id)}`,{method:'DELETE'}),
 adminSummary:()=>J('/admin/summary'),
 adminInventory:(q='',lowStockAt,page=1,limit=50)=>{const p=new URLSearchParams({page:String(page),limit:String(limit)});if(q)p.set('q',q);if(lowStockAt!==undefined&&lowStockAt!==null)p.set('lowStockAt',String(lowStockAt));return J(`/admin/inventory?${p}`)},
 adminCreateProduct:body=>J('/admin/products',{method:'POST',body}),
 adminUpdateProduct:(id,body)=>J(`/admin/products/${encodeURIComponent(id)}`,{method:'PATCH',body}),
 adminAdjustStock:(id,body)=>J(`/admin/products/${encodeURIComponent(id)}/inventory-adjustments`,{method:'POST',body}),
 adminOrders:(page=1,limit=20,status='')=>J(`/admin/orders?page=${page}&limit=${limit}${status?`&status=${encodeURIComponent(status)}`:''}`),
 adminCollectCash:id=>J(`/admin/orders/${encodeURIComponent(id)}/collect-cash`,{method:'POST',body:{}}),
 adminSales:(from,to,interval='day')=>{const p=new URLSearchParams({interval});if(from)p.set('from',from);if(to)p.set('to',to);return J(`/admin/analytics/sales?${p}`)},
 adminDemand:(from,to)=>{const p=new URLSearchParams();if(from)p.set('from',from);if(to)p.set('to',to);return J(`/admin/analytics/demand?${p}`)},
 adminReturns:(page=1,status='')=>J(`/admin/returns?page=${page}&limit=20${status?`&status=${encodeURIComponent(status)}`:''}`),
 adminReviewReturn:(id,decision,note='')=>J(`/admin/returns/${encodeURIComponent(id)}/review`,{method:'POST',body:{decision,...(note?{note}:{})}}),
 adminCompleteReturn:(id,body)=>J(`/admin/returns/${encodeURIComponent(id)}/complete`,{method:'POST',body}),
};
