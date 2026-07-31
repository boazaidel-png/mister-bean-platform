"use client";

import { createContext, FormEvent, useContext, useEffect, useState } from "react";
import Image from "next/image";
import {
  Activity,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Coffee,
  Eye,
  FileText,
  FileSignature,
  Headphones,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  MonitorCog,
  Plus,
  ShieldCheck,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import {
  LeadsWorkspace,
  QuotesWorkspace,
} from "@/components/sales-workspace";
import {
  convertApprovedQuoteToCustomer,
  deleteQuote,
  getOrCreateUserProfile,
  importSalesWorkspace,
  observeAuth,
  resetPassword,
  savePlatformStore,
  saveLead,
  saveQuote,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  subscribeToPlatformStore,
  subscribeToSalesWorkspace,
  subscribeToCustomers,
  subscribeToUserProfiles,
  updateUserAccess,
} from "@/lib/firebase-platform";
import type {
  Customer,
  Lead,
  Machine,
  Order,
  PlatformStore as Store,
  PreviewContext,
  Quote,
  Role,
  SalesWorkspace,
  Task,
  Ticket,
  UserProfile,
  View,
} from "@/lib/platform-types";

const seedCustomers: Customer[] = [
  { id:"c1",name:"Matrix",status:"פעיל",rank:"אסטרטגי",contactName:"נועה לוי",phone:"050-555-1101",email:"noa@matrix-demo.co.il",city:"הרצליה",address:"אבא אבן 10",owner:"מיכל כהן",monthlyKg:145,contractEnd:"2027-03-31",serviceLevel:"פרימיום",branches:["מטה הרצליה","תל אביב","חיפה"] },
  { id:"c2",name:"Check Point",status:"פעיל",rank:"אסטרטגי",contactName:"רועי בן דוד",phone:"052-555-2202",email:"roi@checkpoint-demo.co.il",city:"תל אביב",address:"הסוללים 5",owner:"מיכל כהן",monthlyKg:210,contractEnd:"2026-09-15",serviceLevel:"פרימיום",branches:["מטה תל אביב","פתח תקווה","באר שבע","חיפה"] },
  { id:"c3",name:"Monday",status:"פעיל",rank:"חשוב",contactName:"יעל רז",phone:"054-555-3303",email:"yael@monday-demo.co.il",city:"תל אביב",address:"יצחק שדה 6",owner:"אורן לוי",monthlyKg:120,contractEnd:"2027-01-10",serviceLevel:"מורחב",branches:["מגדל תוהא","רוטשילד"] },
  { id:"c4",name:"משרד עו״ד גורניצקי",status:"פעיל",rank:"חשוב",contactName:"אפרת שחר",phone:"050-555-4404",email:"efrat@gornitzky-demo.co.il",city:"תל אביב",address:"החרש 20",owner:"אורן לוי",monthlyKg:70,contractEnd:"2026-08-28",serviceLevel:"מורחב",branches:["המשרד הראשי"] },
  { id:"c5",name:"מלון בוטיק הים",status:"בסיכון",rank:"רגיל",contactName:"דניאל מזרחי",phone:"052-555-5505",email:"daniel@hayam-demo.co.il",city:"הרצליה",address:"רמת ים 44",owner:"דנה שגב",monthlyKg:48,contractEnd:"2026-09-05",serviceLevel:"רגיל",branches:["קבלה","מסעדה"] },
  { id:"c6",name:"ריווליס",status:"פעיל",rank:"חשוב",contactName:"מירב שלום",phone:"054-555-6606",email:"meirav@rivulis-demo.co.il",city:"גבעת ברנר",address:"פארק תעשיות גבעת ברנר",owner:"דנה שגב",monthlyKg:82,contractEnd:"2027-06-30",serviceLevel:"מורחב",branches:["מטה","מפעל"] },
  { id:"c7",name:"חברת הייטק מערב",status:"בהקמה",rank:"רגיל",contactName:"עמית אור",phone:"050-555-7707",email:"amit@west-demo.co.il",city:"ראשון לציון",address:"משה לוי 11",owner:"אורן לוי",monthlyKg:55,contractEnd:"2027-07-15",serviceLevel:"רגיל",branches:["מערב ראשון"] },
  { id:"c8",name:"קפה מרכז העיר",status:"בהשהיה",rank:"רגיל",contactName:"ליאור אמסלם",phone:"052-555-8808",email:"lior@center-demo.co.il",city:"ירושלים",address:"יפו 82",owner:"דנה שגב",monthlyKg:35,contractEnd:"2026-10-12",serviceLevel:"רגיל",branches:["סניף יפו","סניף ממילא"] },
];

const models = ["Jura X10","Jura E8","Dr. Coffee F11","Dr. Coffee F15","Emilio Mini","Jetinno JL15","מקציף חלב","מקרר חלב","פילטר מים"];
const machineSeed: Machine[] = seedCustomers.flatMap((c, ci) => {
  const count = ci === 1 ? 12 : [5,12,6,3,4,5,2,3][ci];
  return Array.from({ length: count }, (_, i) => ({
    id:`m${ci+1}-${i+1}`, accountId:c.id, site:c.branches[i % c.branches.length],
    model:models[(ci+i)%models.length], serial:`MB-${2022+((i+ci)%4)}-${(ci+1)*1000+i+11}`,
    status:c.id==="c5"&&i===0?"מושבתת":i===2&&ci%3===0?"דורשת טיפול":"פעילה",
    commercial:i%3===0?"השכרה":i%3===1?"ללא עלות":"מכירה",
    location:i%2?"מטבחון קומה 2":"חלל מרכזי",
    lastService:`2026-0${Math.min(7,3+(i%5))}-${String(8+(i%18)).padStart(2,"0")}`,
    nextService:i===1&&ci%2===0?"2026-07-18":`2026-${String(8+(i%4)).padStart(2,"0")}-${String(5+(i%20)).padStart(2,"0")}`,
  }));
});

const ticketSeed: Ticket[] = [
  {id:"SR-1048",accountId:"c5",site:"קבלה",machineId:"m5-1",type:"המכונה לא נדלקת",urgency:"דחופה",status:"ממתין לטכנאי",description:"המכונה לא מגיבה מאז הבוקר",contact:"דניאל מזרחי",phone:"052-555-5505",assignedTo:"אבי טכנאי",openedAt:"2026-07-30T07:40",updatedAt:"2026-07-30T09:10"},
  {id:"SR-1047",accountId:"c1",site:"מטה הרצליה",machineId:"m1-1",type:"בעיית חלב / מקציף",urgency:"גבוהה",status:"בטיפול",description:"הקצפת החלב חלשה",contact:"נועה לוי",phone:"050-555-1101",assignedTo:"רוני שירות",openedAt:"2026-07-29T11:30",updatedAt:"2026-07-30T08:15"},
  {id:"SR-1046",accountId:"c1",site:"תל אביב",machineId:"m1-3",type:"נזילה",urgency:"רגילה",status:"ממתין ללקוח",description:"נזילה קלה מתחת למגש",contact:"נועה לוי",phone:"050-555-1101",assignedTo:"רוני שירות",openedAt:"2026-07-28T14:20",updatedAt:"2026-07-29T10:00"},
  {id:"SR-1045",accountId:"c3",site:"מגדל תוהא",machineId:"m3-2",type:"קפה יוצא חלש",urgency:"רגילה",status:"תואם ביקור",description:"נדרש כיול",contact:"יעל רז",phone:"054-555-3303",assignedTo:"אבי טכנאי",openedAt:"2026-07-27T09:05",updatedAt:"2026-07-29T15:30"},
  {id:"SR-1044",accountId:"c6",site:"מפעל",machineId:"m6-3",type:"דרוש ניקוי",urgency:"רגילה",status:"נסגרה",description:"ניקוי תקופתי",contact:"מירב שלום",phone:"054-555-6606",assignedTo:"אבי טכנאי",openedAt:"2026-07-22T10:00",updatedAt:"2026-07-23T16:00",closedAt:"2026-07-23T16:00",closeReason:"בוצע ניקוי מלא"},
];

const orderSeed: Order[] = seedCustomers.map((c,i)=>({
  id:`o-${c.id}`,accountId:c.id,month:"אוגוסט 2026",defaultKg:c.monthlyKg,
  requestedKg:i===4?28:c.monthlyKg+(i%3===0?10:0),approvedKg:0,
  status:i%3===0?"ממתין לאישור":i%3===1?"ממתין לעדכון לקוח":"עודכן על ידי לקוח",
  blend:["Mister Bean Classic","Mister Bean Premium","Espresso Club 45","Blend Office","Decaf"][i%5],
  note:i===2?"נא לפצל בין שני הסניפים":""
}));
const taskSeed: Task[] = [
  {id:"t1",accountId:"c5",title:"לתאם טכנאי לקריאה דחופה",type:"שירות",dueDate:"2026-07-30",priority:"גבוהה",status:"בטיפול",assignedTo:"רוני שירות"},
  {id:"t2",accountId:"c4",title:"שיחת חידוש הסכם",type:"חוזה",dueDate:"2026-08-05",priority:"גבוהה",status:"פתוחה",assignedTo:"מיכל כהן"},
  {id:"t3",accountId:"c1",title:"בדיקת פיזור קפה בין סניפים",type:"הזמנה",dueDate:"2026-08-02",priority:"בינונית",status:"פתוחה",assignedTo:"דנה שגב"},
  {id:"t4",accountId:"c7",title:"השלמת התקנת מכונה",type:"מכונה",dueDate:"2026-08-01",priority:"בינונית",status:"פתוחה",assignedTo:"אבי טכנאי"},
];
const initialStore: Store = {tickets:ticketSeed,orders:orderSeed,tasks:taskSeed,machines:machineSeed};

const roleNames: Record<Role,string> = {customer:"לקוח רגיל",multi:"מנהל לקוח מרובה סניפים",service:"נציג שירות",admin:"מנהל מערכת"};
const customerNav = [
  {id:"dashboard" as View,label:"דף הבית",icon:LayoutDashboard},{id:"machines" as View,label:"המכונות שלי",icon:MonitorCog},
  {id:"tickets" as View,label:"קריאות שירות",icon:Headphones},{id:"orders" as View,label:"הזמנת קפה",icon:Coffee},
  {id:"contract" as View,label:"ההסכם שלי",icon:FileText},{id:"contact" as View,label:"יצירת קשר",icon:MessageCircle},
];
const adminNav = [
  {id:"dashboard" as View,label:"מרכז שליטה",icon:LayoutDashboard},{id:"leads" as View,label:"לידים",icon:UsersRound},
  {id:"quotes" as View,label:"הצעות מחיר",icon:FileSignature},{id:"customers" as View,label:"לקוחות",icon:Building2},
  {id:"tickets" as View,label:"שירות ותקלות",icon:Headphones},{id:"orders" as View,label:"הזמנות קפה",icon:Coffee},
  {id:"machines" as View,label:"צי מכונות",icon:MonitorCog},{id:"tasks" as View,label:"משימות צוות",icon:ListTodo},
  {id:"reports" as View,label:"תובנות ודוחות",icon:ChartNoAxesCombined},{id:"access" as View,label:"ניהול והרשאות",icon:UserCog},
];

const CustomerDirectoryContext = createContext<Customer[]>(seedCustomers);
const useCustomerName = () => {
  const directory = useContext(CustomerDirectoryContext);
  return (id:string) => directory.find(customer=>customer.id===id)?.name || "—";
};
const formatDate = (v:string) => new Intl.DateTimeFormat("he-IL").format(new Date(v));
const greetingForHour = (hour:number) => {
  if(hour<5)return "לילה טוב";
  if(hour<12)return "בוקר טוב";
  if(hour<17)return "צהריים טובים";
  if(hour<21)return "ערב טוב";
  return "לילה טוב";
};
const statusTone = (s:string) => s.includes("דחופ")||s.includes("מושבת")||s==="בסיכון"?"red":s.includes("ממתין")||s.includes("בטיפול")?"blue":s.includes("אישור")||s.includes("חריג")||s.includes("דורשת")?"orange":s.includes("פעיל")||s.includes("אושר")||s.includes("בוצע")||s.includes("סופק")?"green":"gray";
const closed = (s:string) => ["נסגרה","בוטלה"].includes(s);
const slaBreached = (ticket: Ticket) => {
  if (closed(ticket.status)) return false;
  const hours = ticket.urgency === "דחופה" ? 4 : ticket.urgency === "גבוהה" ? 24 : 72;
  return new Date("2026-07-30T12:00").getTime() - new Date(ticket.openedAt).getTime() > hours * 3_600_000;
};
const riskReasons = (customer: Customer, store: Store) => {
  const open = store.tickets.filter(t=>t.accountId===customer.id&&!closed(t.status));
  const order = store.orders.find(o=>o.accountId===customer.id);
  const reasons:string[] = [];
  if(open.length>=2) reasons.push("2 קריאות פתוחות או יותר");
  if(open.some(t=>t.urgency==="דחופה")) reasons.push("קריאה דחופה פתוחה");
  const contractDays=(new Date(customer.contractEnd).getTime()-new Date("2026-07-30").getTime())/86_400_000;
  if(contractDays<=60) reasons.push("הסכם מסתיים בקרוב");
  if(order&&order.requestedKg<order.defaultKg*.7) reasons.push("ירידה חריגה בהזמנה");
  if(store.machines.some(m=>m.accountId===customer.id&&m.status==="מושבתת")) reasons.push("מכונה מושבתת");
  return reasons;
};
function Badge({children}:{children:string}) { return <span className={`badge ${statusTone(children)}`}>{children}</span>; }
function BrandIcon({large=false}:{large?:boolean}) {
  return <span className={`brand-mark ${large?"large":""}`}><Image src="/mister-bean-platform/app-icon-192.png" width={192} height={192} alt="Mister Bean"/></span>;
}

export default function Home() {
  const [profile,setProfile] = useState<UserProfile|null>(null);
  const [preview,setPreview] = useState<PreviewContext|null>(null);
  const [previewOpen,setPreviewOpen] = useState(false);
  const [view,setView] = useState<View>("dashboard");
  const [store,setStore] = useState<Store>(initialStore);
  const [salesWorkspace,setSalesWorkspace] = useState<SalesWorkspace>({leads:[],quotes:[]});
  const [customers,setCustomers] = useState<Customer[]>(seedCustomers);
  const [storeReady,setStoreReady] = useState(false);
  const [authReady,setAuthReady] = useState(false);
  const [authBusy,setAuthBusy] = useState(false);
  const [authError,setAuthError] = useState("");
  const [syncError,setSyncError] = useState("");
  const [users,setUsers] = useState<UserProfile[]>([]);
  const [selectedCustomer,setSelectedCustomer] = useState("c1");
  const [modal,setModal] = useState<null|"ticket"|"task"|"close"|"detail">(null);
  const [selectedTicket,setSelectedTicket] = useState<string>("");
  const [toast,setToast] = useState("");
  const [mobileOpen,setMobileOpen] = useState(false);
  const [greeting] = useState(()=>greetingForHour(new Date().getHours()));

  useEffect(()=>{
    let active=true;
    let unsubscribeStore:()=>void=()=>{};
    let unsubscribeSales:()=>void=()=>{};
    let unsubscribeCustomers:()=>void=()=>{};
    let unsubscribeUsers:()=>void=()=>{};
    const unsubscribeAuth=observeAuth(user=>{
      unsubscribeStore();
      unsubscribeSales();
      unsubscribeCustomers();
      unsubscribeUsers();
      setStoreReady(false);
      setSyncError("");
      setAuthReady(false);
      if(!user){
        if(active){
          setProfile(null);
          setPreview(null);
          setAuthReady(true);
        }
        return;
      }
      void (async()=>{
        try{
          const nextProfile=await getOrCreateUserProfile(user);
          if(!active)return;
          setProfile(nextProfile);
          setSelectedCustomer(nextProfile.accountIds[0]||"c1");
          if(nextProfile.status==="active"){
            unsubscribeStore=subscribeToPlatformStore(
              nextProfile,
              next=>{if(active){setStore(next);setStoreReady(true);setSyncError("");}},
              error=>{if(active)setSyncError(firebaseMessage(error));}
            );
            if(nextProfile.role==="admin"||nextProfile.role==="service"){
              unsubscribeSales=subscribeToSalesWorkspace(
                nextProfile,
                next=>{if(active){setSalesWorkspace(next);setSyncError("");}},
                error=>{if(active)setSyncError(firebaseMessage(error));}
              );
            }
            unsubscribeCustomers=subscribeToCustomers(
              nextProfile,
              next=>{if(active&&next.length){setCustomers(next);setSyncError("");}},
              error=>{if(active)setSyncError(firebaseMessage(error));}
            );
            if(nextProfile.role==="admin"){
              unsubscribeUsers=subscribeToUserProfiles(
                next=>{if(active){setUsers(next);setSyncError("");}},
                error=>{if(active)setSyncError(firebaseMessage(error));}
              );
            }
          }
        }catch(error){
          if(active)setAuthError(firebaseMessage(error));
        }finally{
          if(active)setAuthReady(true);
        }
      })();
    });
    return()=>{active=false;unsubscribeStore();unsubscribeSales();unsubscribeCustomers();unsubscribeUsers();unsubscribeAuth();};
  },[]);
  useEffect(()=>{
    if(!storeReady||!profile||profile.status!=="active"||preview)return;
    void savePlatformStore(store).catch(error=>setSyncError(firebaseMessage(error)));
  },[store,storeReady,profile,preview]);
  useEffect(()=>{ if(toast){ const t=setTimeout(()=>setToast(""),2800); return()=>clearTimeout(t); } },[toast]);
  useEffect(()=>{
    if(!mobileOpen)return;
    const previousOverflow=document.body.style.overflow;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setMobileOpen(false);};
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",closeOnEscape);
    return()=>{
      document.body.style.overflow=previousOverflow;
      window.removeEventListener("keydown",closeOnEscape);
    };
  },[mobileOpen]);

  const role = preview?.role || profile?.role || null;
  const isStaff = role==="service"||role==="admin";
  const readOnly = Boolean(preview);
  const clientId = selectedCustomer;
  const scopedMachines = isStaff?store.machines:store.machines.filter(m=>m.accountId===clientId);
  const scopedTickets = isStaff?store.tickets:store.tickets.filter(t=>t.accountId===clientId);
  const scopedOrders = isStaff?store.orders:store.orders.filter(o=>o.accountId===clientId);
  const nav = isStaff?adminNav.filter(item=>item.id!=="access"||role==="admin"):customerNav;
  const firstName = (profile?.displayName||profile?.email||"משתמש").trim().split(/\s+/)[0];
  const selectedCustomerName = customers.find(customer=>customer.id===selectedCustomer)?.name || "—";

  const navigate=(next:View)=>{setView(next);setMobileOpen(false);};
  const allowWrite=()=>{if(readOnly){setToast("מצב התצוגה הוא לקריאה בלבד");return false;}return true;};
  const openTicket=(machineId="")=>{if(!allowWrite())return;setSelectedTicket(machineId);setModal("ticket");};
  const openTicketForCustomer=(accountId:string)=>{if(!allowWrite())return;setSelectedCustomer(accountId);setSelectedTicket("");setModal("ticket");};
  const openTaskForCustomer=(accountId:string)=>{if(!allowWrite())return;setSelectedCustomer(accountId);setModal("task");};
  const openCustomer=(id:string)=>{setSelectedCustomer(id);setView("customer");};
  const enterPreview=(next:PreviewContext)=>{setPreview(next);setSelectedCustomer(next.accountId||"c1");setView("dashboard");setPreviewOpen(false);setModal(null);};
  const leavePreview=()=>{setPreview(null);setView("dashboard");setModal(null);};
  const loginGoogle=async()=>{setAuthBusy(true);setAuthError("");try{await signInWithGoogle();}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const loginEmail=async(email:string,password:string)=>{setAuthBusy(true);setAuthError("");try{await signInWithEmail(email,password);}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const sendReset=async(email:string)=>{setAuthBusy(true);setAuthError("");try{await resetPassword(email);setToast("קישור לאיפוס סיסמה נשלח");}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};

  if(!authReady) return <LoadingScreen/>;
  if(!profile) return <Login onGoogle={loginGoogle} onEmail={loginEmail} onReset={sendReset} busy={authBusy} error={authError}/>;
  if(profile.status==="pending") return <PendingAccess profile={profile} onLogout={()=>void signOutUser()}/>;
  if(!role) return <LoadingScreen/>;

  return (
    <CustomerDirectoryContext.Provider value={customers}>
    <div className={`app-shell ${preview?"previewing":""}`} dir="rtl">
      {preview&&<div className="preview-banner"><Eye size={17}/><span>מצב תצוגה: <strong>{roleNames[preview.role]}</strong>{!isStaff&&<> · {selectedCustomerName}</>}</span><b>קריאה בלבד</b><button onClick={leavePreview}><X size={16}/> חזרה לניהול</button></div>}
      <aside className={`sidebar ${mobileOpen?"open":""}`}>
        <div className="brand"><BrandIcon/><div><strong>Mister Bean</strong><small>ניהול ושירות לקוחות</small></div></div>
        <span className="sidebar-label">{isStaff?"ניהול ותפעול":"אזור הלקוח"}</span>
        <nav>{nav.map(n=>{const Icon=n.icon;return <button key={n.id} className={view===n.id?"active":""} onClick={()=>navigate(n.id)}><Icon size={18}/>{n.label}{n.id==="tickets"&&<b className="nav-count">{scopedTickets.filter(t=>!closed(t.status)).length}</b>}</button>})}</nav>
        <div className="sidebar-foot">
          <div className="avatar">{roleNames[role].slice(0,2)}</div>
          <div><strong>{preview?roleNames[role]:profile.displayName}</strong><small>{preview?"מצב תצוגה":profile.email}</small></div>
          <button className="logout" onClick={()=>void signOutUser()} aria-label="התנתקות"><LogOut size={17}/><span>התנתקות</span></button>
        </div>
      </aside>
      {mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="סגירת התפריט"/>}
      <main>
        <header className="topbar">
          <button className="menu" onClick={()=>setMobileOpen(v=>!v)} aria-label={mobileOpen?"סגירת תפריט":"פתיחת תפריט"} aria-expanded={mobileOpen}><Menu size={23}/></button>
          <div className="page-heading"><span>{greeting}, {firstName}</span><h1>{nav.find(n=>n.id===view)?.label || (view==="customer"?"כרטיס לקוח":"מערכת שירות")}</h1></div>
          <div className="top-actions">
            {!isStaff&&role==="multi"&&<select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="c1">Matrix — כל הסניפים</option></select>}
            {profile.role==="admin"&&!preview&&<button className="preview-button" onClick={()=>setPreviewOpen(true)}><Eye size={17}/> תצוגת מערכת</button>}
            {isStaff&&<button className="top-create" onClick={()=>openTicket()}><Plus size={17}/> קריאה חדשה</button>}
          </div>
        </header>
        <div className="content">
          {view==="dashboard"&&(isStaff?<AdminDashboard store={store} sales={salesWorkspace} customers={customers} go={navigate} openCustomer={openCustomer} greeting={greeting} firstName={firstName}/>:<CustomerDashboard customer={customers.find(c=>c.id===clientId)||seedCustomers[0]} store={store} go={navigate} openTicket={openTicket} greeting={greeting}/>)}
          {view==="leads"&&isStaff&&<LeadsWorkspace workspace={salesWorkspace} readOnly={readOnly} canMigrate={profile.role==="admin"&&!preview} onSaveLead={async(lead:Lead)=>{if(!allowWrite())return;await saveLead(lead);setToast("הליד נשמר");}} onSaveQuote={async(quote:Quote)=>{if(!allowWrite())return;await saveQuote(quote);setToast("הצעת המחיר נשמרה");}} onImport={async(next:SalesWorkspace)=>{if(!allowWrite())return;const result=await importSalesWorkspace(next);setToast(`הועברו ${result.importedLeads} לידים ו־${result.importedQuotes} הצעות. במאגר המאוחד: ${result.storedLeads} לידים ו־${result.storedQuotes} הצעות.`);}} onOpenQuotes={()=>navigate("quotes")}/>}
          {view==="quotes"&&isStaff&&<QuotesWorkspace workspace={salesWorkspace} readOnly={readOnly} onSaveQuote={async(quote:Quote)=>{if(!allowWrite())return;await saveQuote(quote);setToast("הצעת המחיר נשמרה");}} onDeleteQuote={async(quoteId:string)=>{if(!allowWrite())return;await deleteQuote(quoteId);setToast("גרסת ההצעה נמחקה");}} onConvert={async(quote:Quote,lead?:Lead)=>{if(!allowWrite())throw new Error("מצב תצוגה הוא לקריאה בלבד");const accountId=await convertApprovedQuoteToCustomer(quote,lead);setToast("חשבון הלקוח הוקם");return accountId;}} onOpenLeads={()=>navigate("leads")}/>}
          {view==="customers"&&<Customers customers={customers} store={store} openCustomer={openCustomer} openTicket={openTicketForCustomer} openTask={openTaskForCustomer}/>}
          {view==="customer"&&<CustomerCard customer={customers.find(c=>c.id===selectedCustomer)||seedCustomers[0]} store={store} openTicket={openTicket} openTask={()=>{if(allowWrite())setModal("task");}}/>}
          {view==="tickets"&&<Tickets tickets={scopedTickets} machines={store.machines} isStaff={isStaff} onUpdate={(id,status)=>{if(!allowWrite())return;setStore(s=>({...s,tickets:s.tickets.map(t=>t.id===id?{...t,status,updatedAt:new Date().toISOString()}:t)}));setToast("סטטוס הקריאה עודכן");}} onOpen={id=>{setSelectedTicket(id);setModal("detail");}} onClose={id=>{if(!allowWrite())return;setSelectedTicket(id);setModal("close");}} openTicket={openTicket}/>}
          {view==="machines"&&<Machines machines={scopedMachines} isStaff={isStaff} openTicket={openTicket} onStatus={(id,status)=>{if(!allowWrite())return;setStore(s=>({...s,machines:s.machines.map(m=>m.id===id?{...m,status}:m)}));}}/>}
          {view==="orders"&&<Orders orders={scopedOrders} isStaff={isStaff} onChange={(id,data)=>{if(!allowWrite())return;setStore(s=>({...s,orders:s.orders.map(o=>o.id===id?{...o,...data}:o)}));setToast(isStaff?"ההזמנה עודכנה":"השינוי נשמר וממתין לאישור הצוות");}}/>}
          {view==="tasks"&&<Tasks tasks={store.tasks} onCreate={()=>{if(allowWrite())setModal("task");}} onStatus={(id,status)=>{if(!allowWrite())return;setStore(s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,status}:t)}));}}/>}
          {view==="reports"&&<Reports store={store}/>}
          {view==="access"&&profile.role==="admin"&&<AccessManagement customers={customers} users={users} readOnly={readOnly} onSave={async(user,role,accountIds,status)=>{if(!allowWrite())return;try{await updateUserAccess(user.uid,role,accountIds,status);setToast("ההרשאות עודכנו בהצלחה");}catch(error){setSyncError(firebaseMessage(error));}}} onPreview={next=>enterPreview(next)}/>}
          {view==="contract"&&<Contract customer={customers.find(c=>c.id===clientId)||seedCustomers[0]} machines={scopedMachines}/>}
          {view==="contact"&&<Contact/>}
        </div>
      </main>
      <div className="mobile-nav">{nav.slice(0,5).map(n=>{const Icon=n.icon;return <button key={n.id} className={view===n.id?"active":""} onClick={()=>navigate(n.id)}><Icon size={19}/>{n.label}</button>})}</div>
      {modal==="ticket"&&<TicketModal customers={customers} accountId={isStaff?selectedCustomer:clientId} allowAccountChange={isStaff} preselectedMachine={selectedTicket} machines={store.machines} onClose={()=>setModal(null)} onSave={ticket=>{setStore(s=>({...s,tickets:[ticket,...s.tickets]}));setModal(null);setView("tickets");setToast(`הקריאה ${ticket.id} נפתחה בהצלחה`);}}/>}
      {modal==="task"&&<TaskModal customers={customers} accountId={selectedCustomer} onClose={()=>setModal(null)} onSave={task=>{setStore(s=>({...s,tasks:[task,...s.tasks]}));setModal(null);setToast("המשימה נוצרה בהצלחה");}}/>}
      {modal==="close"&&<CloseModal onClose={()=>setModal(null)} onSave={reason=>{setStore(s=>({...s,tickets:s.tickets.map(t=>t.id===selectedTicket?{...t,status:"נסגרה",closedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),closeReason:reason}:t)}));setModal(null);setToast("הקריאה נסגרה");}}/>}
      {modal==="detail"&&<TicketDetailModal ticket={store.tickets.find(t=>t.id===selectedTicket)!} machine={store.machines.find(m=>m.id===store.tickets.find(t=>t.id===selectedTicket)?.machineId)} onClose={()=>setModal(null)}/>}
      {previewOpen&&<PreviewModal customers={customers} currentAccount={selectedCustomer} onClose={()=>setPreviewOpen(false)} onEnter={enterPreview}/>}
      {syncError&&<div className="sync-error"><LockKeyhole size={16}/><span>הסנכרון ממתין להגדרת Firebase: {syncError}</span></div>}
      {toast&&<div className="toast">✓ {toast}</div>}
    </div>
    </CustomerDirectoryContext.Provider>
  );
}

