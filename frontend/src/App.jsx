import {Routes,Route,Navigate,useLocation} from 'react-router-dom';
import {useApp} from './context/AppContext';
import {BottomNav,Toast,Logo} from './components/ui';
import Auth from './screens/Auth';import Home from './screens/Home';import Scan from './screens/Scan';import Cart from './screens/Cart';import Checkout from './screens/Checkout';
import {Bills,BillDetail} from './screens/Bills';import {Search,Profile,Help,StoreMap} from './screens/Misc';
import ProductDetail from './screens/ProductDetail';
import Admin from './screens/Admin';
import AdminSecurity from './screens/AdminSecurity';
import PublicReceipt from './screens/PublicReceipt';
const CustomerGuard=({children})=>{const {user}=useApp(),loc=useLocation();return !user?<Navigate to="/login" state={{from:loc}} replace/>:user.role==='ADMIN'?<Navigate to="/admin" replace/>:children};
const AdminIdentityGuard=({children})=>{const {user}=useApp();return !user?<Navigate to="/login" replace/>:user.role==='ADMIN'?children:<Navigate to="/" replace/>};
const AdminGuard=({children})=>{const {user,assurance}=useApp();return !user?<Navigate to="/login" replace/>:user.role!=='ADMIN'?<Navigate to="/" replace/>:assurance!=='aal2'?<Navigate to="/admin/security" replace/>:children};
const RoleLanding=()=>{const {user}=useApp();return !user?<Navigate to="/login" replace/>:user.role==='ADMIN'?<Navigate to="/admin" replace/>:<Home/>};
export default function App(){
 const {ready,user}=useApp(),loc=useLocation();
 if(!ready)return <div className="shell"><div className="splash"><div><Logo size={72} text={false}/><h1 className="disp">SnapKart</h1><p className="mut">Scan. Shop. Done.</p></div></div></div>;
 const tabs=user?.role==='CUSTOMER'&&['/','/cart','/bills','/profile'].includes(loc.pathname);
 return <div className="shell"><Toast/><Routes>
  <Route path="/login" element={user?<Navigate to={user.role==='ADMIN'?'/admin/security':'/'} replace/>:<Auth mode="login"/>}/><Route path="/register" element={user?<Navigate to={user.role==='ADMIN'?'/admin/security':'/'} replace/>:<Auth mode="register"/>}/><Route path="/forgot-password" element={<Auth mode="forgot"/>}/><Route path="/reset-password" element={<Auth mode="reset"/>}/>
  <Route path="/receipt/:token" element={<PublicReceipt/>}/>
  <Route path="/" element={<RoleLanding/>}/><Route path="/scan" element={<CustomerGuard><Scan/></CustomerGuard>}/><Route path="/cart" element={<CustomerGuard><Cart/></CustomerGuard>}/><Route path="/checkout" element={<CustomerGuard><Checkout/></CustomerGuard>}/>
  <Route path="/bills" element={<CustomerGuard><Bills/></CustomerGuard>}/><Route path="/bills/:id" element={<CustomerGuard><BillDetail/></CustomerGuard>}/><Route path="/search" element={<CustomerGuard><Search/></CustomerGuard>}/><Route path="/products/:barcode" element={<CustomerGuard><ProductDetail/></CustomerGuard>}/><Route path="/admin/security" element={<AdminIdentityGuard><AdminSecurity/></AdminIdentityGuard>}/><Route path="/admin" element={<AdminGuard><Admin/></AdminGuard>}/>
  <Route path="/profile" element={<CustomerGuard><Profile/></CustomerGuard>}/><Route path="/help" element={<CustomerGuard><Help/></CustomerGuard>}/><Route path="/map" element={<CustomerGuard><StoreMap/></CustomerGuard>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>
  {user&&tabs&&<BottomNav/>}</div>;
}
