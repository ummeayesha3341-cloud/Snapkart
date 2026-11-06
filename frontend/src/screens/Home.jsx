import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Logo,Icon,Button,Skeleton,ErrorState} from '../components/ui';
import ProductCard from '../components/ProductMedia';
import TextLoop from '../components/TextLoop';
import SplitFlapText from '../components/SplitFlapText';
import DecryptedText from '../components/DecryptedText';
import {api} from '../services/api';
import {clean} from '../utils/format';

export default function Home(){
 const {user,count,add,notify}=useApp(),nav=useNavigate();
 const [aisleReplay,setAisleReplay]=useState(0);
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[adding,setAdding]=useState('');
 useEffect(()=>{let live=true;api.products('',1,8).then(d=>{if(live)setItems(d.products||d.items||[])}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const addProduct=async p=>{setAdding(p.barcode);try{await add(p.barcode,1);notify(`${clean(p.name)} added to cart`)}catch(e){notify(e.message,true)}finally{setAdding('')}};
 const categories=['Fruits','Baking','Snacks','Beverages','Canned Goods'];
 const h=new Date().getHours(),g=h<12?'morning':h<17?'afternoon':'evening';
 return <div className="page home-page">
  <header className="home-topbar"><Logo/><div className="home-top-actions"><Link to="/search" className="icon-button" aria-label="Search"><Icon n="search"/></Link><button className="profile-button" aria-label="Profile" onClick={()=>nav('/profile')}><Icon n="user"/></button></div></header>
  <section className="home-hero">
   <div className="home-copy"><p className="home-greeting">Good {g}, {clean(user?.name||'there')}</p><h1 className="home-title">Good food.<br/><em>Good mood.</em></h1><div className="home-split-flap"><SplitFlapText words={['FRESH FINDS','SMART SHOPPING','QUICK CHECKOUT','SHOP WITH EASE']} flipDuration={0.11} stagger={0.035} cycleDelay={3000} charset="alpha" flipsPerChar={5} order="left" align="left" tileStyle="board" tileColor="#74145F" textColor="#FFFFFF" glare={0} depth={0.25} tileRadius={4} gap={2} fontSize={13} loop padTo={15} intro/></div><p className="home-subtitle">A little more fresh in every day. Shop as you go, and check out when you’re ready.</p><Button className="home-cta" onClick={()=>nav('/scan')}><Icon n="scan"/> Start scanning <span aria-hidden="true">↗</span></Button><p className="home-promise">Scan it. Add it. That’s your shop.</p></div>
   <div className="home-hero-art home-logo-stage"><div className="home-logo-loop" aria-hidden="true"><TextLoop text="SNAPKART · SCAN · SHOP · GO" shape="wave" speed={34} direction="forward" separator="✦" curviness={72} fontSize={18} fontWeight={800} letterSpacing={2} ribbon ribbonColor="#74145F" ribbonWidth={58} edgeFade={0.25} cross crossColor="#CFF7E8" crossAngle={32} pauseOnHover/></div><div className="hero-logo-foreground"><Logo size={68} text={false}/><b>SnapKart</b><small>FRESH FINDS, FAST</small></div><span className="hero-sticker">SHOP<br/>HAPPY</span></div>
  </section>
  <section className="home-section category-section"><div className="section-heading"><div><p className="eyebrow">A GOOD PLACE TO START</p><h2 className="aisle-title"><button type="button" className="aisle-replay-button" aria-label="Replay Shop by aisle animation" onClick={()=>setAisleReplay(key=>key+1)}><DecryptedText key={aisleReplay} text="Shop by aisle" animateOn="view" effect="scramble" sequential revealDirection="start" speed={42} maxIterations={7} scrambleColor="#74145F" loop={false} className="aisle-decrypted" encryptedClassName="aisle-scrambling" parentClassName="aisle-decrypted-wrap"/></button></h2></div><Link to="/search">See everything <span aria-hidden="true">→</span></Link></div><div className="category-pills">{categories.map(c=><Link key={c} to={`/search?category=${encodeURIComponent(c)}`} className="category-pill">{clean(c)} <span aria-hidden="true">↗</span></Link>)}</div></section>
  <section className="home-section"><div className="section-heading"><div><p className="eyebrow">FROM THE CATALOG</p><h2>Good picks, today</h2></div><Link to="/search">Browse all <span aria-hidden="true">→</span></Link></div>
   {error?<ErrorState text={error} onRetry={()=>location.reload()}/>:loading?<div className="product-grid">{Array.from({length:4},(_,i)=><Skeleton key={i}/>)}</div>:items.length?<div className="product-grid">{items.slice(0,4).map(p=><ProductCard key={p.id} product={p} onAdd={addProduct} adding={adding===p.barcode}/>)}</div>:<p className="mut">No catalog products are available right now.</p>}
  </section>
  <section className="home-section quick-links"><Link to="/cart" className="quick-link"><span className="quick-icon"><Icon n="cart"/></span><span><b>Your basket</b><small>{count?`${count} items waiting`: 'Ready when you are'}</small></span><span className="quick-arrow">↗</span></Link><Link to="/bills" className="quick-link"><span className="quick-icon quick-lavender"><Icon n="bills"/></span><span><b>Order history</b><small>Your purchases, all in one place</small></span><span className="quick-arrow">↗</span></Link></section>
 </div>;
}
