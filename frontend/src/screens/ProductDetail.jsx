import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {api} from '../services/api';
import {useApp} from '../context/AppContext';
import {Button,Header,Price,QuantitySelector,Skeleton,ErrorState} from '../components/ui';
import {ProductMedia} from '../components/ProductMedia';
import {clean} from '../utils/format';

export default function ProductDetail(){
 const {barcode}=useParams(),nav=useNavigate(),{add,notify}=useApp();
 const [state,setState]=useState({loading:true}),[quantity,setQuantity]=useState(1),[saving,setSaving]=useState(false),[added,setAdded]=useState(false),[addError,setAddError]=useState('');
 const load=useCallback(async()=>{setState({loading:true});try{const d=await api.byBarcode(barcode);setState({product:d.product})}catch(e){setState({error:e.message})}},[barcode]);
 useEffect(()=>{load()},[load]);
 if(state.loading)return <div className="page"><Header title="Product details" back/><Skeleton n={3}/></div>;
 if(state.error)return <div className="page"><Header title="Product details" back/><ErrorState title="Product unavailable" text={state.error} onRetry={load}/></div>;
 const p=state.product,out=p.stock<=0||p.active===false;
 const addToCart=async()=>{setSaving(true);setAddError('');try{await add(p.barcode,quantity);setAdded(true);notify(`${clean(p.name)} added to cart`)}catch(e){setAddError(e.message);notify(e.message,true)}finally{setSaving(false)}};
 const specs=[['Brand',p.brand],['Category',p.category],['Barcode',p.barcode]].filter(([,v])=>v);
 return <div className="page product-detail-page"><Header title="Product details" back/>
  <div className="product-detail-layout"><div className="detail-media-wrap"><span className="detail-pick">SNAPKART PICK</span><ProductMedia product={p} className="detail-media"/></div>
   <section className="product-info"><p className="product-eyebrow">{clean(p.category||'Catalog item')}</p><h1 className="product-name">{clean(p.name)}</h1>{p.brand&&<p className="product-brand">By {clean(p.brand)}</p>}
    <div className="product-purchase-card"><div className="product-price-row"><Price minor={p.priceMinor} cur={p.currency} className="product-detail-price"/><span className={`stock-status ${out?'out':p.stock<=5?'low':''}`}><i/> {out?'Out of stock':p.stock<=5?`Only ${p.stock} left`:'In stock'}</span></div>
     <div className="row sp product-quantity-row"><span>Quantity</span><QuantitySelector value={quantity} onChange={setQuantity} max={Math.max(1,p.stock||1)} busy={saving||out}/></div>
     {addError&&<p className="ferr" role="alert">{addError}</p>}
     {!added?<Button loading={saving} disabled={out} onClick={addToCart}>{out?'Unavailable':'Add to basket'}</Button>:<div className="product-added-actions"><p className="product-added-note">✓ Added to your basket</p><Button onClick={()=>nav('/cart')}>View basket</Button><Button variant="sec2" onClick={()=>{setAdded(false);setQuantity(1)}}>Keep shopping</Button></div>}
    </div>
    {p.description&&<section className="product-specs"><h2>About this product</h2><p className="product-description">{clean(p.description)}</p></section>}
    <section className="product-specs"><h2>Product details</h2><dl>{specs.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{clean(value)}</dd></div>)}</dl></section>
   </section>
  </div>
 </div>;
}
