"use client";

import { createContext, FormEvent, useContext, useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
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
  KeyRound,
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
  convertQuoteToCustomer,
  deleteQuote,
  getOrCreateUserProfile,
  importSalesWorkspace,
  linkPasswordToCurrentUser,
  observeAuth,
  resetPassword,
  removeLegacyDemoCustomerData,
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

const SalesWorkspaceLoading = () => (
  <div className="workspace-loading" role="status" aria-live="polite">
    <i />
    <span>טוען את סביבת המכירות…</span>
  </div>
);
const LeadsWorkspace = dynamic(
  () => import("@/components/sales-workspace").then((module) => module.LeadsWorkspace),
  { ssr: false, loading: SalesWorkspaceLoading },
);
const QuotesWorkspace = dynamic(
  () => import("@/components/sales-workspace").then((module) => module.QuotesWorkspace),
  { ssr: false, loading: SalesWorkspaceLoading },
);

const initialStore: Store = {tickets:[],orders:[],tasks:[],machines:[]};

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

const CustomerDirectoryContext = createContext<Customer[]>([]);
const useCustomerName = () => {
  const directory = useContext(CustomerDirectoryContext);
  return (id:string) => directory.find(customer=>customer.id===id)?.name || "—";
};
const formatDate = (v:string) => v&&!Number.isNaN(new Date(v).getTime())?new Intl.DateTimeFormat("he-IL").format(new Date(v)):"טרם הוגדר";
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
  return Date.now() - new Date(ticket.openedAt).getTime() > hours * 3_600_000;
};
const riskReasons = (customer: Customer, store: Store) => {
  const open = store.tickets.filter(t=>t.accountId===customer.id&&!closed(t.status));
  const order = store.orders.find(o=>o.accountId===customer.id);
  const reasons:string[] = [];
  if(open.length>=2) reasons.push("2 קריאות פתוחות או יותר");
  if(open.some(t=>t.urgency==="דחופה")) reasons.push("קריאה דחופה פתוחה");
  const contractDays=customer.contractEnd?(new Date(customer.contractEnd).getTime()-Date.now())/86_400_000:Number.POSITIVE_INFINITY;
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
  const [customers,setCustomers] = useState<Customer[]>([]);
  const [storeReady,setStoreReady] = useState(false);
  const [authReady,setAuthReady] = useState(false);
  const [authBusy,setAuthBusy] = useState(false);
  const [authError,setAuthError] = useState("");
  const [syncError,setSyncError] = useState("");
  const [users,setUsers] = useState<UserProfile[]>([]);
  const [selectedCustomer,setSelectedCustomer] = useState("");
  const [quoteToOpen,setQuoteToOpen] = useState<Quote|null>(null);
  const [quoteCustomer,setQuoteCustomer] = useState<Customer|null>(null);
  const [modal,setModal] = useState<null|"ticket"|"task"|"close"|"detail"|"password">(null);
  const [selectedTicket,setSelectedTicket] = useState<string>("");
  const [toast,setToast] = useState("");
  const [mobileOpen,setMobileOpen] = useState(false);
  const [greeting] = useState(()=>greetingForHour(new Date().getHours()));

  useEffect(()=>{
    let active=true;
    const authTimeout=window.setTimeout(()=>{
      if(!active)return;
      setAuthError("החיבור מתעכב. אפשר לנסות שוב או לבדוק את חיבור האינטרנט.");
      setAuthReady(true);
    },12000);
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
          window.clearTimeout(authTimeout);
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
          if(nextProfile.role==="admin"&&nextProfile.status==="active"){
            try{await removeLegacyDemoCustomerData();}catch(error){if(active)setSyncError(firebaseMessage(error));}
          }
          setProfile(nextProfile);
          setSelectedCustomer(nextProfile.accountIds[0]||"");
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
              next=>{if(active){setCustomers(next);setSyncError("");}},
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
          window.clearTimeout(authTimeout);
          if(active)setAuthReady(true);
        }
      })();
    });
    return()=>{active=false;window.clearTimeout(authTimeout);unsubscribeStore();unsubscribeSales();unsubscribeCustomers();unsubscribeUsers();unsubscribeAuth();};
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
  const clientId = customers.some(customer=>customer.id===selectedCustomer)?selectedCustomer:(customers[0]?.id||"");
  const scopedMachines = isStaff?store.machines:store.machines.filter(m=>m.accountId===clientId);
  const scopedTickets = isStaff?store.tickets:store.tickets.filter(t=>t.accountId===clientId);
  const scopedOrders = isStaff?store.orders:store.orders.filter(o=>o.accountId===clientId);
  const nav = isStaff?adminNav.filter(item=>item.id!=="access"||role==="admin"):customerNav;
  const firstName = (profile?.displayName||profile?.email||"משתמש").trim().split(/\s+/)[0];
  const selectedCustomerName = customers.find(customer=>customer.id===clientId)?.name || "—";

  const navigate=(next:View)=>{setView(next);setMobileOpen(false);};
  const allowWrite=()=>{if(readOnly){setToast("מצב התצוגה הוא לקריאה בלבד");return false;}return true;};
  const openTicket=(machineId="")=>{if(!allowWrite())return;if(!customers.length){setToast("יש להקים לקוח לפני פתיחת קריאת שירות");return;}setSelectedTicket(machineId);setModal("ticket");};
  const openTicketForCustomer=(accountId:string)=>{if(!allowWrite())return;setSelectedCustomer(accountId);setSelectedTicket("");setModal("ticket");};
  const openTaskForCustomer=(accountId:string)=>{if(!allowWrite())return;if(!customers.length){setToast("יש להקים לקוח לפני יצירת משימה");return;}setSelectedCustomer(accountId);setModal("task");};
  const openCustomer=(id:string)=>{setSelectedCustomer(id);setView("customer");};
  const enterPreview=(next:PreviewContext)=>{setPreview(next);setSelectedCustomer(next.accountId||"");setView("dashboard");setPreviewOpen(false);setModal(null);};
  const leavePreview=()=>{setPreview(null);setView("dashboard");setModal(null);};
  const loginGoogle=async()=>{setAuthBusy(true);setAuthError("");try{await signInWithGoogle();}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const loginEmail=async(email:string,password:string)=>{setAuthBusy(true);setAuthError("");try{await signInWithEmail(email,password);}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const sendReset=async(email:string)=>{setAuthBusy(true);setAuthError("");try{await resetPassword(email);setToast("קישור לאיפוס סיסמה נשלח");}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const saveQuoteInCycle=async(quote:Quote)=>{
    if(!allowWrite())return;
    await saveQuote(quote);
    if(quote.status==="אושרה"&&!quote.accountId){
      const lead=salesWorkspace.leads.find(item=>item.id===quote.leadId);
      await convertQuoteToCustomer(quote,lead);
      setToast("ההצעה אושרה וכרטיס הלקוח הוקם אוטומטית");
      return;
    }
    setToast("הצעת המחיר נשמרה");
  };
  const openNewQuoteForCustomer=(customer:Customer)=>{setQuoteToOpen(null);setQuoteCustomer(customer);navigate("quotes");};
  const openCustomerQuote=(quote:Quote)=>{setQuoteCustomer(null);setQuoteToOpen(quote);navigate("quotes");};

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
          {!preview&&<button className="account-password" onClick={()=>setModal("password")}><KeyRound size={17}/><span>הגדרת כניסה עם סיסמה</span></button>}
          <button className="logout" onClick={()=>void signOutUser()} aria-label="התנתקות"><LogOut size={17}/><span>התנתקות</span></button>
        </div>
      </aside>
      {mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="סגירת התפריט"/>}
      <main>
        <header className="topbar">
          <button className="menu" onClick={()=>setMobileOpen(v=>!v)} aria-label={mobileOpen?"סגירת תפריט":"פתיחת תפריט"} aria-expanded={mobileOpen}><Menu size={23}/></button>
          <div className="page-heading"><span>{greeting}, {firstName}</span><h1>{nav.find(n=>n.id===view)?.label || (view==="customer"?"כרטיס לקוח":"מערכת שירות")}</h1></div>
          <div className="top-actions">
            {!isStaff&&role==="multi"&&<select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>}
            {profile.role==="admin"&&!preview&&<button className="preview-button" onClick={()=>setPreviewOpen(true)}><Eye size={17}/> תצוגת מערכת</button>}
            {isStaff&&<button className="top-create" onClick={()=>openTicket()}><Plus size={17}/> קריאה חדשה</button>}
          </div>
        </header>
        <div className="content">
          {view==="dashboard"&&(isStaff?<AdminDashboard store={store} sales={salesWorkspace} customers={customers} go={navigate} openCustomer={openCustomer} greeting={greeting} firstName={firstName}/>:customers.find(c=>c.id===clientId)?<CustomerDashboard customer={customers.find(c=>c.id===clientId)!} store={store} go={navigate} openTicket={openTicket} greeting={greeting}/>:<EmptyCustomerState/>)}
          {view==="leads"&&isStaff&&<LeadsWorkspace workspace={salesWorkspace} readOnly={readOnly} canMigrate={profile.role==="admin"&&!preview} onSaveLead={async(lead:Lead)=>{if(!allowWrite())return;await saveLead(lead);setToast("הליד נשמר");}} onSaveQuote={saveQuoteInCycle} onImport={async(next:SalesWorkspace)=>{if(!allowWrite())return;const result=await importSalesWorkspace(next);setToast(`הועברו ${result.importedLeads} לידים ו־${result.importedQuotes} הצעות. במאגר המאוחד: ${result.storedLeads} לידים ו־${result.storedQuotes} הצעות.`);}} onOpenQuotes={()=>navigate("quotes")}/>}
          {view==="quotes"&&isStaff&&<QuotesWorkspace workspace={salesWorkspace} readOnly={readOnly} onSaveQuote={saveQuoteInCycle} onDeleteQuote={async(quoteId:string)=>{if(!allowWrite())return;await deleteQuote(quoteId);setToast("גרסת ההצעה נמחקה");}} onConvert={async(quote:Quote,lead?:Lead)=>{if(!allowWrite())throw new Error("מצב תצוגה הוא לקריאה בלבד");const accountId=await convertQuoteToCustomer(quote,lead,{manual:quote.status!=="אושרה"});setToast(quote.status==="אושרה"?"חשבון הלקוח הוקם":"כרטיס הלקוח הוקם ידנית");return accountId;}} onOpenLeads={()=>navigate("leads")} initialQuote={quoteToOpen} initialCustomer={quoteCustomer} customerCount={customers.length} onInitialRequestConsumed={()=>{setQuoteToOpen(null);setQuoteCustomer(null);}}/>}
          {view==="customers"&&<Customers customers={customers} sales={salesWorkspace} store={store} openCustomer={openCustomer} openTicket={openTicketForCustomer} openTask={openTaskForCustomer}/>}
          {view==="customer"&&(customers.find(c=>c.id===clientId)?<CustomerCard customer={customers.find(c=>c.id===clientId)!} store={store} sales={salesWorkspace} openTicket={openTicket} openTask={()=>{if(allowWrite())setModal("task");}} onNewQuote={openNewQuoteForCustomer} onOpenQuote={openCustomerQuote}/>:<EmptyCustomerState/>)}
          {view==="tickets"&&<Tickets tickets={scopedTickets} machines={store.machines} isStaff={isStaff} onUpdate={(id,status)=>{if(!allowWrite())return;setStore(s=>({...s,tickets:s.tickets.map(t=>t.id===id?{...t,status,updatedAt:new Date().toISOString()}:t)}));setToast("סטטוס הקריאה עודכן");}} onOpen={id=>{setSelectedTicket(id);setModal("detail");}} onClose={id=>{if(!allowWrite())return;setSelectedTicket(id);setModal("close");}} openTicket={openTicket}/>}
          {view==="machines"&&<Machines machines={scopedMachines} isStaff={isStaff} openTicket={openTicket} onStatus={(id,status)=>{if(!allowWrite())return;setStore(s=>({...s,machines:s.machines.map(m=>m.id===id?{...m,status}:m)}));}}/>}
          {view==="orders"&&<Orders orders={scopedOrders} isStaff={isStaff} onChange={(id,data)=>{if(!allowWrite())return;setStore(s=>({...s,orders:s.orders.map(o=>o.id===id?{...o,...data}:o)}));setToast(isStaff?"ההזמנה עודכנה":"השינוי נשמר וממתין לאישור הצוות");}}/>}
          {view==="tasks"&&<Tasks tasks={store.tasks} onCreate={()=>{if(allowWrite())setModal("task");}} onStatus={(id,status)=>{if(!allowWrite())return;setStore(s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,status}:t)}));}}/>}
          {view==="reports"&&<Reports store={store}/>}
          {view==="access"&&profile.role==="admin"&&<AccessManagement customers={customers} users={users} readOnly={readOnly} onSave={async(user,role,accountIds,status)=>{if(!allowWrite())return;try{await updateUserAccess(user.uid,role,accountIds,status);setToast("ההרשאות עודכנו בהצלחה");}catch(error){setSyncError(firebaseMessage(error));}}} onPreview={next=>enterPreview(next)}/>}
          {view==="contract"&&(customers.find(c=>c.id===clientId)?<Contract customer={customers.find(c=>c.id===clientId)!} machines={scopedMachines}/>:<EmptyCustomerState/>)}
          {view==="contact"&&<Contact/>}
        </div>
      </main>
      <div className="mobile-nav">{nav.slice(0,5).map(n=>{const Icon=n.icon;return <button key={n.id} className={view===n.id?"active":""} onClick={()=>navigate(n.id)}><Icon size={19}/>{n.label}</button>})}</div>
      {modal==="ticket"&&<TicketModal customers={customers} accountId={clientId} allowAccountChange={isStaff} preselectedMachine={selectedTicket} machines={store.machines} onClose={()=>setModal(null)} onSave={ticket=>{setStore(s=>({...s,tickets:[ticket,...s.tickets]}));setModal(null);setView("tickets");setToast(`הקריאה ${ticket.id} נפתחה בהצלחה`);}}/>}
      {modal==="task"&&<TaskModal customers={customers} accountId={clientId} onClose={()=>setModal(null)} onSave={task=>{setStore(s=>({...s,tasks:[task,...s.tasks]}));setModal(null);setToast("המשימה נוצרה בהצלחה");}}/>}
      {modal==="close"&&<CloseModal onClose={()=>setModal(null)} onSave={reason=>{setStore(s=>({...s,tickets:s.tickets.map(t=>t.id===selectedTicket?{...t,status:"נסגרה",closedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),closeReason:reason}:t)}));setModal(null);setToast("הקריאה נסגרה");}}/>}
      {modal==="detail"&&<TicketDetailModal ticket={store.tickets.find(t=>t.id===selectedTicket)!} machine={store.machines.find(m=>m.id===store.tickets.find(t=>t.id===selectedTicket)?.machineId)} onClose={()=>setModal(null)}/>}
      {modal==="password"&&<PasswordSetupModal email={profile.email} onClose={()=>setModal(null)} onSave={async password=>{await linkPasswordToCurrentUser(password);setModal(null);setToast("הכניסה עם סיסמה הופעלה בהצלחה");}}/>}
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
  const [accountId,setAccountId]=useState(currentAccount||customers[0]?.id||"");
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
  return <article className="access-user"><div className="access-user-main"><span className="customer-avatar">{(user.displayName||user.email).slice(0,2)}</span><div><strong>{user.displayName||"משתמש"}</strong><small>{user.email}</small></div><Badge>{user.status==="active"?"פעיל":"ממתין לאישור"}</Badge><span className="role-label">{roleNames[user.role]}</span><div className="access-actions"><button onClick={()=>onPreview({role:user.role,accountId:user.accountIds[0]||customers[0]?.id||""})}><Eye size={15}/> תצוגה</button><button disabled={readOnly} onClick={()=>setEditing(value=>!value)}><UserCog size={15}/> הרשאות</button></div></div>{editing&&<div className="access-editor"><label><span>תפקיד</span><select value={role} onChange={event=>setRole(event.target.value as Role)}><option value="customer">לקוח רגיל</option><option value="multi">לקוח מרובה סניפים</option><option value="service">נציג שירות</option><option value="admin">מנהל מערכת</option></select></label><label><span>מצב החשבון</span><select value={status} onChange={event=>setStatus(event.target.value as UserProfile["status"])}><option value="pending">ממתין לאישור</option><option value="active">פעיל</option></select></label>{(role==="customer"||role==="multi")&&<fieldset><legend>חשבונות לקוח</legend><div>{customers.map(customer=><label key={customer.id}><input type="checkbox" checked={accountIds.includes(customer.id)} onChange={()=>toggleAccount(customer.id)}/><span>{customer.name}</span></label>)}</div></fieldset>}<footer><button onClick={()=>setEditing(false)}>ביטול</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?"שומר…":"שמירת הרשאות"}</button></footer></div>}</article>
}