function CoffeeBotanical({className=""}:{className?:string}) {
  return <svg className={`coffee-botanical ${className}`} viewBox="0 0 360 260" aria-hidden="true" focusable="false">
    <path className="coffee-stem" d="M22 238C93 196 117 142 155 92C190 46 246 24 337 18"/>
    <path className="coffee-stem fine" d="M113 153C86 130 63 107 48 73M174 70C157 48 145 29 141 8M226 40C246 69 269 88 305 98"/>
    <ellipse className="coffee-leaf" cx="77" cy="120" rx="35" ry="15" transform="rotate(34 77 120)"/>
    <ellipse className="coffee-leaf light" cx="124" cy="93" rx="37" ry="16" transform="rotate(-37 124 93)"/>
    <ellipse className="coffee-leaf" cx="163" cy="51" rx="34" ry="14" transform="rotate(52 163 51)"/>
    <ellipse className="coffee-leaf light" cx="230" cy="45" rx="38" ry="16" transform="rotate(-22 230 45)"/>
    <ellipse className="coffee-leaf" cx="283" cy="76" rx="34" ry="14" transform="rotate(35 283 76)"/>
    <g className="coffee-cherries">
      <circle cx="152" cy="102" r="13"/><circle cx="177" cy="91" r="12"/><circle cx="178" cy="116" r="11"/>
      <circle cx="215" cy="64" r="10"/><circle cx="235" cy="73" r="12"/>
    </g>
    <g className="coffee-highlights">
      <circle cx="148" cy="98" r="3"/><circle cx="173" cy="87" r="2.7"/><circle cx="231" cy="69" r="2.5"/>
    </g>
  </svg>;
}

