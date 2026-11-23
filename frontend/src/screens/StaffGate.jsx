import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {api} from '../services/api';
import {useApp} from '../context/AppContext';
import {Button,Header,Input,Price} from '../components/ui';
import {clean,when} from '../utils/format';

function receiptTokenFrom(value){
 let candidate=String(value||'').trim();
 try{const parsed=new URL(candidate);const match=parsed.pathname.match(/^\/receipt\/([^/]+)\/?$/);if(match)candidate=decodeURIComponent(match[1])}catch{}
 return /^[A-Za-z0-9_-]{43}$/.test(candidate)?candidate:'';
}

function ReceiptQrScanner({onScan,onClose}){
 const [error,setError]=useState(''),videoRef=useRef(null);
 useEffect(()=>{const video=videoRef.current;if(!video)return;let active=true,controls=null;
  const start=async()=>{try{
   const [{BrowserMultiFormatReader},{BarcodeFormat,DecodeHintType}]=await Promise.all([import('@zxing/browser'),import('@zxing/library')]);
   if(!active)return;
   const reader=new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER,true],[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.QR_CODE]]]),250);
   controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280}}},video,(result)=>{if(active&&result){active=false;controls?.stop();onScan(result.getText())}});
   if(!active)controls.stop();
  }catch{if(active)setError('Camera access failed. Allow camera access or enter the receipt link manually.')}};
  void start();
  return()=>{active=false;controls?.stop();video.srcObject?.getTracks?.().forEach(track=>track.stop())};
 },[onScan]);
 return <section className="card gap"><div className="row sp"><b>Scan customer receipt QR</b><button className="text-button" type="button" onClick={onClose}>Close</button></div><video ref={videoRef} autoPlay muted playsInline className="gate-camera" aria-label="Receipt QR camera"/>{error&&<p className="ferr" role="alert">{error}</p>}<p className="mut">Point the rear camera at the QR printed on the customer's receipt screen.</p></section>;
}

export default function StaffGate(){
 const {user,logout}=useApp(),navigate=useNavigate();
 const [raw,setRaw]=useState(''),[receipt,setReceipt]=useState(null),[busy,setBusy]=useState(false),[camera,setCamera]=useState(false),[note,setNote]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lookup=useCallback(async(value)=>{
  const token=receiptTokenFrom(value??raw);
  setError('');setNotice('');setReceipt(null);
  if(!token){setError('Enter a valid SnapKart receipt link or scan its QR code.');return}
  setRaw(token);setBusy(true);
  try{const data=await api.staffGateReceipt(token);setReceipt({...data.receipt,token})}catch(e){setError(e.message)}finally{setBusy(false)}
 },[raw]);
 const scanned=useCallback(value=>{setCamera(false);setRaw(value);void lookup(value)},[lookup]);
 const record=async outcome=>{
  if(!receipt)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await api.staffGateCheck(receipt.token,outcome,note.trim());
   setNotice(outcome==='CLEARED'?'Exit cleared. The gate check is recorded.':'Mismatch recorded. Hold the exit and contact the store owner.');
   setNote('');
   const updated=await api.staffGateReceipt(receipt.token);setReceipt({...updated.receipt,token:receipt.token});
   if(result.check?.outcome==='FLAGGED')setReceipt(current=>current?{...current,lastCheck:'FLAGGED'}:current);
  }catch(e){setError(e.message);try{const updated=await api.staffGateReceipt(receipt.token);setReceipt({...updated.receipt,token:receipt.token})}catch{}}
  finally{setBusy(false)}
 };
 return <div className="page staff-gate-page">
  <div className="row sp"><div><p className="eyebrow">SNAPKART · EXIT CHECK</p><h1 className="disp" style={{margin:'4px 0'}}>Staff gate</h1><p className="mut">Signed in as {clean(user?.name||user?.email)}</p></div><Button variant="sec2" onClick={async()=>{await logout();navigate('/login',{replace:true})}}>Sign out</Button></div>
  <div className="card gap gate-instructions"><b>Compare the basket with the receipt</b><p className="mut">The QR proves that an order exists. It does not detect products that were never scanned. Match each physical item and quantity to the receipt before clearing the exit.</p></div>
  {camera?<ReceiptQrScanner onScan={scanned} onClose={()=>setCamera(false)}/>:<Button variant="sec2" onClick={()=>{setError('');setCamera(true)}}>Open receipt camera</Button>}
  <form className="card gap" onSubmit={event=>{event.preventDefault();void lookup()}}><Input label="Receipt QR link or token" value={raw} onChange={event=>setRaw(event.target.value)} autoComplete="off" placeholder="Scan with camera or paste receipt link"/><Button type="submit" loading={busy}>Find receipt</Button></form>
  {error&&<p className="ferr" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}
  {receipt&&<section className="card gap">
   <div className="row sp"><div><p className="eyebrow">RECEIPT #{receipt.receiptNumber}</p><h2 className="h1">Purchase review</h2></div><span className={`pill ${receipt.gateState==='READY_TO_CHECK'?'':'warn'}`}>{receipt.gateState==='READY_TO_CHECK'?'Ready to inspect':receipt.gateState==='ALREADY_CLEARED'?'Already cleared':receipt.gateState==='SUPERVISOR_REVIEW'?'Supervisor review':'Payment required'}</span></div>
   <p className="mut">Order time: {when(receipt.createdAt)} · Payment: {clean(receipt.paymentStatus)}</p>
   {receipt.gateState==='ALREADY_CLEARED'&&<p className="ferr" role="alert">This order has already been cleared at {when(receipt.previouslyClearedAt)}. Do not clear it again.</p>}
   {receipt.gateState==='PAYMENT_REQUIRED'&&<p className="ferr" role="alert">Payment is unsettled or simulated. Hold the exit and contact the store owner.</p>}
   {receipt.gateState==='SUPERVISOR_REVIEW'&&<p className="ferr" role="alert">This receipt is on hold after a mismatch or payment exception. Contact the store owner for review.</p>}
   <div className="gate-items">{receipt.items.map((item,index)=><div className="row sp" key={`${item.barcode}-${index}`}><div><b>{clean(item.name)}</b><p className="mut">Barcode {clean(item.barcode)} · Qty {item.quantity}</p></div><Price minor={item.lineTotalMinor} cur={receipt.currency}/></div>)}</div>
   <div className="row sp"><b>Total</b><Price minor={receipt.totalMinor} cur={receipt.currency}/></div>
   {receipt.gateState==='READY_TO_CHECK'&&<>
    <Input label="Mismatch note (required to flag)" value={note} onChange={event=>setNote(event.target.value)} maxLength={500} placeholder="Describe any missing or extra item"/>
    <div className="gate-actions"><Button loading={busy} onClick={()=>void record('CLEARED')}>Items match · Clear exit</Button><Button variant="sec2" disabled={busy||!note.trim()} onClick={()=>void record('FLAGGED')}>Flag mismatch</Button></div>
   </>}
  </section>}
 </div>;
}
