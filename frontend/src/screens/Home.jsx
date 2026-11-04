import {Link,useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Logo,Icon} from '../components/ui';
import {clean} from '../utils/format';

export default function Home(){
 const {user,count}=useApp(),nav=useNavigate(),h=new Date().getHours(),g=h<12?'morning':h<17?'afternoon':'evening';
 const T=[['/cart','cart','My Cart',count?`${count} item${count>1?'s':''}`:'Ready when you are'],['/bills','bills','My Bills','Your purchase history'],['/map','map','Store Map','Find your way around'],['/help','help','Help & support','We’re here to help']];
 return <div className="page home-page">
  <header className="home-topbar"><Logo/><button className="profile-button" aria-label="Profile" onClick={()=>nav('/profile')}><Icon n="user"/></button></header>
  <section className="home-hero">
   <div className="home-copy">
    <p className="home-greeting">Good {g}, {clean(user?.name||'there')} <span aria-hidden="true">✦</span></p>
    <h1 className="home-title">Your shop.<br/><em>Your pace.</em></h1>
    <p className="home-subtitle">Scan as you go, keep an eye on your basket, and check out when you’re ready.</p>
    <button className="btn home-cta" onClick={()=>nav('/scan')}><Icon n="scan"/>Start scanning <span aria-hidden="true">↗</span></button>
    <p className="home-promise"><span aria-hidden="true">✦</span> A quicker, calmer way to shop</p>
   </div>
   <div className="home-art" aria-hidden="true">
    <span className="art-spark">✦</span><span className="art-orbit"/>
    <div className="art-scan-card"><span className="art-label">SNAPKART · SELF CHECKOUT</span><div className="art-basket"><i/><b/><span/></div><div className="art-scan-lines"><i/><i/><i/><i/><i/><i/><i/><i/></div><span className="art-scan-caption">SCAN · ADD · GO</span></div>
    <span className="art-sticker">SHOP<br/>SMART</span>
   </div>
  </section>
  <section className="home-shortcuts">
   <div className="home-section-head"><div><p className="home-kicker">YOUR SNAPKART</p><h2>Pick up where you left off</h2></div><Link to="/search" className="home-search-link"><Icon n="search"/> Browse products</Link></div>
   <div className="shortcut-grid">{T.map(([to,i,t,s],idx)=><Link key={to} to={to} className={`shortcut shortcut-${idx+1}`}><span className="shortcut-icon"><Icon n={i}/></span><span className="shortcut-copy"><b>{t}</b><small>{s}</small></span><span className="shortcut-arrow" aria-hidden="true">↗</span></Link>)}</div>
  </section>
 </div>;
}