function Login({onGoogle,onEmail,onReset,busy,error}:{onGoogle:()=>Promise<void>;onEmail:(email:string,password:string)=>Promise<void>;onReset:(email:string)=>Promise<void>;busy:boolean;error:string}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const submit=(event:FormEvent)=>{event.preventDefault();void onEmail(email,password);};
  return <div className="login" dir="rtl"><CoffeeBotanical className="login-coffee-branch"/><div className="login-panel">
    <div className="login-brand"><BrandIcon large/><div><h1>Mister Bean</h1><p>מערכת ניהול ושירות לקוחות</p></div></div>
    <div className="login-copy auth-copy"><h2>כניסה למערכת</h2></div>
    <form className="auth-form" onSubmit={submit}>
      <label><span>כתובת דוא״ל</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="email" placeholder="name@company.co.il"/></label>
      <label><span>סיסמה</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} required autoComplete="current-password" placeholder="••••••••"/></label>
      {error&&<div className="auth-error">{error}</div>}
      <button className="auth-primary" type="submit" disabled={busy}>{busy?"מתחבר...":"כניסה למערכת"}</button>
      <button className="reset-link" type="button" disabled={busy||!email} onClick={()=>void onReset(email)}>שכחתי סיסמה</button>
      <div className="auth-divider"><span>או</span></div>
      <button className="google-login" type="button" disabled={busy} onClick={()=>void onGoogle()}><b>G</b> כניסה באמצעות Google</button>
    </form>
  </div></div>;
}