function firebaseMessage(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes("auth/invalid-credential"))return "פרטי הכניסה אינם נכונים.";
  if(message.includes("auth/popup-closed-by-user"))return "חלון הכניסה נסגר לפני השלמת התהליך.";
  if(message.includes("auth/popup-blocked"))return "הדפדפן חסם את חלון הכניסה. יש לאפשר חלונות קופצים ולנסות שוב.";
  if(message.includes("auth/cancelled-popup-request"))return "בקשת הכניסה הקודמת בוטלה. אפשר לנסות שוב.";
  if(message.includes("auth/unauthorized-domain"))return "כתובת האתר עדיין לא אושרה להתחברות ב־Firebase.";
  if(message.includes("auth/weak-password"))return "יש לבחור סיסמה חזקה יותר, באורך 8 תווים לפחות.";
  if(message.includes("auth/provider-already-linked"))return "כניסה עם סיסמה כבר מוגדרת לחשבון הזה.";
  if(message.includes("auth/credential-already-in-use")||message.includes("auth/email-already-in-use"))return "כתובת המייל כבר משויכת לחשבון אחר. יש לפנות למנהל המערכת.";
  if(message.includes("auth/requires-recent-login"))return "מטעמי אבטחה יש להתנתק, להתחבר שוב עם Google ולנסות שנית.";
  if(message.includes("auth/missing-email"))return "לא נמצאה כתובת מייל בחשבון המחובר.";
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

