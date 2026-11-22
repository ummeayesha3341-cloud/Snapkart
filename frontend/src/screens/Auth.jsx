import {useEffect,useState} from 'react';
import {Link,useNavigate,useLocation} from 'react-router-dom';
import {useApp} from '../context/AppContext';
import {Button,Input,Logo,Icon} from '../components/ui';
export default function Auth({mode}){
 const reg=mode==='register',{login,register,verifySignupOtp,resendSignupOtp}=useApp(),nav=useNavigate(),loc=useLocation();
 const [f,setF]=useState({name:'',email:'',password:''}),[e,setE]=useState({}),[err,setErr]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false),[pendingEmail,setPendingEmail]=useState(''),[code,setCode]=useState(''),[resendWait,setResendWait]=useState(0);
 useEffect(()=>{if(!resendWait)return;const timer=window.setTimeout(()=>setResendWait(seconds=>Math.max(0,seconds-1)),1000);return()=>window.clearTimeout(timer)},[resendWait]);
 const set=k=>v=>setF({...f,[k]:v.target.value});
 const submit=async ev=>{ev.preventDefault();if(busy)return;const x={};
  if(reg&&!f.name.trim())x.name='Enter your full name';
  if(!f.email.trim())x.email='Enter your email';else if(!/^\S+@\S+\.\S+$/.test(f.email))x.email='Enter a valid email address';
  if(!f.password)x.password='Enter your password';else if(reg&&f.password.length<10)x.password='Use at least 10 characters';
  setE(x);setErr('');setNotice('');if(Object.keys(x).length)return;setBusy(true);
  try{if(reg){const result=await register({name:f.name.trim(),email:f.email.trim(),password:f.password});if(result?.confirmationRequired){setPendingEmail(f.email.trim());setResendWait(60);setNotice('Your code request was accepted. Email can take a minute to arrive; check spam if you don’t see it.');return}}else await login({email:f.email.trim(),password:f.password});nav(!reg&&loc.state?.from?.pathname?`${loc.state.from.pathname}${loc.state.from.search||''}${loc.state.from.hash||''}`:'/',{replace:true})}
  catch(er){setErr(er.message)}finally{setBusy(false)}};
 const verify=async ev=>{ev.preventDefault();if(busy)return;setErr('');setNotice('');const token=code.trim();if(!/^\d{6,8}$/.test(token)){setErr('Enter the 6–8 digit code from your email.');return}setBusy(true);try{await verifySignupOtp({email:pendingEmail,token});nav('/',{replace:true})}catch(er){setErr(er.message)}finally{setBusy(false)}};
 const resend=async()=>{if(busy||resendWait>0)return;setErr('');setNotice('');setBusy(true);try{await resendSignupOtp(pendingEmail);setResendWait(60);setNotice('A new code was requested. Email can take a minute to arrive.')}catch(er){setErr(er.message)}finally{setBusy(false)}};
 return <div className="page auth-page" style={{paddingTop:56}}><Logo size={44}/><h1 className="disp" style={{margin:'32px 0 6px'}}>{pendingEmail?'Check your email':reg?'Create your account':'Welcome back'}</h1><p className="mut" style={{marginBottom:28}}>{pendingEmail?<>Enter the code sent to <b>{pendingEmail}</b>. You can stay on this page.</>:reg?'Start scanning in under a minute.':'Sign in to continue shopping.'}</p>
 {pendingEmail?<><form onSubmit={verify} noValidate>
 <Input label="Email verification code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={ev=>setCode(ev.target.value.replace(/\D/g,'').slice(0,8))} placeholder="Enter code"/>
 {err&&<p className="ferr" role="alert" style={{marginBottom:12,fontSize:14}}>{err}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}
 <Button type="submit" loading={busy}>{busy?'Verifying...':'Verify email'}</Button></form>
 <div className="row sp" style={{marginTop:20}}><button type="button" className="text-button" disabled={busy||resendWait>0} onClick={resend}>{resendWait>0?`Resend code in ${resendWait}s`:'Resend code'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setPendingEmail('');setCode('');setNotice('');setErr('');setResendWait(0)}}>Change email</button></div></>:<>
 <form onSubmit={submit} noValidate>{reg&&<Input label="Full name" value={f.name} onChange={set('name')} error={e.name} autoComplete="name"/>}
 <Input label="Email" type="email" value={f.email} onChange={set('email')} error={e.email} autoComplete="email"/>
 <div style={{position:'relative'}}><Input label="Password" type={show?'text':'password'} value={f.password} onChange={set('password')} error={e.password} autoComplete={reg?'new-password':'current-password'}/><button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)} style={{position:'absolute',right:6,top:26,width:40,height:44,border:0,background:'none',color:'var(--mut)'}}><Icon n="eye"/></button></div>
 {err&&<p className="ferr" role="alert" style={{marginBottom:12,fontSize:14}}>{err}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}
 <Button type="submit" loading={busy}>{busy?(reg?'Creating account...':'Signing you in...'):reg?'Create Account':'Sign In'}</Button></form>
 <p className="mut" style={{textAlign:'center',marginTop:22}}>{reg?'Already have an account? ':'New to SnapKart? '}<Link to={reg?'/login':'/register'} style={{color:'var(--acc)',fontWeight:600}}>{reg?'Sign in':'Create account'}</Link></p>
 </>}
 </div>;
}
