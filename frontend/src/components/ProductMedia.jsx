import {useState} from 'react';
import {Link} from 'react-router-dom';
import {clean} from '../utils/format';

const toneFor = (product={}) => {
 const c=String(product.category||'').toLowerCase();
 if(/fruit|produce|vegetable/.test(c))return 'produce';
 if(/drink|water|beverage/.test(c))return 'drink';
 if(/electronic|audio|computer/.test(c))return 'tech';
 if(/face|beauty|skin|personal/.test(c))return 'care';
 if(/home|clean|spray/.test(c))return 'home';
 return 'grocery';
};

export function ProductMedia({product={},className=''}){
 const url=product.imageUrl||product.image||product.imageURL;
 const [failed,setFailed]=useState(false);
 const tone=toneFor(product);
 return <div className={`product-media tone-${tone} ${className}`} aria-label={clean(product.name||'Product')}>
  {url&&!failed?<img src={url} alt={clean(product.name||'Product')} loading="lazy" onError={()=>setFailed(true)}/>:<div className="media-fallback" role="img" aria-label={`${clean(product.name||'Product')} illustration`}>
   <span className="media-orbit"/><span className="media-pack"><i/><b/><em/></span>
   <span className="media-brand">{clean(product.brand||'FRESH')}</span>
  </div>}
 </div>;
}

export default function ProductCard({product,onAdd,adding=false}){
 const stock=Number(product.stock||0),out=stock<=0||product.active===false;
 const measure=product.weight||product.size||product.quantityLabel||product.unit;
 const metadata=[product.brand,measure||(!product.brand?product.category:null)].filter(Boolean).map(clean).join(' · ');
 return <article className="product-card">
  <Link className="product-card-link" to={`/products/${encodeURIComponent(product.barcode)}`} aria-label={`View ${clean(product.name)}`}>
   <ProductMedia product={product}/>
  </Link>
  <div className="product-card-body">
   <p className="product-card-meta">{metadata||'SnapKart pick'}</p>
   <Link className="product-card-title" to={`/products/${encodeURIComponent(product.barcode)}`}>{clean(product.name)}</Link>
   <div className="product-card-price-row"><span className="price">{new Intl.NumberFormat('en-IN',{style:'currency',currency:product.currency||'INR',maximumFractionDigits:2}).format(Number(product.priceMinor||0)/100)}</span><span className={`stock-dot ${out?'out':''}`}>{out?'Sold out':stock<6?'Low stock':'In stock'}</span></div>
   {onAdd&&<button className="btn product-add" disabled={out||adding} onClick={()=>onAdd(product)}>{adding?'Adding…':out?'Unavailable':<>Add to cart <span aria-hidden="true">＋</span></>}</button>}
  </div>
 </article>;
}