function Customers({customers,sales,store,openCustomer,openTicket,openTask}:{customers:Customer[];sales:SalesWorkspace;store:Store;openCustomer:(id:string)=>void;openTicket:(id:string)=>void;openTask:(id:string)=>void}) {
  const [q,setQ]=useState(""); const [filter,setFilter]=useState("הכל");
  const rows=customers.filter(c=>(c.name+c.contactName+c.city).toLowerCase().includes(q.toLowerCase())&&(filter==="הכל"||c.status===filter));
  return <><SectionTitle title="לקוחות" sub={`${customers.length} חשבונות לקוח במערכת`}/>
    <div className="process-cycle" aria-label="מעגל התהליך העסקי"><div><UsersRound size={18}/><strong>{sales.leads.filter(lead=>!lead.deleted&&!lead.convertedAccountId).length}</strong><span>לידים</span></div><b>←</b><div><FileSignature size={18}/><strong>{sales.quotes.filter(quote=>!quote.accountId).length}</strong><span>הצעות</span></div><b>←</b><div className="active"><Building2 size={18}/><strong>{customers.length}</strong><span>לקוחות</span></div><b>↺</b><small>הצעה חדשה מתוך כרטיס הלקוח</small></div>
    <div className="filters"><label className="search">⌕<input placeholder="חיפוש לפי לקוח, איש קשר או עיר" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option>הכל</option><option>פעיל</option><option>בסיכון</option><option>בהקמה</option><option>בהשהיה</option></select><span className="result-count">{rows.length} תוצאות</span></div>
    <div className="table-wrap"><table><thead><tr><th>לקוח</th><th>סטטוס</th><th>עיר</th><th>איש קשר</th><th>סניפים</th><th>מכונות</th><th>ק״ג חודשי</th><th>קריאות</th><th>הזמנה</th><th></th></tr></thead><tbody>{rows.map(c=>{const open=store.tickets.filter(t=>t.accountId===c.id&&!closed(t.status)).length, order=store.orders.find(o=>o.accountId===c.id), risks=riskReasons(c,store);return <tr key={c.id}><td><button className="name-cell" onClick={()=>openCustomer(c.id)}><span className="customer-avatar">{c.name.slice(0,2)}</span><strong>{c.name}</strong></button></td><td><Badge>{risks.length?"בסיכון":c.status}</Badge>{risks.length>0&&<small>{risks[0]}</small>}</td><td>{c.city}</td><td><strong>{c.contactName}</strong><small>{c.phone}</small></td><td>{c.branches.length}</td><td>{store.machines.filter(m=>m.accountId===c.id).length}</td><td>{c.monthlyKg}</td><td>{open?<span className="count-alert">{open}</span>:"—"}</td><td>{order&&<Badge>{order.status}</Badge>}</td><td><div className="row-actions"><button className="row-action" onClick={()=>openCustomer(c.id)}>כרטיס</button><button className="row-action" onClick={()=>openTicket(c.id)}>קריאה</button><button className="row-action" onClick={()=>openTask(c.id)}>משימה</button></div></td></tr>})}</tbody></table></div>
    <div className="mobile-cards">{rows.map(c=><button className="mobile-card" key={c.id} onClick={()=>openCustomer(c.id)}><div><span className="customer-avatar">{c.name.slice(0,2)}</span><strong>{c.name}</strong><Badge>{c.status}</Badge></div><p>{c.contactName||"איש קשר טרם הוגדר"} · {c.city||"מיקום טרם הוגדר"}</p><small>{store.machines.filter(m=>m.accountId===c.id).length} מכונות · {c.monthlyKg} ק״ג בחודש</small></button>)}</div>
    {!rows.length&&<EmptyCustomerState/>}
  </>;
}

