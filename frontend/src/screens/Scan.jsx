import {useEffect,useRef,useState,useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import {api} from '../services/api';
import {useApp} from '../context/AppContext';
import {Button,Icon,BottomSheet,QuantitySelector,Price} from '../components/ui';
import {clean} from '../utils/format';
// Scanner component: ZXing decodes supported 1D/2D barcode text from the live camera stream.
export function Scanner({onDetect,paused,onClose}){
 const vid=useRef(),trk=useRef(),controls=useRef(),[err,setErr]=useState(''),[torch,setTorch]=useState(false),[manual,setManual]=useState(''),[cameraReady,setCameraReady]=useState(false);
 useEffect(()=>{let stop=false;
  (async()=>{try{
   const {BrowserMultiFormatReader}=await import('@zxing/browser');if(stop)return;const reader=new BrowserMultiFormatReader();
   const scanControls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'}}},vid.current,(result)=>{
    if(result&&!stop&&!paused.current){navigator.vibrate?.(40);onDetect(result.getText())}
   });
   if(stop){scanControls.stop();return}
   controls.current=scanControls;trk.current=vid.current?.srcObject?.getVideoTracks?.()[0]||null;setCameraReady(true);
  }catch{if(!stop)setErr('Camera access is unavailable. Allow camera permission, or enter the barcode below.')}})();
  return()=>{stop=true;controls.current?.stop();vid.current?.srcObject?.getTracks().forEach(t=>t.stop());controls.current=null;trk.current=null}
 },[]);
 const flash=async()=>{try{if(controls.current?.switchTorch)await controls.current.switchTorch(!torch);else await trk.current?.applyConstraints({advanced:[{torch:!torch}]});setTorch(!torch)}catch{setErr('Flashlight is unavailable on this camera.')}};
 return <div className="cam"><video ref={vid} playsInline muted/><div className="ov">
  <div className="row sp"><button className="circ" aria-label="Close scanner" onClick={onClose}><Icon n="x"/></button><button className="circ" aria-label="Toggle flashlight" onClick={flash} style={torch?{background:'#fff',color:'#000'}:null}><Icon n="bolt"/></button></div>
  <div className="frame" aria-hidden="true"><i/><i/><i/><i/><u/></div>
  <div style={{textAlign:'center',display:'grid',gap:10}}><h2 className="h1">Scan a product</h2><p style={{opacity:.8}}>Point the camera at a barcode. It scans automatically; no button needed.</p><p style={{opacity:.8,fontSize:12}}>{cameraReady?'Camera is active.':'Starting camera...'}</p>{err&&<p style={{color:'#FFD27A'}}>{err}</p>}
  <form className="row" onSubmit={e=>{e.preventDefault();manual.trim()&&onDetect(manual.trim())}}><input className="inp" aria-label="Enter barcode manually" placeholder="Or type a code, e.g. SNAPMOCK0001" value={manual} onChange={e=>setManual(e.target.value)}/><Button variant="sm" type="submit">Look up typed code</Button></form><p style={{opacity:.8,fontSize:12}}>For a demo scan, use a QR/barcode containing SNAPMOCK0001. Real product codes may scan but are not in the mock catalog.</p></div></div></div>;
}
export default function Scan(){
 const nav=useNavigate(),{add,notify}=useApp(),paused=useRef(false),[state,setState]=useState('scan'),[p,setP]=useState(null),[q,setQ]=useState(1),[busy,setBusy]=useState(false),[err,setErr]=useState(null),[added,setAdded]=useState(false),[lastCode,setLastCode]=useState('');
 const detect=useCallback(async code=>{if(paused.current)return;paused.current=true;setLastCode(code);setState('lookup');setErr(null);setAdded(false);setQ(1);
  try{const d=await api.byBarcode(code);setP(d.product);setState('found')}catch(e){setErr(e.message);setState(e.code==='PRODUCT_NOT_FOUND'?'notFound':'error')}},[]);
 const resume=()=>{setP(null);setErr(null);setState('scan');paused.current=false};
 const addIt=async()=>{setBusy(true);try{await add(p.barcode,q);notify('✓ Added to cart');setAdded(true)}catch(e){setErr(e.message);notify(e.message,true);if(e.code==='INSUFFICIENT_STOCK')setAdded(false)}finally{setBusy(false)}};
 const out=p&&(p.stock<=0||p.active===false);
 return <><Scanner onDetect={detect} paused={paused} onClose={()=>nav('/')}/>
 {state==='lookup'&&<div className="toast" style={{top:'auto',bottom:40}}><span className="spin"/> Looking up product...</div>}
 {(state==='error'||state==='notFound')&&<BottomSheet onClose={resume}><h2 className="h1">{state==='notFound'?'Product not found':'Could not look up code'}</h2>{lastCode&&<p className="mut">Code sent to catalog: <strong>{lastCode}</strong></p>}<p className="mut">{err}</p><Button onClick={resume}>Scan again</Button></BottomSheet>}
 {state==='found'&&p&&<BottomSheet onClose={resume}><span className="pill" style={{width:'fit-content'}}>{added?'Added to cart':'Product found'}</span>
  <div><h2 className="h1">{clean(p.name)}</h2><p className="mut">{[p.brand,p.category].filter(Boolean).map(clean).join(' · ')}</p></div>
  <div className="row sp"><Price minor={p.priceMinor} cur={p.currency} className="disp"/><span className={`pill ${out?'err':p.stock<=5?'warn':''}`}>{out?'Out of stock':p.stock<=5?`Only ${p.stock} left`:'In stock'}</span></div>
  {err&&<p className="ferr">{err}</p>}
  {!added?<><div className="row sp"><span style={{fontWeight:600}}>Quantity</span><QuantitySelector value={q} onChange={setQ} max={Math.max(1,p.stock||1)}/></div><Button loading={busy} disabled={out} onClick={addIt}>{busy?'Adding...':'Add to cart'}</Button><Button variant="sec2" onClick={resume}>Continue scanning</Button></>
  :<><Button onClick={()=>nav('/cart')}>View cart</Button><Button variant="sec2" onClick={resume}>Continue scanning</Button></>}</BottomSheet>}</>;
}
