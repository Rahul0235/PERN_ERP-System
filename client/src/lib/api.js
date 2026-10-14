const BASE=import.meta.env.VITE_API_URL||'http://localhost:8080/api';
export async function api(path,options={}){
 const token=localStorage.getItem('token');const res=await fetch(`${BASE}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(options.headers||{})}});
 const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Request failed');return data;
}
export const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(n||0));
