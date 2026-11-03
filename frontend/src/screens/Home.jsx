import {Link,useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Logo,Icon} from '../components/ui';
import {clean} from '../utils/format';
export default function Home(){
 const {user,count}=useApp(),nav=useNavigate(),h=new Date().getHours(),g=h<12?'morning':h<17?'afternoon':'evening';
 const T=[['/cart','cart','My Cart',count?`${count} item${count>1?'s':''}`:'Empty'],['/bills','bills','My Bills','Past purchases'],['/map','map','Store Map','Find aisles'],['/help','help','Help','Get support']];
 return <div className="page"><div className="hdr"><Logo/><button className="circ" style={{background:'var(--surf)',color:'var(--ink)',border:'1px solid var(--line)'}} aria-label="Profile" onClick={()=>nav('/profile')}><Icon n="user"/></button></div>
 <p className="home-greeting">Good {g}, {clean(user?.name||'there')} <span aria-hidden="true">✦</span></p><h1 className="disp" style={{margin:'5px 0 20px'}}>Your shop, at your own pace.</h1>
 <section className="hero"><span className="sec">✦ &nbsp;Scan &amp; Shop</span><h2 className="h1" style={{marginTop:8}}>Spot it. Scan it. Add it to your basket.</h2><button className="btn" onClick={()=>nav('/scan')}><Icon n="scan"/>Start Scanning</button></section>
 <div className="grid2" style={{marginTop:16}}>{T.map(([to,i,t,s])=><Link key={to} to={to} className="tile"><span style={{color:'var(--acc)'}}><Icon n={i}/></span><span>{t}<br/><span className="mut" style={{fontWeight:400}}>{s}</span></span></Link>)}</div>
 <Link to="/search" className="tile" style={{marginTop:12,flexDirection:'row',alignItems:'center'}}><Icon n="search"/><span className="mut" style={{fontWeight:400}}>Search the catalog</span></Link></div>;
}