function LoadingScreen(){return <div className="loading-screen" dir="rtl"><BrandIcon large/><h1>Mister Bean</h1><p>מחברים את סביבת העבודה המאובטחת…</p><i/></div>}

function PendingAccess({profile,onLogout}:{profile:UserProfile;onLogout:()=>void}){return <div className="pending-screen" dir="rtl"><div className="pending-card"><span><LockKeyhole size={26}/></span><small>החשבון נוצר בהצלחה</small><h1>הגישה ממתינה לאישור</h1><p>החשבון של <strong>{profile.email}</strong> מחובר. מנהל המערכת צריך לשייך אותו ללקוח ולהגדיר הרשאה לפני הצגת מידע.</p><button onClick={onLogout}><LogOut size={17}/> יציאה</button></div></div>}

function PreviewModal({customers,currentAccount,onClose,onEnter}:{customers:Customer[];currentAccount:string;onClose:()=>void;onEnter:(preview:PreviewContext)=>void}){
  const [previewRole,setPreviewRole]=useState<Role>("customer");
  const [accountId,setAccountId]=useState(currentAccount||"c1");
  const needsAccount=previewRole==="customer"||previewRole==="multi";
  const options:[Role,string,string,typeof Building2][]=[
    ["customer","לקוח רגיל","פורטל של לקוח וסניף אחד",Building2],
    ["multi","לקוח מרובה סניפים","פורטל לקוח עם מספר אתרים",MonitorCog],
    ["service","צוות שירות","מסכי התפעול והקריאות",Headphones],
    ["admin","מנהל מערכת","כל מסכי הניהול והדוחות",UserCog],
  ];
  return <Modal title="תצוגת מערכת והרשאות" onClose={onClose}><div className="preview-modal"><div className="preview-note"><Eye size={18}/><div><strong>צפייה בטוחה</strong><span>המערכת תוצג בדיוק לפי התפקיד שתבחר, ללא אפשרות לשנות נתונים.</span></div></div><div className="preview-role-grid">{options.map(([id,title,description,Icon])=><button key={id} className={previewRole===id?"active":""} onClick={()=>setPreviewRole(id)}><Icon size={19}/><strong>{title}</strong><small>{description}</small></button>)}</div>{needsAccount&&<label className="preview-account"><span>איזה לקוח להציג?</span><select value={accountId} onChange={event=>setAccountId(event.target.value)}>{customers.map(customer=><option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>}<footer><button onClick={onClose}>ביטול</button><button className="primary" onClick={()=>onEnter({role:previewRole,accountId})}><Eye size={16}/> כניסה למצב תצוגה</button></footer></div></Modal>
}

function AccessManagement({customers,users,readOnly,onSave,onPreview}:{customers:Customer[];users:UserProfile[];readOnly:boolean;onSave:(user:UserProfile,role:Role,accountIds:string[],status:UserProfile["status"])=>Promise<void>;onPreview:(preview:PreviewContext)=>void}){
  return <><SectionTitle title="ניהול והרשאות"/><div className="access-summary"><div><UserCog size={20}/><span><strong>{users.length}</strong> משתמשים רשומים</span></div><div><LockKeyhole size={20}/><span><strong>{users.filter(user=>user.status==="pending").length}</strong> ממתינים לאישור</span></div><div><ShieldCheck size={20}/><span><strong>{users.filter(user=>user.role==="admin").length}</strong> מנהלי מערכת</span></div></div><section className="panel access-panel"><div className="access-head"><h3>משתמשי המערכת</h3>{readOnly&&<Badge>קריאה בלבד</Badge>}</div><div className="access-list">{users.length?users.map(user=><UserAccessRow customers={customers} key={user.uid} user={user} readOnly={readOnly} onSave={onSave} onPreview={onPreview}/>):<div className="empty-access"><UserCog size={28}/><strong>אין משתמשים רשומים</strong></div>}</div></section></>
}

function UserAccessRow({customers,user,readOnly,onSave,onPreview}:{customers:Customer[];user:UserProfile;readOnly:boolean;onSave:(user:UserProfile,role:Role,accountIds:string[],status:UserProfile["status"])=>Promise<void>;onPreview:(preview:PreviewContext)=>void}){
  const [editing,setEditing]=useState(false);
  const [role,setRole]=useState<Role>(user.role);
  const [accountIds,setAccountIds]=useState<string[]>(user.accountIds);
  const [status,setStatus]=useState<UserProfile["status"]>(user.status);
  const [saving,setSaving]=useState(false);
  const toggleAccount=(accountId:string)=>setAccountIds(current=>current.includes(accountId)?current.filter(id=>id!==accountId):[...current,accountId]);
  const save=async()=>{setSaving(true);try{await onSave(user,role,accountIds,status);setEditing(false);}finally{setSaving(false);}};
  return <article className="access-user"><div className="access-user-main"><span className="customer-avatar">{(user.displayName||user.email).slice(0,2)}</span><div><strong>{user.displayName||"משתמש"}</strong><small>{user.email}</small></div><Badge>{user.status==="active"?"פעיל":"ממתין לאישור"}</Badge><span className="role-label">{roleNames[user.role]}</span><div className="access-actions"><button onClick={()=>onPreview({role:user.role,accountId:user.accountIds[0]||"c1"})}><Eye size={15}/> תצוגה</button><button disabled={readOnly} onClick={()=>setEditing(value=>!value)}><UserCog size={15}/> הרשאות</button></div></div>{editing&&<div className="access-editor"><label><span>תפקיד</span><select value={role} onChange={event=>setRole(event.target.value as Role)}><option value="customer">לקוח רגיל</option><option value="multi">לקוח מרובה סניפים</option><option value="service">נציג שירות</option><option value="admin">מנהל מערכת</option></select></label><label><span>מצב החשבון</span><select value={status} onChange={event=>setStatus(event.target.value as UserProfile["status"])}><option value="pending">ממתין לאישור</option><option value="active">פעיל</option></select></label>{(role==="customer"||role==="multi")&&<fieldset><legend>חשבונות לקוח</legend><div>{customers.map(customer=><label key={customer.id}><input type="checkbox" checked={accountIds.includes(customer.id)} onChange={()=>toggleAccount(customer.id)}/><span>{customer.name}</span></label>)}</div></fieldset>}<footer><button onClick={()=>setEditing(false)}>ביטול</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"שומר…":"שמירת הרשאות"}</button></footer></div>}</article>
}

function firebaseMessage(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes("auth/invalid-credential"))return "פרטי הכניסה אינם נכונים.";
  if(message.includes("auth/popup-closed-by-user"))return "חלון הכניסה נסגר לפני השלמת התהליך.";
  if(message.includes("auth/operation-not-allowed"))return "שיטת הכניסה עדיין לא הופעלה ב־Firebase.";
  if(message.includes("permission-denied")||message.includes("Missing or insufficient permissions"))return "כללי הגישה למסד הנתונים עדיין לא פורסמו.";
  return message.replace("Firebase: ","");
}

