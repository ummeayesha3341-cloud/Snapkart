import {useEffect,useRef,useState,useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import {api} from '../services/api';
import {useApp} from '../context/AppContext';
import {Button,Icon,BottomSheet,QuantitySelector,Price} from '../components/ui';
import {clean} from '../utils/format';
// Scanner component: ZXing decodes supported 1D/2D barcode text from the live camera stream.
export function Scanner({onDetect,paused,onClose}){
 const vid=useRef(),trk=useRef(),controls=useRef(),[err,setErr]=useState(''),[torch,setTorch]=useState(false),[manual,setManual]=useState('');
 useEffect(()=>{let stop=false,nativeTimer=null;
  const videoConstraints={facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},advanced:[{focusMode:'continuous'}]};
  const setupTrack=async()=>{trk.current=vid.current?.srcObject?.getVideoTracks?.()[0]||null;const caps=trk.current?.getCapabilities?.()||{},focusModes=caps.focusMode;
   if(Array.isArray(focusModes)&&focusModes.includes('continuous')){try{const c=trk.current.getConstraints?.()||{};await trk.current.applyConstraints({...c,advanced:[...(c.advanced||[]),{focusMode:'continuous'}]})}catch{}}
  };
  (async()=>{try{
   const NativeDetector=globalThis.BarcodeDetector;
   if(NativeDetector&&navigator.mediaDevices?.getUserMedia){
    const supported=await NativeDetector.getSupportedFormats().catch(()=>[]),formats=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code','data_matrix'].filter(f=>supported.includes(f));
    if(formats.includes('ean_13')){
     try{const detector=new NativeDetector({formats}),stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoConstraints});if(stop){stream.getTracks().forEach(t=>t.stop());return}vid.current.srcObject=stream;await vid.current.play();await setupTrack();
      const detectFrame=async()=>{if(stop)return;try{const codes=await detector.detect(vid.current),code=codes?.[0]?.rawValue;if(code&&!paused.current){navigator.vibrate?.(40);onDetect(code);return}}catch{}nativeTimer=window.setTimeout(detectFrame,180)};
      detectFrame();controls.current={stop:()=>{if(nativeTimer)window.clearTimeout(nativeTimer)}};return;
     }catch{vid.current?.srcObject?.getTracks?.().forEach(t=>t.stop());vid.current.srcObject=null;trk.current=null}
    }
   }
   const [{BrowserMultiFormatReader},{BarcodeFormat,DecodeHintType}]=await Promise.all([import('@zxing/browser'),import('@zxing/library')]);if(stop)return;
   const hints=new Map([[DecodeHintType.TRY_HARDER,true],[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.ITF,BarcodeFormat.QR_CODE,BarcodeFormat.DATA_MATRIX]]]);
   const reader=new BrowserMultiFormatReader(hints,250);
   const scanControls=await reader.decodeFromConstraints({audio:false,video:videoConstraints},vid.current,(result)=>{
    if(result&&!stop&&!paused.current){navigator.vibrate?.(40);onDetect(result.getText())}
   });
   if(stop){scanControls.stop();return}
   controls.current=scanControls;await setupTrack();
  }catch{if(!stop)setErr('Camera access is unavailable. Allow camera permission, or enter the barcode below.')}})();
  return()=>{stop=true;if(nativeTimer)window.clearTimeout(nativeTimer);controls.current?.stop();vid.current?.srcObject?.getTracks().forEach(t=>t.stop());controls.current=null;trk.current=null}
 },[]);
 const flash=async()=>{try{if(controls.current?.switchTorch)await controls.current.switchTorch(!torch);else{const c=trk.current?.getConstraints?.()||{};await trk.current?.applyConstraints({...c,advanced:[...(c.advanced||[]),{torch:!torch}]})}setTorch(!torch)}catch{setErr('Flashlight is unavailable on this camera.')}};
 return <div className="cam"><video ref={vid} playsInline muted/><div className="ov">
  <div className="row sp"><button className="circ" aria-label="Close scanner" onClick={onClose}><Icon n="x"/></button><button className="circ" aria-label="Toggle flashlight" onClick={flash} style={torch?{background:'#fff',color:'#000'}:null}><Icon n="bolt"/></button></div>
  <div className="frame" aria-hidden="true"><i/><i/><i/><i/><u/></div>
  <div style={{textAlign:'center',display:'grid',gap:10}}><h2 className="h1">Scan a product</h2>{err&&<p style={{color:'#FFD27A'}}>{err}</p>}
  <form className="row" onSubmit={e=>{e.preventDefault();manual.trim()&&onDetect(manual.trim())}}><input className="inp" aria-label="Enter barcode manually" placeholder="Or type a barcode" value={manual} onChange={e=>setManual(e.target.value)}/><Button variant="sm" type="submit">Look up</Button></form></div></div></div>;
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
