import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Button,Input} from '../components/ui';

export default function AdminSecurity(){
 const {assurance,beginMfaEnrollment,listMfaFactors,challengeMfa,verifyMfa}=useApp(),navigate=useNavigate();
 const [factors,setFactors]=useState([]),[factorId,setFactorId]=useState(''),[challengeId,setChallengeId]=useState(''),[qrCode,setQrCode]=useState(''),[secret,setSecret]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=async()=>{try{const found=await listMfaFactors();setFactors(found);if(found.length){setFactorId(found[0].id);if(assurance!=='aal2')setChallengeId(await challengeMfa(found[0].id));else setChallengeId('')}}catch(e){setError(e.message)}};
 const qrSrc=qrCode.startsWith('data:image/svg+xml')?qrCode:`data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
 useEffect(()=>{reload()},[]);
 const enroll=async()=>{setBusy(true);setError('');setNotice('');try{const data=await beginMfaEnrollment();setFactorId(data.factorId);setChallengeId(data.challengeId);setQrCode(data.qrCode);setSecret(data.secret)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const submit=async ev=>{ev.preventDefault();if(!factorId||!challengeId)return;setBusy(true);setError('');setNotice('');try{await verifyMfa({factorId,challengeId,code:code.trim()});setCode('');setQrCode('');setSecret('');setChallengeId('');setNotice('Authenticator verified. Admin access is enabled.');setFactors(await listMfaFactors())}catch(e){setError(e.message)}finally{setBusy(false)}};
 const verifyAgain=async()=>{setBusy(true);setError('');try{setChallengeId(await challengeMfa(factorId))}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <main className="page auth-page"><p className="eyebrow">SNAPKART · ACCOUNT SECURITY</p><h1 className="disp">Admin multi-factor authentication</h1><p className="mut">Use an authenticator app to protect store operations. Admin APIs remain locked until a current authenticator code is verified.</p>
  {assurance==='aal2'&&<p className="auth-notice" role="status">This session has verified MFA.</p>}
  {!!factors.length&&<div className="card gap"><h2 className="h2">Authenticator enrolled</h2><p className="mut">{factors.length} verified factor{factors.length===1?'':'s'} available. Add a second device as a backup while you have access to this account.</p><Button variant="sec2" onClick={enroll} loading={busy}>Add another authenticator</Button></div>}
  {!factors.length&&!qrCode&&<div className="card gap"><h2 className="h2">Set up an authenticator</h2><p className="mut">Scan the QR code with an authenticator app, then enter its current six-digit code. Keep access to the app; contact your store owner if you lose every enrolled device.</p><Button onClick={enroll} loading={busy}>Set up MFA</Button></div>}
  {qrCode&&<div className="card gap"><h2 className="h2">Scan this QR code</h2><img alt="Authenticator setup QR code" src={qrSrc} style={{width:220,maxWidth:'100%',height:220,margin:'auto'}}/><p className="mut">Or enter this setup key manually in your authenticator app:</p><code style={{overflowWrap:'anywhere'}}>{secret}</code></div>}
  {factorId&&challengeId&&<form className="card gap" onSubmit={submit}><h2 className="h2">Verify authenticator</h2><Input label="Six-digit code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8}/><Button type="submit" loading={busy}>Verify code</Button>{factors.length>0&&<Button type="button" variant="sec2" disabled={busy} onClick={verifyAgain}>Get a new challenge</Button>}</form>}
  {error&&<p role="alert" className="ferr">{error}</p>}{notice&&<p role="status" className="auth-notice">{notice}</p>}
  <Button variant="sec2" style={{marginTop:16}} disabled={assurance!=='aal2'} onClick={()=>navigate('/admin')}>Continue to admin dashboard</Button>
 </main>;
}