function EmptyCustomerState(){return <section className="panel empty-customer-state"><Building2 size={34}/><h2>עדיין אין לקוחות פעילים</h2><p>כרטיס לקוח יופיע כאן לאחר אישור הצעת מחיר או לאחר הקמה ידנית.</p></section>}

function CustomerCard({customer,store,sales,openTicket,openTask,onNewQuote,onOpenQuote}:{customer:Customer;store:Store;sales:SalesWorkspace;openTicket:(m?:string)=>void;openTask:()=>void;onNewQuote:(customer:Customer)=>void;onOpenQuote:(quote:Quote)=>void}) {
  const [tab,setTab]=useState("סקירה");
  const ms=store.machines.filter(m=>m.accountId===customer.id), ts=store.tickets.filter(t=>t.accountId===customer.id), os=store.orders.filter(o=>o.accountId===customer.id);
  const quotes=sales.quotes.filter(quote=>quote.accountId===customer.id||quote.id===customer.sourceQuoteId||quote.clientKey===customer.id);
  const linkedLeadIds=new Set([customer.sourceLeadId,...quotes.map(quote=>quote.leadId)].filter(Boolean));
  const leads=sales.leads.filter(lead=>lead.convertedAccountId===customer.id||linkedLeadIds.has(lead.id));
  const contractEnd=customer.contractEnd?formatDate(customer.contractEnd):"טרם הוגדר";
  const value=(text:string|undefined)=>text||"טרם הוגדר";
  return <><div className="customer-header"><div className="customer-avatar xl">{customer.name.slice(0,2)}</div><div><div className="header-line"><h2>{customer.name}</h2><Badge>{customer.status}</Badge><Badge>{customer.rank}</Badge></div><p>{value(customer.city)} · מנהל לקוח: {value(customer.owner)}</p></div><div className="title-actions"><button onClick={()=>onNewQuote(customer)}>＋ הצעת מחיר חדשה</button><button onClick={openTask}>＋ יצירת משימה</button><button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאה</button></div></div>
    <div className="tabs">{["סקירה","הצעות מחיר","לידים ומכירות","סניפים ואנשי קשר","מכונות","קריאות שירות","הזמנות קפה","חוזה","משימות","מסמכים והערות"].map(t=><button className={tab===t?"active":""} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==="סקירה"&&<><div className="kpi-grid"><Kpi label="ק״ג חודשי מוסכם" value={customer.monthlyKg||0} meta="לפי הכרטיס"/><Kpi label="מכונות פעילות" value={ms.filter(m=>m.status==="פעילה").length} meta={`מתוך ${ms.length}`}/><Kpi label="קריאות פתוחות" value={ts.filter(t=>!closed(t.status)).length} meta="דורשות מעקב" tone="blue"/><Kpi label="סיום הסכם" value={contractEnd} meta="מעקב חידוש"/></div><div className="dashboard-grid"><section className="panel"><h3>פרטי קשר</h3><dl><div><dt>איש קשר</dt><dd>{value(customer.contactName)}</dd></div><div><dt>טלפון</dt><dd>{value(customer.phone)}</dd></div><div><dt>דוא״ל</dt><dd>{value(customer.email)}</dd></div><div><dt>כתובת</dt><dd>{[customer.address,customer.city].filter(Boolean).join(", ")||"טרם הוגדרה"}</dd></div></dl></section><section className="panel"><h3>תמונת שירות</h3><dl><div><dt>רמת שירות</dt><dd>{value(customer.serviceLevel)}</dd></div><div><dt>סניפים</dt><dd>{customer.branches.length}</dd></div><div><dt>הזמנה קרובה</dt><dd>{os[0]?`${os[0].requestedKg} ק״ג`:"אין הזמנה"}</dd></div><div><dt>אחראי פנימי</dt><dd>{value(customer.owner)}</dd></div></dl></section></div></>}
    {tab==="הצעות מחיר"&&<section className="panel customer-history-panel"><header><div><h3>הצעות המחיר של הלקוח</h3><p>הצעות עבר נשמרות כפי שנשלחו ואינן משתנות עם עדכון פרטי הלקוח.</p></div><button className="primary" onClick={()=>onNewQuote(customer)}>＋ הצעה חדשה</button></header>{quotes.length?<div className="customer-history-list">{quotes.map(quote=><button key={quote.id} onClick={()=>onOpenQuote(quote)}><div><strong>{quote.versionName}</strong><small>{formatDate(quote.savedAt||quote.updatedAt)}</small></div><Badge>{quote.status}</Badge><span>{quote.knownKg||0} ק״ג</span><b>פתיחה ←</b></button>)}</div>:<div className="inline-empty">אין עדיין הצעות מחיר משויכות ללקוח.</div>}</section>}
    {tab==="לידים ומכירות"&&<section className="panel customer-history-panel"><header><div><h3>היסטוריית מכירות</h3><p>מקור הלקוח והשלבים שקדמו להקמת הכרטיס.</p></div></header>{leads.length?<div className="customer-history-list">{leads.map(lead=><div className="history-static" key={lead.id}><div><strong>{lead.company}</strong><small>עודכן {formatDate(lead.updatedAt)}</small></div><Badge>{lead.status}</Badge><span>{lead.owner||"—"}</span></div>)}</div>:<div className="inline-empty">הלקוח הוקם ללא ליד מקושר.</div>}</section>}
    {tab==="סניפים ואנשי קשר"&&<div className="card-grid">{customer.branches.map((b,i)=><div className="info-card" key={b}><span>סניף {i+1}</span><h3>{b}</h3><p>{customer.address}, {customer.city}</p><small>{customer.contactName} · {customer.phone}</small></div>)}</div>}
    {tab==="מכונות"&&<Machines machines={ms} isStaff openTicket={openTicket} onStatus={()=>{}}/>}
    {tab==="קריאות שירות"&&<Tickets tickets={ts} machines={store.machines} isStaff onUpdate={()=>{}} onOpen={()=>{}} onClose={()=>{}} openTicket={openTicket}/>}
    {tab==="הזמנות קפה"&&<Orders orders={os} isStaff onChange={()=>{}}/>}
    {tab==="חוזה"&&<Contract customer={customer} machines={ms}/>}
    {tab==="משימות"&&<Tasks tasks={store.tasks.filter(t=>t.accountId===customer.id)} onCreate={openTask} onStatus={()=>{}}/>}
    {tab==="מסמכים והערות"&&<section className="panel notes"><h3>מסמכים והערות</h3><div className="inline-empty">עדיין לא נוספו מסמכים או הערות ללקוח.</div><textarea placeholder="הוספת הערה פנימית…"/><button className="primary">שמירת הערה</button></section>}
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
  if(!orders.length)return <><SectionTitle title="הזמנות קפה"/><section className="panel inline-empty">אין הזמנות קפה פעילות.</section></>;
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
  const openTickets=store.tickets.filter(ticket=>!closed(ticket.status)).length;
  return <><SectionTitle title="דוחות"/><div className="kpi-grid"><Kpi label="קריאות פתוחות" value={openTickets} meta="נתוני אמת" tone="blue"/><Kpi label="קריאות שנסגרו" value={store.tickets.length-openTickets} meta="נתוני אמת"/><Kpi label="מכונות" value={store.machines.length} meta="משויכות ללקוחות"/><Kpi label="הזמנות פעילות" value={store.orders.length} meta="במערכת"/></div>{!store.tickets.length&&!store.machines.length&&!store.orders.length&&<section className="panel inline-empty">הדוחות יוצגו לאחר שיצטברו נתוני פעילות.</section>}</>
}

function Contract({customer,machines}:{customer:Customer;machines:Machine[]}) {return <><SectionTitle title="ההסכם שלי"/><section className="panel contract"><div className="contract-head"><span className="contract-icon">▤</span><div><span>{customer.contractEnd?"הסכם שירות":"הסכם טרם הוגדר"}</span><h2>{customer.name}</h2><Badge>{customer.serviceLevel||"טרם הוגדר"}</Badge></div></div><dl><div><dt>סיום ההסכם</dt><dd>{formatDate(customer.contractEnd)}</dd></div><div><dt>כמות חודשית מוסכמת</dt><dd>{customer.monthlyKg||0} ק״ג</dd></div><div><dt>מכונות משויכות</dt><dd>{machines.length} פריטי ציוד</dd></div><div><dt>רמת שירות</dt><dd>{customer.serviceLevel||"טרם הוגדרה"}</dd></div></dl></section></>}
function Contact(){return <><SectionTitle title="יצירת קשר"/><section className="panel inline-empty">פרטי מוקד השירות טרם הוגדרו במערכת.</section></>}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><header><h2>{title}</h2><button onClick={onClose}>×</button></header>{children}</div></div>}
function PasswordSetupModal({email,onClose,onSave}:{email:string;onClose:()=>void;onSave:(password:string)=>Promise<void>}) {
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(password.length<8){setError("יש לבחור סיסמה באורך 8 תווים לפחות.");return;}
    if(password!==confirmation){setError("הסיסמאות אינן זהות.");return;}
    setBusy(true);setError("");
    try{await onSave(password);}catch(nextError){setError(firebaseMessage(nextError));setBusy(false);}
  };
  return <Modal title="הגדרת כניסה עם סיסמה" onClose={onClose}><form className="modal-form password-setup" onSubmit={submit}>
    <div className="password-setup-note"><KeyRound size={20}/><div><strong>אפשרות כניסה נוספת</strong><p>לאחר ההגדרה יהיה אפשר להתחבר לאותו חשבון גם באמצעות Google וגם באמצעות מייל וסיסמה.</p></div></div>
    <label><span>כתובת המייל</span><input type="email" value={email} disabled/></label>
    <label><span>סיסמה חדשה</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={8} required autoComplete="new-password" placeholder="8 תווים לפחות"/></label>
    <label><span>אימות הסיסמה</span><input type="password" value={confirmation} onChange={event=>setConfirmation(event.target.value)} minLength={8} required autoComplete="new-password" placeholder="הקלדה חוזרת"/></label>
    {error&&<div className="auth-error">{error}</div>}
    <footer><button type="button" onClick={onClose} disabled={busy}>ביטול</button><button className="primary" type="submit" disabled={busy}>{busy?"מגדיר…":"הפעלת כניסה עם סיסמה"}</button></footer>
  </form></Modal>;
}
function TicketModal({customers,accountId,allowAccountChange,preselectedMachine,machines,onClose,onSave}:{customers:Customer[];accountId:string;allowAccountChange:boolean;preselectedMachine:string;machines:Machine[];onClose:()=>void;onSave:(t:Ticket)=>void}) {
  const [activeAccount,setActiveAccount]=useState(accountId);
  const customer=customers.find(c=>c.id===activeAccount)||customers[0]; const available=machines.filter(m=>m.accountId===customer.id);
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget), machineId=String(f.get("machine")), eventId=Math.round(e.timeStamp);onSave({id:`SR-${eventId}`,accountId:customer.id,site:String(f.get("site")),machineId,type:String(f.get("type")),urgency:String(f.get("urgency")),status:"התקבלה",description:String(f.get("description")),contact:String(f.get("contact")),phone:String(f.get("phone")),assignedTo:"טרם הוקצה",openedAt:new Date().toISOString(),updatedAt:new Date().toISOString()})};
  return <Modal title="פתיחת קריאת שירות" onClose={onClose}><form onSubmit={submit} className="modal-form">{allowAccountChange?<label className="account-picker"><span>לקוח</span><select value={activeAccount} onChange={e=>setActiveAccount(e.target.value)}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:<div className="customer-context"><span className="customer-avatar">{customer.name.slice(0,2)}</span><div><small>עבור</small><strong>{customer.name}</strong></div></div>}<div className="form-grid"><label><span>סניף</span><select name="site" required key={`site-${activeAccount}`}>{customer.branches.map(b=><option key={b}>{b}</option>)}</select></label><label><span>מכונה</span><select name="machine" defaultValue={preselectedMachine} key={`machine-${activeAccount}`}><option value="">בעיה כללית</option>{available.map(m=><option key={m.id} value={m.id}>{m.model} · {m.serial}</option>)}</select></label><label><span>סוג תקלה</span><select name="type">{["נזילה","המכונה לא נדלקת","קפה יוצא חלש","אין חימום","בעיית טחינה","בעיית חלב / מקציף","דרוש ניקוי","תקלה חוזרת","בקשת הדרכה"].map(x=><option key={x}>{x}</option>)}</select></label><label><span>דחיפות</span><select name="urgency"><option>רגילה</option><option>גבוהה</option><option>דחופה</option></select></label><label className="full"><span>תיאור הבעיה</span><textarea name="description" required placeholder="מה קרה ומתי התחילה הבעיה?"/></label><label><span>איש קשר</span><input name="contact" key={`contact-${activeAccount}`} defaultValue={customer.contactName}/></label><label><span>טלפון לחזרה</span><input name="phone" key={`phone-${activeAccount}`} defaultValue={customer.phone}/></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">פתיחת הקריאה</button></footer></form></Modal>
}
function TaskModal({customers,accountId,onClose,onSave}:{customers:Customer[];accountId:string;onClose:()=>void;onSave:(t:Task)=>void}) {const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave({id:`t-${Math.round(e.timeStamp)}`,accountId:String(f.get("account")),title:String(f.get("title")),type:String(f.get("type")),dueDate:String(f.get("date")),priority:String(f.get("priority")),status:"פתוחה",assignedTo:String(f.get("assignee"))})};return <Modal title="יצירת משימה" onClose={onClose}><form onSubmit={submit} className="modal-form"><div className="form-grid"><label className="full"><span>כותרת המשימה</span><input name="title" required placeholder="מה צריך לבצע?"/></label><label><span>לקוח</span><select name="account" defaultValue={accountId}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>סוג</span><select name="type"><option>שירות</option><option>הזמנה</option><option>מכונה</option><option>חוזה</option><option>שימור</option><option>כללי</option></select></label><label><span>תאריך יעד</span><input type="date" name="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><label><span>עדיפות</span><select name="priority"><option>נמוכה</option><option>בינונית</option><option>גבוהה</option></select></label><label className="full"><span>אחראי</span><select name="assignee"><option>טרם הוקצה</option><option>מנהל המערכת</option></select></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">יצירת משימה</button></footer></form></Modal>}
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
