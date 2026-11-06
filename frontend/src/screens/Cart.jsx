import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Header,Button,Price,QuantitySelector,EmptyState,Skeleton,Icon} from '../components/ui';
import {clean} from '../utils/format';
import {ProductMedia} from '../components/ProductMedia';
export default function Cart(){
 const {cart,setQty,remove,notify,count}=useApp(),nav=useNavigate(),[busy,setBusy]=useState(null);
 const run=async(id,fn)=>{setBusy(id);try{await fn()}catch(e){notify(e.message,true)}finally{setBusy(null)}};
 if(!cart)return <div className="page"><Header title="My Cart"/><Skeleton/></div>;
 if(!cart.items?.length)return <div className="page"><Header title="My Cart"/><EmptyState title="Your cart is empty" text="Scan your first product to get started." action="Start scanning" onAction={()=>nav('/scan')}/></div>;
 return <div className="page cart-page"><Header title="Your basket"/><p className="cart-count">{count} item{count>1?'s':''} in your basket</p>
 <div className="cart-layout"><div className="cart-items">{cart.items.map(i=><article key={i.id||i.productId||i.barcode} className="cart-item" style={{opacity:busy===i.id ? 0.6 : 1}}>
  <ProductMedia product={{name:i.name,barcode:i.barcode}} className="cart-product-media"/><div className="cart-item-info"><h3>{clean(i.name)}</h3><p className="mut"><Price minor={i.unitPriceMinor} cur={i.currency}/> each</p><div className="row sp cart-item-controls"><QuantitySelector value={i.quantity} busy={busy===i.id} onChange={q=>run(i.id,()=>setQty(i.id,q))}/><button aria-label={`Remove ${clean(i.name)}`} className="remove-button" onClick={()=>run(i.id,()=>remove(i.id))}><Icon n="trash"/> Remove</button></div></div><Price minor={i.lineTotalMinor} cur={i.currency} className="cart-line-total"/></article>)}</div>
  <aside className="cart-summary"><p className="eyebrow">ORDER SUMMARY</p><div className="row sp"><span>Subtotal</span><Price minor={cart.subtotalMinor} cur={cart.items[0].currency}/></div><p className="mut">Taxes and any fees are shown at checkout.</p><Button onClick={()=>nav('/checkout')}>Continue to checkout <span aria-hidden="true">→</span></Button><button className="continue-shopping" onClick={()=>nav('/search')}>Continue shopping</button></aside></div>
 {busy&&<p className="mut" style={{marginTop:12}}>Updating basket…</p>}</div>;
}
