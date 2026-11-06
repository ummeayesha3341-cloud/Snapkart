import {useEffect,useRef,useState} from 'react';
import {useNavigate,Link,useSearchParams} from 'react-router-dom';
import {api} from '../services/api';
import {useApp} from '../context/AppContext';
import {Header,Button,Input,Price,Skeleton,EmptyState,ErrorState,Icon} from '../components/ui';
import {clean} from '../utils/format';
import ProductCard from '../components/ProductMedia';
export function Search(){
 const [params]=useSearchParams(),category=params.get('category')||'',{add,notify}=useApp(),navigate=useNavigate(),requestId=useRef(0);
 const [q,setQ]=useState(''),[items,setItems]=useState([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[load,setLoad]=useState(true),[err,setErr]=useState(''),[adding,setAdding]=useState('');
 const fetchP=async(p,reset)=>{const id=++requestId.current;setLoad(true);setErr('');try{const d=await api.products(q,p,20,category);if(id!==requestId.current)return;const l=d.products||d.items||[];setItems(r=>reset?l:[...r,...l]);setMore(typeof d.total==='number'?p*20<d.total:l.length===20);setPage(p)}catch(e){if(id===requestId.current)setErr(e.message)}finally{if(id===requestId.current)setLoad(false)}};
 useEffect(()=>{const t=setTimeout(()=>fetchP(1,true),300);return()=>clearTimeout(t)},[q,category]);
 const addProduct=async product=>{setAdding(product.barcode);try{await add(product.barcode,1);notify(`${clean(product.name)} added to cart`)}catch(e){notify(e.message,true)}finally{setAdding('')}};
 return <div className="page search-page"><Header title={category?'Products':'Find your good stuff'} back/><div className="search-field"><Input label="Search products" value={q} onChange={e=>setQ(e.target.value)} placeholder="Try milk, bread, snacks…" type="search"/></div>
 {category&&<p className="search-category">Browsing <b>{clean(category)}</b> <Link to="/search" onClick={()=>setQ('')}>Clear category · Show all products</Link></p>}
 {err?<ErrorState text={err} onRetry={()=>fetchP(1,true)}/>:<div className="product-grid search-grid">{items.map(p=><ProductCard key={p.id} product={p} onAdd={addProduct} adding={adding===p.barcode}/>)}</div>}
 {load&&<div style={{marginTop:12}}><Skeleton n={items.length?1:4}/></div>}
 {!load&&!err&&!items.length&&<EmptyState title="No products found" text={category&&q?`No ${clean(category).toLowerCase()} products match “${clean(q)}”. Try another search or clear the category.`:category?`There are no products in ${clean(category)} yet.`:'Try another search.'} action={category?'Show all products':undefined} onAction={()=>navigate('/search')}/>}
 {!load&&more&&<Button variant="sec2" style={{marginTop:12}} onClick={()=>fetchP(page+1)}>Load more</Button>}</div>;
}
export function Profile(){
 const {user,logout}=useApp(),nav=useNavigate();
 return <div className="page"><Header title="Profile"/><div className="card gap"><div><p className="sec">Name</p><b>{clean(user?.name)}</b></div><div><p className="sec">Email</p><b>{clean(user?.email)}</b></div></div>
 <div className="gap" style={{marginTop:16}}>{user?.role==='ADMIN'&&<Button variant="sec2" onClick={()=>nav('/admin')}>Admin dashboard</Button>}<Button variant="sec2" onClick={()=>nav('/bills')}>My Bills</Button><Button variant="sec2" onClick={()=>nav('/help')}>Help</Button><Button variant="sec2" onClick={()=>{logout();nav('/login')}}><Icon n="out"/>Sign out</Button></div></div>;
}
export function Help(){
 const F=[['How do I scan a product?','Tap Start Scanning, allow camera access, and align the barcode inside the frame.'],['The barcode will not scan','Turn on the flashlight, hold steady, or enter the barcode manually.'],['My payment is pending','We are confirming it. Do not pay again; check My Bills shortly.'],['Can I change quantities?','Yes, from the product sheet or your cart.']];
 return <div className="page"><Header title="Help" back/><div className="gap">{F.map(([q,a])=><div key={q} className="card"><h3 className="h2">{q}</h3><p className="mut" style={{marginTop:4}}>{a}</p></div>)}</div></div>;
}
export const StoreMap=()=><div className="page"><Header title="Store Map" back/><EmptyState title="Store map coming soon" text="Aisle navigation will be available at participating stores."/></div>;
