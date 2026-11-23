import {useCallback,useEffect,useState} from 'react';
import {api} from '../services/api';
import {Button,Input} from '../components/ui';
import {clean} from '../utils/format';

export default function AdminStaffAccess(){
 const [staff,setStaff]=useState([]),[checks,setChecks]=useState([]),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[resolvingId,setResolvingId]=useState(''),[resolutionNotes,setResolutionNotes]=useState({}),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const [data,gateData]=await Promise.all([api.adminStaffAccess(),api.adminGateChecks()]);setStaff(data.staff||[]);setChecks(gateData.checks||[])}catch(e){setError(e.message)}},[]);
 useEffect(()=>{void load()},[load]);
 const grant=async event=>{event.preventDefault();setBusy(true);setError('');setNotice('');try{await api.adminGrantStaff(email.trim());setEmail('');setNotice('Staff gate access granted. The person can sign in with their existing account.');await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const revoke=async person=>{setBusy(true);setError('');setNotice('');try{await api.adminRevokeStaff(person.id);setNotice(`Staff access removed for ${clean(person.email)}.`);await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const resolve=async check=>{const note=resolutionNotes[check.id]?.trim()||'';if(note.length<3)return;setResolvingId(check.id);setError('');setNotice('');try{await api.adminResolveGateCheck(check.id,note);setNotice(`Receipt #${check.receiptNumber} was cleared after supervisor review.`);setResolutionNotes(current=>({...current,[check.id]:''}));await load()}catch(e){setError(e.message)}finally{setResolvingId('')}};
 return <section className="gap"><h2 className="h1">Gate staff access</h2><p className="mut">Staff must first register and verify a SnapKart account. Grant access using that account's email; they should sign out and back in to refresh their role. Gate staff can inspect paid receipts and record exit checks; admin tools remain restricted.</p>
  <form className="card gap" onSubmit={grant}><Input label="Registered staff account email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required/><Button loading={busy} type="submit">Grant gate access</Button></form>
  {error&&<p className="ferr" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}
  <h3 className="h2">Current gate staff ({staff.length})</h3>
  {!staff.length?<div className="card mut">No staff accounts have gate access.</div>:<div className="gap">{staff.map(person=><article className="card row sp" key={person.id}><div><b>{clean(person.name)}</b><p className="mut">{clean(person.email)}</p></div><Button variant="sec2" disabled={busy} onClick={()=>void revoke(person)}>Revoke access</Button></article>)}</div>}
  <h3 className="h2" style={{marginTop:20}}>Recent gate exceptions</h3>
  {!checks.length?<div className="card mut">No recent gate exceptions.</div>:<div className="gap">{checks.map(check=><article className="card gap" key={check.id}><div className="row sp"><b>Receipt #{check.receiptNumber} · {clean(check.outcome)}</b><span className="mut">{new Date(check.createdAt).toLocaleString()}</span></div><p className="mut">Staff: {clean(check.staff.name)} · {clean(check.staff.email)}</p>{check.note&&<p>{clean(check.note)}</p>}{['FLAGGED','DENIED'].includes(check.outcome)&&<><Input label="Supervisor review note" value={resolutionNotes[check.id]||''} onChange={event=>setResolutionNotes(current=>({...current,[check.id]:event.target.value}))} maxLength={500} placeholder="Describe the resolution"/><Button variant="sec2" loading={resolvingId===check.id} disabled={busy||!!resolvingId||(resolutionNotes[check.id]||'').trim().length<3} onClick={()=>void resolve(check)}>Confirm items and clear gate</Button></>}</article>)}</div>}
 </section>;
}