function SectionTitle({title,sub,action}:{title:string;sub?:string;action?:React.ReactNode}) {return <div className="section-title"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action}</div>}
function Kpi({label,value,meta,tone="default",onClick}:{label:string;value:string|number;meta:string;tone?:string;onClick?:()=>void}) {return <button className={`kpi ${tone}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{meta}</small></button>}

function AdminDashboard({store,sales,customers,go,openCustomer,greeting,firstName}:{store:Store;sales:SalesWorkspace;customers:Customer[];go:(v:View)=>void;openCustomer:(id:string)=>void;greeting:string;firstName:string}) {
  const customerName=useCustomerName();
  const open=store.tickets.filter(t=>!closed(t.status)), urgent=open.filter(t=>t.urgency==="דחופה");
  const pending=store.orders.filter(o=>o.status==="ממתין לאישור");
  const risks=customers.filter(c=>riskReasons(c,store).length>0);
  return <><section className="ops-hero"><CoffeeBotanical className="hero-coffee-branch"/><div className="ops-copy"><span className="hero-kicker"><Activity size={15}/> תמונת מצב</span><h2>{greeting}, {firstName}</h2><div className="hero-actions"><button className="hero-primary" onClick={()=>go("tickets")}><Headphones size={17}/> קריאות שירות</button><button onClick={()=>go("tasks")}><CalendarDays size={17}/> משימות</button></div></div><div className="service-score"><div className="score-ring"><div><strong>91</strong><span>ציון שירות</span></div></div><div className="score-copy"><span>↑ 4.2% מהחודש שעבר</span><small>עמידה ביעדי SLA</small></div></div></section>
    <SectionTitle title="סקירה"/>
    <div className="kpi-grid">
      <Kpi label="לידים פעילים" value={sales.leads.filter(lead=>!["נסגר","לא רלוונטי"].includes(lead.status)).length} meta="בתהליך מכירה" tone="purple" onClick={()=>go("leads")}/>
      <Kpi label="הצעות פתוחות" value={sales.quotes.filter(quote=>!["אושרה","נדחתה"].includes(quote.status)).length} meta="טיוטות והצעות שנשלחו" tone="orange" onClick={()=>go("quotes")}/>
      <Kpi label="לקוחות פעילים" value={customers.filter(c=>c.status==="פעיל").length} meta={`מתוך ${customers.length} לקוחות`}/>
      <Kpi label="קריאות פתוחות" value={open.length} meta={`${open.filter(t=>t.status==="ממתין לטכנאי").length} ממתינות לטכנאי`} tone="blue" onClick={()=>go("tickets")}/>
      <Kpi label="קריאות דחופות" value={urgent.length} meta="דורשות טיפול עכשיו" tone="red" onClick={()=>go("tickets")}/>
      <Kpi label="הזמנות לאישור" value={pending.length} meta="לחודש אוגוסט" tone="orange" onClick={()=>go("orders")}/>
      <Kpi label="מכונות לטיפול" value={store.machines.filter(m=>m.status!=="פעילה").length} meta="כולל טיפול באיחור" tone="purple" onClick={()=>go("machines")}/>
      <Kpi label="לקוחות בסיכון" value={risks.length} meta="נדרש מעקב יזום" tone="red" onClick={()=>go("customers")}/>
    </div>
    <div className="dashboard-grid">
      <section className="panel wide"><div className="panel-head"><div><h3>לטיפול היום</h3><p>משימות וקריאות לפי סדר עדיפות</p></div><button className="text-btn" onClick={()=>go("tasks")}>לכל המשימות ←</button></div>
        <div className="work-list">{[...store.tasks.filter(t=>t.status!=="בוצעה").slice(0,3)].map(t=><div className="work-row" key={t.id}><span className={`priority-dot ${t.priority==="גבוהה"?"high":""}`}></span><div><strong>{t.title}</strong><small>{customerName(t.accountId)} · {t.assignedTo}</small></div><Badge>{t.status}</Badge><time>{formatDate(t.dueDate)}</time></div>)}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>קריאות דחופות</h3><p>לפי חריגה מ־SLA</p></div><button className="text-btn" onClick={()=>go("tickets")}>הצג הכל</button></div>
        {urgent.map(t=><button className="alert-card" key={t.id} onClick={()=>go("tickets")}><div><strong>{t.type}</strong><span>{customerName(t.accountId)} · {t.site}</span></div><div><Badge>{t.status}</Badge><small>{t.id}</small></div></button>)}
      </section>
      <section className="panel"><div className="panel-head"><div><h3>לקוחות בסיכון</h3><p>הסיבות הבולטות</p></div></div>
        {risks.slice(0,4).map(c=><button className="risk-row" key={c.id} onClick={()=>openCustomer(c.id)}><span className="customer-avatar">{c.name.slice(0,2)}</span><div><strong>{c.name}</strong><small>{riskReasons(c,store)[0]}</small></div><span>←</span></button>)}
      </section>
    </div></>;
}

function CustomerDashboard({customer,store,go,openTicket,greeting}:{customer:Customer;store:Store;go:(v:View)=>void;openTicket:(m?:string)=>void;greeting:string}) {
  const ms=store.machines.filter(m=>m.accountId===customer.id), ts=store.tickets.filter(t=>t.accountId===customer.id&&!closed(t.status));
  const order=store.orders.find(o=>o.accountId===customer.id)!;
  const next=[...ms].sort((a,b)=>a.nextService.localeCompare(b.nextService))[0];
  return <><div className="customer-hello"><CoffeeBotanical className="customer-coffee-branch"/><div><span className="eyebrow">{greeting}, {customer.contactName.split(" ")[0]}</span><h2>{customer.name}</h2></div><Badge>{ts.some(t=>t.urgency==="דחופה")?"יש קריאה דחופה פתוחה":"הכל תקין"}</Badge></div>
    {order.status==="ממתין לעדכון לקוח"&&<div className="banner"><div><strong>הזמנת הקפה לחודש הבא ממתינה לעדכון</strong><span>אפשר לעדכן את הכמות והתערובת עד 5 באוגוסט.</span></div><button onClick={()=>go("orders")}>לעדכון ההזמנה</button></div>}
    <div className="kpi-grid customer-kpis"><Kpi label="מכונות פעילות" value={ms.filter(m=>m.status==="פעילה").length} meta={`מתוך ${ms.length} מכונות`}/><Kpi label="קריאות פתוחות" value={ts.length} meta={ts.length?"אנחנו מטפלים בזה":"אין קריאות פעילות"} tone={ts.length?"blue":"default"}/><Kpi label="הזמנה לחודש הבא" value={`${order.requestedKg} ק״ג`} meta={order.blend}/><Kpi label="הטיפול הבא" value={next?formatDate(next.nextService):"—"} meta={next?.model||"אין טיפול מתוכנן"}/></div>
    <SectionTitle title="פעולות מהירות"/><div className="quick-actions"><button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאת שירות</button><button onClick={()=>go("orders")}>♨ עדכון הזמנת קפה</button><button onClick={()=>go("machines")}>▣ המכונות שלי</button><a href="https://wa.me/97235555555?text=שלום%2C%20אני%20צריך%20עזרה%20בנושא%20שירות%20לקוחות%20%2F%20קפה%20%2F%20מכונה." target="_blank">◌ WhatsApp לשירות</a></div>
    {ts.length>0&&<section className="panel"><div className="panel-head"><div><h3>קריאות פתוחות</h3><p>עדכונים אחרונים מצוות השירות</p></div><button className="text-btn" onClick={()=>go("tickets")}>לכל הקריאות ←</button></div>{ts.slice(0,2).map(t=><div className="ticket-strip" key={t.id}><span className="ticket-icon">◉</span><div><strong>{t.type}</strong><small>{t.id} · נפתחה ב־{formatDate(t.openedAt)}</small></div><Badge>{t.urgency}</Badge><Badge>{t.status}</Badge></div>)}</section>}
  </>;
}

function Customers({customers,store,openCustomer,openTicket,openTask}:{customers:Customer[];store:Store;openCustomer:(id:string)=>void;openTicket:(id:string)=>void;openTask:(id:string)=>void}) {
  const [q,setQ]=useState(""); const [filter,setFilter]=useState("הכל");
  const rows=customers.filter(c=>(c.name+c.contactName+c.city).toLowerCase().includes(q.toLowerCase())&&(filter==="הכל"||c.status===filter));
  return <><SectionTitle title="לקוחות" sub={`${customers.length} חשבונות לקוח במערכת`}/>
    <div className="filters"><label className="search">⌕<input placeholder="חיפוש לפי לקוח, איש קשר או עיר" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option>הכל</option><option>פעיל</option><option>בסיכון</option><option>בהקמה</option><option>בהשהיה</option></select><span className="result-count">{rows.length} תוצאות</span></div>
    <div className="table-wrap"><table><thead><tr><th>לקוח</th><th>סטטוס</th><th>עיר</th><th>איש קשר</th><th>סניפים</th><th>מכונות</th><th>ק״ג חודשי</th><th>קריאות</th><th>הזמנה</th><th></th></tr></thead><tbody>{rows.map(c=>{const open=store.tickets.filter(t=>t.accountId===c.id&&!closed(t.status)).length, order=store.orders.find(o=>o.accountId===c.id), risks=riskReasons(c,store);return <tr key={c.id}><td><button className="name-cell" onClick={()=>openCustomer(c.id)}><span className="customer-avatar">{c.name.slice(0,2)}</span><strong>{c.name}</strong></button></td><td><Badge>{risks.length?"בסיכון":c.status}</Badge>{risks.length>0&&<small>{risks[0]}</small>}</td><td>{c.city}</td><td><strong>{c.contactName}</strong><small>{c.phone}</small></td><td>{c.branches.length}</td><td>{store.machines.filter(m=>m.accountId===c.id).length}</td><td>{c.monthlyKg}</td><td>{open?<span className="count-alert">{open}</span>:"—"}</td><td>{order&&<Badge>{order.status}</Badge>}</td><td><div className="row-actions"><button className="row-action" onClick={()=>openCustomer(c.id)}>כרטיס</button><button className="row-action" onClick={()=>openTicket(c.id)}>קריאה</button><button className="row-action" onClick={()=>openTask(c.id)}>משימה</button></div></td></tr>})}</tbody></table></div>
    <div className="mobile-cards">{rows.map(c=><button className="mobile-card" key={c.id} onClick={()=>openCustomer(c.id)}><div><span className="customer-avatar">{c.name.slice(0,2)}</span><strong>{c.name}</strong><Badge>{c.status}</Badge></div><p>{c.contactName} · {c.city}</p><small>{store.machines.filter(m=>m.accountId===c.id).length} מכונות · {c.monthlyKg} ק״ג בחודש</small></button>)}</div>
  </>;
}

function CustomerCard({customer,store,openTicket,openTask}:{customer:Customer;store:Store;openTicket:(m?:string)=>void;openTask:()=>void}) {
  const [tab,setTab]=useState("סקירה"); const ms=store.machines.filter(m=>m.accountId===customer.id), ts=store.tickets.filter(t=>t.accountId===customer.id), os=store.orders.filter(o=>o.accountId===customer.id);
  return <><div className="customer-header"><div className="customer-avatar xl">{customer.name.slice(0,2)}</div><div><div className="header-line"><h2>{customer.name}</h2><Badge>{customer.status}</Badge><Badge>{customer.rank}</Badge></div><p>{customer.city} · מנהל לקוח: {customer.owner}</p></div><div className="title-actions"><button onClick={openTask}>＋ יצירת משימה</button><button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאה</button></div></div>
    <div className="tabs">{["סקירה","סניפים ואנשי קשר","מכונות","קריאות שירות","הזמנות קפה","חוזה","משימות","הערות פנימיות"].map(t=><button className={tab===t?"active":""} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==="סקירה"&&<><div className="kpi-grid"><Kpi label="ק״ג חודשי מוסכם" value={customer.monthlyKg} meta="לפי ההסכם"/><Kpi label="מכונות פעילות" value={ms.filter(m=>m.status==="פעילה").length} meta={`מתוך ${ms.length}`}/><Kpi label="קריאות פתוחות" value={ts.filter(t=>!closed(t.status)).length} meta="דורשות מעקב" tone="blue"/><Kpi label="סיום הסכם" value={formatDate(customer.contractEnd)} meta="מעקב חידוש"/></div><div className="dashboard-grid"><section className="panel"><h3>פרטי קשר</h3><dl><div><dt>איש קשר</dt><dd>{customer.contactName}</dd></div><div><dt>טלפון</dt><dd>{customer.phone}</dd></div><div><dt>דוא״ל</dt><dd>{customer.email}</dd></div><div><dt>כתובת</dt><dd>{customer.address}, {customer.city}</dd></div></dl></section><section className="panel"><h3>תמונת שירות</h3><dl><div><dt>רמת שירות</dt><dd>{customer.serviceLevel}</dd></div><div><dt>סניפים</dt><dd>{customer.branches.length}</dd></div><div><dt>הזמנה קרובה</dt><dd>{os[0]?.requestedKg} ק״ג</dd></div><div><dt>אחראי פנימי</dt><dd>{customer.owner}</dd></div></dl></section></div></>}
    {tab==="סניפים ואנשי קשר"&&<div className="card-grid">{customer.branches.map((b,i)=><div className="info-card" key={b}><span>סניף {i+1}</span><h3>{b}</h3><p>{customer.address}, {customer.city}</p><small>{customer.contactName} · {customer.phone}</small></div>)}</div>}
    {tab==="מכונות"&&<Machines machines={ms} isStaff openTicket={openTicket} onStatus={()=>{}}/>}
    {tab==="קריאות שירות"&&<Tickets tickets={ts} machines={store.machines} isStaff onUpdate={()=>{}} onOpen={()=>{}} onClose={()=>{}} openTicket={openTicket}/>}
    {tab==="הזמנות קפה"&&<Orders orders={os} isStaff onChange={()=>{}}/>}
    {tab==="חוזה"&&<Contract customer={customer} machines={ms}/>}
    {tab==="משימות"&&<Tasks tasks={store.tasks.filter(t=>t.accountId===customer.id)} onCreate={openTask} onStatus={()=>{}}/>}
    {tab==="הערות פנימיות"&&<section className="panel notes"><h3>הערות פנימיות</h3><textarea defaultValue="הלקוח מעדיף תיאום ביקורים בשעות הבוקר. יש לעדכן את נועה לפני כל שינוי בכמות החודשית."/><button className="primary">שמירת הערה</button></section>}
  </>;
}

function Tickets({tickets,machines,isStaff,onUpdate,onOpen,onClose,openTicket}:{tickets:Ticket[];machines:Machine[];isStaff:boolean;onUpdate:(id:string,s:string)=>void;onOpen:(id:string)=>void;onClose:(id:string)=>void;openTicket:(m?:string)=>void}) {
  const customerName=useCustomerName();
  const [status,setStatus]=useState("הכל"),[urgency,setUrgency]=useState("הכל"),[q,setQ]=useState("");
  const rows=tickets.filter(t=>(status==="הכל"||t.status===status)&&(urgency==="הכל"||t.urgency===urgency)&&(t.id+customerName(t.accountId)+t.type).toLowerCase().includes(q.toLowerCase()));
  return <><SectionTitle title="קריאות שירות" sub={`${tickets.filter(t=>!closed(t.status)).length} קריאות פתוחות`} action={<button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאה</button>}/>
    <div className="filters"><label className="search">⌕<input placeholder="חיפוש קריאה, לקוח או תקלה" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>הכל</option>{["התקבלה","בטיפול","ממתין ללקוח","ממתין לטכנאי","תואם ביקור","נסגרה"].map(x=><option key={x}>{x}</option>)}</select><select value={urgency} onChange={e=>setUrgency(e.target.value)}><option>הכל</option><option>דחופה</option><option>גבוהה</option><option>רגילה</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>קריאה</th>{isStaff&&<th>לקוח</th>}<th>מכונה / סניף</th><th>תקלה</th><th>דחיפות</th><th>סטטוס</th><th>נפתחה</th>{isStaff&&<th>אחראי</th>}<th></th></tr></thead><tbody>{rows.map(t=>{const m=machines.find(m=>m.id===t.machineId);return <tr key={t.id}><td><strong>{t.id}</strong><small>עודכן {formatDate(t.updatedAt)}</small></td>{isStaff&&<td><strong>{customerName(t.accountId)}</strong></td>}<td><strong>{m?.model||"בעיה כללית"}</strong><small>{t.site}</small></td><td>{t.type}</td><td><div className="badge-stack"><Badge>{t.urgency}</Badge>{slaBreached(t)&&<Badge>חריגת SLA</Badge>}</div></td><td>{isStaff&&!closed(t.status)?<select className="status-select" value={t.status} onChange={e=>onUpdate(t.id,e.target.value)}>{["התקבלה","בטיפול","ממתין ללקוח","ממתין לטכנאי","תואם ביקור","בוצע טיפול"].map(s=><option key={s}>{s}</option>)}</select>:<Badge>{t.status}</Badge>}</td><td>{formatDate(t.openedAt)}</td>{isStaff&&<td>{t.assignedTo}</td>}<td><div className="row-actions"><button className="row-action" onClick={()=>onOpen(t.id)}>פרטים</button>{isStaff&&!closed(t.status)&&<button className="row-action danger" onClick={()=>onClose(t.id)}>סגירה</button>}</div></td></tr>})}</tbody></table></div>
    <div className="mobile-cards">{rows.map(t=><button className="mobile-card" key={t.id} onClick={()=>onOpen(t.id)}><div><strong>{t.id} · {t.type}</strong><Badge>{t.urgency}</Badge></div><p>{isStaff&&`${customerName(t.accountId)} · `}{t.site}</p><div><Badge>{t.status}</Badge><small>{formatDate(t.openedAt)}</small></div></button>)}</div>
  </>;
}

function Machines({machines,isStaff,openTicket,onStatus}:{machines:Machine[];isStaff:boolean;openTicket:(id?:string)=>void;onStatus:(id:string,s:string)=>void}) {
  const customerName=useCustomerName();
  const [q,setQ]=useState(""),[status,setStatus]=useState("הכל"); const rows=machines.filter(m=>(status==="הכל"||m.status===status)&&(m.serial+m.model+customerName(m.accountId)).toLowerCase().includes(q.toLowerCase()));
  return <><SectionTitle title={isStaff?"מכונות":"המכונות שלי"} sub={`${machines.length} פריטי ציוד`}/><div className="filters"><label className="search">⌕<input placeholder="חיפוש לפי לקוח, דגם או מספר סידורי" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>הכל</option><option>פעילה</option><option>דורשת טיפול</option><option>מושבתת</option></select></div>
    <div className="table-wrap"><table><thead><tr>{isStaff&&<th>לקוח</th>}<th>דגם</th><th>מספר סידורי</th><th>סניף / מיקום</th><th>סטטוס</th>{isStaff&&<th>מודל מסחרי</th>}<th>טיפול אחרון</th><th>טיפול הבא</th><th></th></tr></thead><tbody>{rows.map(m=><tr key={m.id}>{isStaff&&<td><strong>{customerName(m.accountId)}</strong></td>}<td><strong>{m.model}</strong></td><td>{m.serial}</td><td><strong>{m.site}</strong><small>{m.location}</small></td><td>{isStaff?<select className="status-select" value={m.status} onChange={e=>onStatus(m.id,e.target.value)}><option>פעילה</option><option>דורשת טיפול</option><option>מושבתת</option><option>בהחלפה</option><option>הוחזרה</option></select>:<Badge>{m.status}</Badge>}</td>{isStaff&&<td>{m.commercial}</td>}<td>{formatDate(m.lastService)}</td><td>{new Date(m.nextService)<new Date("2026-07-30")?<Badge>טיפול באיחור</Badge>:formatDate(m.nextService)}</td><td><button className="row-action" onClick={()=>openTicket(m.id)}>פתיחת קריאה</button></td></tr>)}</tbody></table></div>
    <div className="mobile-cards">{rows.map(m=><div className="mobile-card" key={m.id}><div><strong>{m.model}</strong><Badge>{m.status}</Badge></div><p>{m.site} · {m.location}</p><small>{m.serial}</small><button onClick={()=>openTicket(m.id)}>פתיחת קריאה</button></div>)}</div>
  </>;
}

function Orders({orders,isStaff,onChange}:{orders:Order[];isStaff:boolean;onChange:(id:string,data:Partial<Order>)=>void}) {
  const customerName=useCustomerName();
  const total=orders.reduce((s,o)=>s+(o.approvedKg||o.requestedKg),0);
  if(!isStaff){const o=orders[0];return <><SectionTitle title="הזמנת קפה" sub="ניהול הכמות והתערובת לחודש הבא"/><section className="order-hero"><div><span>ההזמנה הבאה</span><h2>{o.month}</h2><Badge>{o.status}</Badge></div><div className="kg-ring"><strong>{o.requestedKg}</strong><span>ק״ג</span></div></section><OrderEditor order={o} onSave={onChange}/><section className="panel"><h3>12 חודשים קדימה</h3><div className="month-row">{["אוג׳","ספט׳","אוק׳","נוב׳","דצמ׳","ינו׳","פבר׳","מרץ","אפר׳","מאי","יוני","יולי"].map((m,i)=><div className={i===0?"current":""} key={m}><span>{m}</span><strong>{i===0?o.requestedKg:o.defaultKg} ק״ג</strong><small>{i===0?"ניתן לעריכה":"נעול"}</small></div>)}</div></section></>}
  return <><SectionTitle title="הזמנות קפה" sub="הזמנות לחודש אוגוסט 2026" action={<button onClick={()=>{const csv="לקוח,כמות,תערובת,סטטוס\n"+orders.map(o=>`${customerName(o.accountId)},${o.requestedKg},${o.blend},${o.status}`).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv"}));a.download="coffee-orders.csv";a.click();}}>ייצוא CSV</button>}/><div className="kpi-grid"><Kpi label="סך ק״ג לחודש" value={total} meta="לפי הכמות המעודכנת"/><Kpi label="ממתינות לאישור" value={orders.filter(o=>o.status==="ממתין לאישור").length} meta="כולל הזמנות חריגות" tone="orange"/><Kpi label="לא עודכנו" value={orders.filter(o=>o.status==="ממתין לעדכון לקוח").length} meta="נדרשת תזכורת" tone="red"/></div><div className="table-wrap"><table><thead><tr><th>לקוח</th><th>ברירת מחדל</th><th>מבוקש</th><th>שינוי</th><th>מאושר</th><th>תערובת</th><th>סטטוס</th><th></th></tr></thead><tbody>{orders.map(o=>{const diff=Math.round((o.requestedKg-o.defaultKg)/o.defaultKg*100);return <tr key={o.id}><td><strong>{customerName(o.accountId)}</strong></td><td>{o.defaultKg} ק״ג</td><td>{o.requestedKg} ק״ג</td><td><Badge>{Math.abs(diff)>30?"חריג":`${diff>0?"+":""}${diff}%`}</Badge></td><td><input className="kg-input small" type="number" value={o.approvedKg||o.requestedKg} onChange={e=>onChange(o.id,{approvedKg:+e.target.value})}/></td><td>{o.blend}</td><td><Badge>{o.status}</Badge></td><td><button className="row-action" onClick={()=>onChange(o.id,{status:"אושר",approvedKg:o.approvedKg||o.requestedKg})}>אישור</button></td></tr>})}</tbody></table></div><div className="mobile-cards order-mobile-cards">{orders.map(o=>{const diff=Math.round((o.requestedKg-o.defaultKg)/o.defaultKg*100);return <article className="mobile-card order-mobile-card" key={o.id}><div className="mobile-card-head"><div><strong>{customerName(o.accountId)}</strong><small>{o.blend}</small></div><Badge>{o.status}</Badge></div><div className="mobile-order-metrics"><span><small>ברירת מחדל</small><strong>{o.defaultKg} ק״ג</strong></span><span><small>מבוקש</small><strong>{o.requestedKg} ק״ג</strong></span><span><small>שינוי</small><Badge>{Math.abs(diff)>30?"חריג":`${diff>0?"+":""}${diff}%`}</Badge></span></div><label className="mobile-order-approval"><span>כמות מאושרת</span><div className="input-suffix"><input type="number" value={o.approvedKg||o.requestedKg} onChange={e=>onChange(o.id,{approvedKg:+e.target.value})}/><b>ק״ג</b></div></label><button className="primary" onClick={()=>onChange(o.id,{status:"אושר",approvedKg:o.approvedKg||o.requestedKg})}>אישור הזמנה</button></article>})}</div></>;
}

function OrderEditor({order,onSave}:{order:Order;onSave:(id:string,d:Partial<Order>)=>void}) {
  const [kg,setKg]=useState(order.requestedKg),[blend,setBlend]=useState(order.blend),[note,setNote]=useState(order.note);
  const unusual=Math.abs(kg-order.defaultKg)/order.defaultKg>.3;
  return <section className="panel form-panel"><div className="form-grid"><label><span>כמות ברירת מחדל</span><div className="readonly">{order.defaultKg} ק״ג</div></label><label><span>כמות מבוקשת</span><div className="input-suffix"><input type="number" value={kg} onChange={e=>setKg(+e.target.value)}/><b>ק״ג</b></div></label><label><span>תערובת</span><select value={blend} onChange={e=>setBlend(e.target.value)}>{["Mister Bean Classic","Mister Bean Premium","Espresso Club 45","Blend Office","Decaf"].map(b=><option key={b}>{b}</option>)}</select></label><label className="full"><span>הערה להזמנה</span><textarea placeholder="הערה לחלוקה, אספקה או תערובת" value={note} onChange={e=>setNote(e.target.value)}/></label></div>{unusual&&<div className="warning">⚠ השינוי יועבר לאישור הצוות — קיימת חריגה של יותר מ־30% מהכמות הרגילה.</div>}<div className="form-actions"><button className="primary" onClick={()=>onSave(order.id,{requestedKg:kg,blend,note,status:"ממתין לאישור"})}>שמירת ההזמנה</button></div></section>
}

function Tasks({tasks,onCreate,onStatus}:{tasks:Task[];onCreate:()=>void;onStatus:(id:string,s:string)=>void}) {
  const customerName=useCustomerName();
  return <><SectionTitle title="משימות" action={<button className="primary" onClick={onCreate}>＋ משימה חדשה</button>}/><div className="kanban">{["פתוחה","בטיפול","בוצעה"].map(col=><section key={col}><header><h3>{col}</h3><span>{tasks.filter(t=>t.status===col).length}</span></header>{tasks.filter(t=>t.status===col).map(t=><div className="task-card" key={t.id}><div><Badge>{t.priority}</Badge><span>{t.type}</span></div><h4>{t.title}</h4><p>{customerName(t.accountId)}</p><footer><span>{t.assignedTo}</span><time>{formatDate(t.dueDate)}</time></footer><select value={t.status} onChange={e=>onStatus(t.id,e.target.value)}><option>פתוחה</option><option>בטיפול</option><option>בוצעה</option><option>בוטלה</option></select></div>)}</section>)}</div></>
}

function Reports({store}:{store:Store}) {
  const statuses=["פעילה","דורשת טיפול","מושבתת"], max=Math.max(...statuses.map(s=>store.machines.filter(m=>m.status===s).length));
  return <><SectionTitle title="דוחות"/><div className="report-grid"><section className="panel"><h3>קריאות לפי סטטוס</h3><div className="donut" style={{"--p":"62%"} as React.CSSProperties}><div><strong>{store.tickets.filter(t=>!closed(t.status)).length}</strong><span>פתוחות</span></div></div><div className="legend"><span><i className="blue-dot"/>פתוחות</span><span><i className="gray-dot"/>סגורות</span></div></section><section className="panel"><h3>מכונות לפי סטטוס</h3><div className="bars">{statuses.map(s=>{const n=store.machines.filter(m=>m.status===s).length;return <div key={s}><span>{s}</span><div><i style={{width:`${n/max*100}%`}}/></div><b>{n}</b></div>})}</div></section><section className="panel"><h3>מדדי שירות</h3><div className="metric-list"><div><span>זמן תגובה ממוצע</span><strong>1:42</strong><small>שעות</small></div><div><span>עמידה ב־SLA</span><strong>91%</strong><small>החודש</small></div><div><span>סגירה בביקור ראשון</span><strong>84%</strong><small>מכלל הקריאות</small></div></div></section><section className="panel"><h3>הזמנות קפה — 6 חודשים</h3><div className="line-bars">{[612,640,628,675,701,753].map((n,i)=><div key={n}><i style={{height:`${n/8}px`}}/><span>{["מרץ","אפר׳","מאי","יוני","יולי","אוג׳"][i]}</span></div>)}</div></section></div></>
}

function Contract({customer,machines}:{customer:Customer;machines:Machine[]}) {return <><SectionTitle title="ההסכם שלי"/><section className="panel contract"><div className="contract-head"><span className="contract-icon">▤</span><div><span>הסכם שירות פעיל</span><h2>{customer.name}</h2><Badge>{customer.serviceLevel}</Badge></div></div><dl><div><dt>תקופת השירות</dt><dd>01.04.2025 — {formatDate(customer.contractEnd)}</dd></div><div><dt>כמות חודשית מוסכמת</dt><dd>{customer.monthlyKg} ק״ג</dd></div><div><dt>תערובת קבועה</dt><dd>Mister Bean Premium</dd></div><div><dt>מכונות משויכות</dt><dd>{machines.length} פריטי ציוד</dd></div><div><dt>רמת שירות</dt><dd>{customer.serviceLevel}</dd></div><div><dt>אשת קשר לשירות</dt><dd>רוני · 03-555-5555</dd></div></dl><div className="terms"><h3>עיקרי השירות</h3><p>שירות ותיקונים למכונות המשויכות, טיפולים תקופתיים ואספקת קפה חודשית בהתאם להזמנה המעודכנת.</p></div></section></>}
function Contact(){return <><SectionTitle title="יצירת קשר"/><div className="contact-grid"><a className="contact-card whatsapp" href="https://wa.me/97235555555?text=שלום%2C%20אני%20צריך%20עזרה%20בנושא%20שירות%20לקוחות%20%2F%20קפה%20%2F%20מכונה." target="_blank"><span>◌</span><h3>WhatsApp לשירות</h3><p>בשעות הפעילות</p><b>פתיחת שיחה ←</b></a><a className="contact-card" href="tel:035555555"><span>☎</span><h3>טלפון שירות</h3><p>א׳–ה׳, 08:00–17:00</p><b>03-555-5555</b></a><a className="contact-card" href="mailto:service@misterbean.co.il"><span>＠</span><h3>דוא״ל</h3><b>service@misterbean.co.il</b></a></div><section className="panel hours"><h3>שעות פעילות</h3><div><span>ימים א׳–ה׳</span><strong>08:00–17:00</strong></div><div><span>יום ו׳ וערבי חג</span><strong>08:00–12:00</strong></div><p>לתקלה דחופה מחוץ לשעות הפעילות יש לפתוח קריאה במערכת.</p></section></>}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><header><h2>{title}</h2><button onClick={onClose}>×</button></header>{children}</div></div>}
function TicketModal({customers,accountId,allowAccountChange,preselectedMachine,machines,onClose,onSave}:{customers:Customer[];accountId:string;allowAccountChange:boolean;preselectedMachine:string;machines:Machine[];onClose:()=>void;onSave:(t:Ticket)=>void}) {
  const [activeAccount,setActiveAccount]=useState(accountId);
  const customer=customers.find(c=>c.id===activeAccount)||customers[0]; const available=machines.filter(m=>m.accountId===customer.id);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget), machineId=String(f.get("machine")), eventId=Math.round(e.timeStamp);onSave({id:`SR-${eventId}`,accountId:customer.id,site:String(f.get("site")),machineId,type:String(f.get("type")),urgency:String(f.get("urgency")),status:"התקבלה",description:String(f.get("description")),contact:String(f.get("contact")),phone:String(f.get("phone")),assignedTo:"טרם הוקצה",openedAt:new Date().toISOString(),updatedAt:new Date().toISOString()})};
  return <Modal title="פתיחת קריאת שירות" onClose={onClose}><form onSubmit={submit} className="modal-form">{allowAccountChange?<label className="account-picker"><span>לקוח</span><select value={activeAccount} onChange={e=>setActiveAccount(e.target.value)}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:<div className="customer-context"><span className="customer-avatar">{customer.name.slice(0,2)}</span><div><small>עבור</small><strong>{customer.name}</strong></div></div>}<div className="form-grid"><label><span>סניף</span><select name="site" required key={`site-${activeAccount}`}>{customer.branches.map(b=><option key={b}>{b}</option>)}</select></label><label><span>מכונה</span><select name="machine" defaultValue={preselectedMachine} key={`machine-${activeAccount}`}><option value="">בעיה כללית</option>{available.map(m=><option key={m.id} value={m.id}>{m.model} · {m.serial}</option>)}</select></label><label><span>סוג תקלה</span><select name="type">{["נזילה","המכונה לא נדלקת","קפה יוצא חלש","אין חימום","בעיית טחינה","בעיית חלב / מקציף","דרוש ניקוי","תקלה חוזרת","בקשת הדרכה"].map(x=><option key={x}>{x}</option>)}</select></label><label><span>דחיפות</span><select name="urgency"><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></label><label className="full"><span>תיאור הבעיה</span><textarea name="description" required placeholder="מה קרה ומתי התחילה הבעיה?"/></label><label><span>איש קשר</span><input name="contact" key={`contact-${activeAccount}`} defaultValue={customer.contactName}/></label><label><span>טלפון לחזרה</span><input name="phone" key={`phone-${activeAccount}`} defaultValue={customer.phone}/></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">פתיחת הקריאה</button></footer></form></Modal>
}
function TaskModal({customers,accountId,onClose,onSave}:{customers:Customer[];accountId:string;onClose:()=>void;onSave:(t:Task)=>void}) {const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({id:`t-${Math.round(e.timeStamp)}`,accountId:String(f.get("account")),title:String(f.get("title")),type:String(f.get("type")),dueDate:String(f.get("date")),priority:String(f.get("priority")),status:"פתוחה",assignedTo:String(f.get("assignee"))})};return <Modal title="יצירת משימה" onClose={onClose}><form onSubmit={submit} className="modal-form"><div className="form-grid"><label className="full"><span>כותרת המשימה</span><input name="title" required placeholder="מה צריך לבצע?"/></label><label><span>לקוח</span><select name="account" defaultValue={accountId}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>סוג</span><select name="type"><option>שירות</option><option>הזמנה</option><option>מכונה</option><option>חוזה</option><option>שימור</option><option>כללי</option></select></label><label><span>תאריך יעד</span><input type="date" name="date" defaultValue="2026-08-02" required/></label><label><span>עדיפות</span><select name="priority"><option>נמוכה</option><option>בינונית</option><option>גבוהה</option></select></label><label className="full"><span>אחראי</span><select name="assignee"><option>רוני שירות</option><option>אבי טכנאי</option><option>מיכל כהן</option><option>דנה שגב</option></select></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">יצירת משימה</button></footer></form></Modal>}
function CloseModal({onClose,onSave}:{onClose:()=>void;onSave:(s:string)=>void}) {const [reason,setReason]=useState("");return <Modal title="סגירת קריאה" onClose={onClose}><div className="modal-form"><p>כדי לסגור את הקריאה חובה לתעד את סיבת הסגירה.</p><label><span>סיבת סגירה</span><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">בחירת סיבה</option><option>התקלה טופלה</option><option>הוחלף חלק</option><option>בוצעה הדרכה</option><option>לא נמצאה תקלה</option><option>בוטל על ידי הלקוח</option></select></label><footer><button onClick={onClose}>ביטול</button><button className="danger-btn" disabled={!reason} onClick={()=>onSave(reason)}>סגירת הקריאה</button></footer></div></Modal>}

function TicketDetailModal({ticket,machine,onClose}:{ticket:Ticket;machine?:Machine;onClose:()=>void}) {
  const customerName=useCustomerName();
  if(!ticket) return null;
  const steps=[
    {title:"הקריאה נפתחה",date:ticket.openedAt,done:true},
    {title:"הקריאה עודכנה",date:ticket.updatedAt,done:true},
    {title:ticket.assignedTo==="טרם הוקצה"?"טרם הוקצתה":"הוקצתה ל־"+ticket.assignedTo,date:ticket.updatedAt,done:ticket.assignedTo!=="טרם הוקצה"},
    {title:"הקריאה נסגרה",date:ticket.closedAt,done:closed(ticket.status)}
  ];
  return <Modal title={`קריאה ${ticket.id}`} onClose={onClose}><div className="ticket-detail"><div className="detail-summary"><div><small>לקוח</small><strong>{customerName(ticket.accountId)}</strong></div><div><small>מכונה</small><strong>{machine?.model||"בעיה כללית"}</strong></div><div><small>דחיפות</small><Badge>{ticket.urgency}</Badge></div><div><small>סטטוס</small><Badge>{ticket.status}</Badge></div></div><section><h3>{ticket.type}</h3><p>{ticket.description}</p></section><div className="timeline">{steps.map((step,i)=><div className={step.done?"done":""} key={step.title}><i>{step.done?"✓":i+1}</i><div><strong>{step.title}</strong>{step.date&&<small>{formatDate(step.date)}</small>}</div></div>)}</div>{ticket.closeReason&&<div className="close-reason"><strong>סיבת סגירה</strong><span>{ticket.closeReason}</span></div>}<footer><button className="primary" onClick={onClose}>סגירה</button></footer></div></Modal>
}
