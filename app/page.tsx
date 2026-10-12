"use client";

import { createContext, FormEvent, useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Activity,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Coffee,
  Download,
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
  MonitorCog,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  ClipboardCheck,
  UsersRound,
  X,
  History,
  BellRing,
} from "lucide-react";
import {
  convertLeadToCustomer,
  convertQuoteToCustomer,
  deleteCustomerAccount,
  deleteQuote,
  ensureCustomerAccessInvites,
  getOrCreateUserProfile,
  importSalesWorkspace,
  linkPasswordToCurrentUser,
  loadTicketAttachment,
  observeAuth,
  resetPassword,
  revokeUserAccess,
  adminSetUserPassword,
  addQuoteMachines,
  loadAuditLog,
  type AuditEntry,
  savePlatformStore,
  saveCustomer,
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
import { hasPersistentSession, isBootstrapAdminEmail, isTrustedAdminProfile } from "@/lib/access-invite";
import type {
  Activity as ActivityRecord,
  CommercialAgreement,
  CommercialAgreementModel,
  Customer,
  CustomerConversionResult,
  Lead,
  Machine,
  MonthlyProfitability,
  Order,
  PlatformStore as Store,
  ProfitabilityBlendPreset,
  ProfitabilitySaleLine,
  DeliveryPreference,
  ProfitabilitySalesChannel,
  PreviewContext,
  Quote,
  Role,
  SalesWorkspace,
  Task,
  Ticket,
  TicketIntake,
  UserProfile,
  View,
} from "@/lib/platform-types";
import {
  calculateTicketDeadlines,
  isTicketSlaBreached,
  nextTechnicianStatus,
} from "@/lib/service-engine";
import { passwordSecurityError } from "@/lib/security";
import { reconcileFilterReplacementTask, updateTaskStatus } from "@/lib/maintenance-engine";
import { createBusinessBackup } from "@/lib/system-backup";
import { buildDefaultCompanySales, calculateActualProfitability } from "@/lib/profitability-engine";
import { BLEND_CATALOG, findKnownBlend, knownBlends } from "@/lib/blend-catalog";
import { contractMonthlyKg, currentMonthKey, syncContractOrders } from "@/lib/order-sync";
import { CONTACT_OFFICE_MESSAGE, contractOrdersOnly, DELIVERY_PREFERENCES, extraAllowanceKg, highConsumption, deliveredThisMonthKg, deliveryPreferenceLabel, isExtraOrder, MAX_EXTRA_ORDER_KG, newExtraOrder, nextContractDelivery, openExtraOrders, validateExtraOrder } from "@/lib/extra-orders";
import { buildNotifications, type AppNotification } from "@/lib/notifications";
import { NotificationBell } from "@/components/notification-bell";
import { buildBoardRows, monthHistory, monthSummary, nextAction, ORDER_STAGES, ROW_KIND_LABELS, shiftMonth, sortRows, stageLabel, type BoardRow, type OrderStage } from "@/lib/orders-board";
import { EMERGENCY_PHONE, EMERGENCY_PHONE_LINK, IMPACT_OPTIONS, isSafetyHazard, missingIntake, needsSafetyReview, RECURRENCE_OPTIONS, SAFETY_NONE, SAFETY_OPTIONS, SAFETY_UNSURE, SCREEN_OPTIONS, SCREEN_YES, STARTED_OPTIONS, TICKET_FAULT_TYPES, urgencyForIntake } from "@/lib/ticket-intake";
import { disablePush, enablePush, pushState, refreshPush, type PushState } from "@/lib/push";
import { calculateQuote } from "@/lib/quote-engine";
import { activeQuoteFor, customerUpdateForActiveQuote, existingAccountIdForQuote, isSupersededQuote } from "@/lib/quote-lifecycle";
import { commercialAgreementFromQuote, commercialAgreementLabel, commercialAgreementMonthlyIncome, emptyCommercialAgreement } from "@/lib/commercial-agreement";
import { backdropDismiss } from "@/lib/backdrop-dismiss";

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
const TastingWorkspace = dynamic(
  () => import("@/components/tasting-workspace").then((module) => module.TastingWorkspace),
  { ssr: false, loading: SalesWorkspaceLoading },
);

const initialStore: Store = {tickets:[],orders:[],tasks:[],machines:[],activities:[],profitability:[]};

const roleNames: Record<Role,string> = {customer:"לקוח רגיל",multi:"מנהל לקוח מרובה סניפים",service:"נציג שירות",admin:"מנהל מערכת"};
const customerNav = [
  {id:"dashboard" as View,label:"דף הבית",icon:LayoutDashboard},{id:"machines" as View,label:"המכונות שלי",icon:MonitorCog},
  {id:"tickets" as View,label:"קריאות שירות",icon:Headphones},{id:"orders" as View,label:"הזמנת קפה",icon:Coffee},
  {id:"contract" as View,label:"ההסכם שלי",icon:FileText},
];
const adminNav = [
  {id:"dashboard" as View,label:"מרכז שליטה",icon:LayoutDashboard},{id:"leads" as View,label:"לידים",icon:UsersRound},
  {id:"quotes" as View,label:"הצעות מחיר",icon:FileSignature},{id:"customers" as View,label:"לקוחות",icon:Building2},
  {id:"tickets" as View,label:"שירות ותקלות",icon:Headphones},{id:"orders" as View,label:"הזמנות קפה",icon:Coffee},
  {id:"machines" as View,label:"צי מכונות",icon:MonitorCog},{id:"tasks" as View,label:"משימות צוות",icon:ListTodo},
  {id:"tastings" as View,label:"טעימות קפה",icon:ClipboardCheck},
  {id:"reports" as View,label:"תובנות ודוחות",icon:ChartNoAxesCombined},{id:"access" as View,label:"ניהול והרשאות",icon:UserCog},
];
const serviceNav = [
  {id:"dashboard" as View,label:"היום שלי",icon:LayoutDashboard},
  {id:"tickets" as View,label:"קריאות שירות",icon:Headphones},
  {id:"tasks" as View,label:"משימות",icon:ListTodo},
  {id:"machines" as View,label:"צי מכונות",icon:MonitorCog},
  {id:"customers" as View,label:"לקוחות",icon:Building2},
  {id:"orders" as View,label:"הזמנות קפה",icon:Coffee},
];

const CustomerDirectoryContext = createContext<Customer[]>([]);
const useCustomerName = () => {
  const directory = useContext(CustomerDirectoryContext);
  return (id:string) => directory.find(customer=>customer.id===id)?.name || "—";
};
const formatDate = (v:string) => v&&!Number.isNaN(new Date(v).getTime())?new Intl.DateTimeFormat("he-IL").format(new Date(v)):"טרם הוגדר";
const formatDateTime = (v:string) => v&&!Number.isNaN(new Date(v).getTime())?new Intl.DateTimeFormat("he-IL",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"טרם הוגדר";
const monthLabel = (date=new Date()) => new Intl.DateTimeFormat("he-IL",{month:"long",year:"numeric"}).format(date);
const nextDeliveryDate = (customer:Customer,order?:Order) => {
  const [year,month]=order?.month?.split("-").map(Number)||[];
  const target=year&&month?new Date(year,month-1,1):new Date();
  const day=Math.min(28,Math.max(1,customer.deliveryDayOfMonth||1));
  target.setDate(day);
  if(!order?.month&&target<new Date())target.setMonth(target.getMonth()+1);
  return target.toISOString();
};
/** The quotes that belong to a customer card. */
const customerQuotes = (customer:Customer,quotes:Quote[]) => quotes.filter(quote=>quote.accountId===customer.id||quote.id===customer.sourceQuoteId||quote.clientKey===customer.id);
/** The agreement the customer card works with: the one saved on the card, else built from the active quote. */
const customerAgreement = (customer:Customer,quotes:Quote[]) => {
  if(customer.commercialAgreement)return customer.commercialAgreement;
  const quote=activeQuoteFor(customer,customerQuotes(customer,quotes));
  return quote?commercialAgreementFromQuote(quote):undefined;
};
const latestCustomerOrder = (orders:Order[],accountId:string) =>
  orders
    .filter(order=>order.accountId===accountId)
    .sort((left,right)=>right.month.localeCompare(left.month)||(right.updatedAt||"").localeCompare(left.updatedAt||""))[0];
const createId = (prefix:string) => `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,6)}`;
const greetingForHour = (hour:number) => {
  if(hour<5)return "לילה טוב";
  if(hour<12)return "בוקר טוב";
  if(hour<17)return "צהריים טובים";
  if(hour<21)return "ערב טוב";
  return "לילה טוב";
};
const statusTone = (s:string) => s.includes("דחופ")||s.includes("מושבת")||s==="בסיכון"?"red":s.includes("ממתין")||s.includes("בטיפול")?"blue":s.includes("אישור")||s.includes("חריג")||s.includes("דורשת")?"orange":s.includes("פעיל")||s.includes("אושר")||s.includes("בוצע")||s.includes("סופק")?"green":"gray";
const closed = (s:string) => ["נסגרה","בוטלה","בוטלה על ידי הלקוח"].includes(s);
const profitabilityChannelLabel = (channel:ProfitabilitySalesChannel) => channel==="employees"?"עובדים":channel==="company_extra"?"אקסטרה לחברה":"במסגרת החוזה";
const slaBreached = (ticket: Ticket) => {
  return isTicketSlaBreached(ticket,Date.now());
};
const riskReasons = (customer: Customer, store: Store) => {
  const open = store.tickets.filter(t=>t.accountId===customer.id&&!closed(t.status));
  const order = latestCustomerOrder(store.orders,customer.id);
  const reasons:string[] = [];
  if(open.length>=2) reasons.push("2 קריאות פתוחות או יותר");
  if(open.some(t=>t.urgency==="דחופה")) reasons.push("קריאה דחופה פתוחה");
  const contractDays=customer.contractEnd?(new Date(customer.contractEnd).getTime()-Date.now())/86_400_000:Number.POSITIVE_INFINITY;
  if(contractDays<=60) reasons.push("הסכם מסתיים בקרוב");
  if(order&&order.requestedKg<order.defaultKg*.7) reasons.push("ירידה חריגה בהזמנה");
  if(store.machines.some(m=>m.accountId===customer.id&&m.status==="מושבתת")) reasons.push("מכונה מושבתת");
  return reasons;
};
function Badge({children}:{children:React.ReactNode}) { const text=Array.isArray(children)?children.join(""):String(children??"");return <span className={`badge ${statusTone(text)}`}>{text}</span>; }
function PilotBadge({large=false}:{large?:boolean}) { return <span className={`pilot-badge ${large?"large":""}`}>פיילוט</span>; }
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
  // A quote opened from a customer card returns to that card when it closes.
  const [quoteReturnCustomer,setQuoteReturnCustomer] = useState("");
  const [customerTab,setCustomerTab] = useState<string|undefined>(undefined);
  const [modal,setModal] = useState<null|"ticket"|"editTicket"|"task"|"close"|"detail"|"password"|"customer"|"newCustomer"|"machine">(null);
  const [selectedTicket,setSelectedTicket] = useState<string>("");
  const [selectedMachine,setSelectedMachine] = useState<string>("");
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
          setProfile(nextProfile);
          setSelectedCustomer(nextProfile.accountIds[0]||"");
          if(nextProfile.status==="active"){
            unsubscribeStore=subscribeToPlatformStore(
              nextProfile,
              next=>{if(active){setStore(next);setStoreReady(true);setSyncError("");}},
              error=>{if(active)setSyncError(firebaseMessage(error));}
            );
            if(nextProfile.role==="admin"){
              unsubscribeSales=subscribeToSalesWorkspace(
                nextProfile,
                next=>{if(active){setSalesWorkspace(next);setSyncError("");}},
                error=>{if(active)setSyncError(firebaseMessage(error));}
              );
            }
            unsubscribeCustomers=subscribeToCustomers(
              nextProfile,
              next=>{if(active){setCustomers(next);setSyncError("");if(nextProfile.role==="admin")void ensureCustomerAccessInvites(next).catch(error=>setSyncError(firebaseMessage(error)));}},
              error=>{if(active)setSyncError(firebaseMessage(error));}
            );
            if(nextProfile.role==="admin"||nextProfile.role==="service"){
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
    void savePlatformStore(store,profile).catch(error=>setSyncError(firebaseMessage(error)));
  },[store,storeReady,profile,preview]);
  useEffect(()=>{
    if(!profile||profile.status!=="active"||hasPersistentSession(profile.email))return;
    const timeoutMs=["admin","service"].includes(profile.role)?2*60*60*1000:12*60*60*1000;
    let timer=0;
    const reset=()=>{
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>{
        setAuthError("החיבור נותק לאחר זמן ממושך ללא פעילות. יש להתחבר מחדש.");
        void signOutUser();
      },timeoutMs);
    };
    const events=["pointerdown","keydown","touchstart"] as const;
    events.forEach(event=>window.addEventListener(event,reset));
    reset();
    return()=>{window.clearTimeout(timer);events.forEach(event=>window.removeEventListener(event,reset));};
  },[profile]);
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
  useEffect(()=>{
    if(!("serviceWorker" in navigator)||process.env.NODE_ENV!=="production")return;
    const register=()=>{void navigator.serviceWorker.register("/mister-bean-platform/sw.js",{scope:"/mister-bean-platform/"});};
    window.addEventListener("load",register,{once:true});
    return()=>window.removeEventListener("load",register);
  },[]);

  const role = preview?.role || profile?.role || null;
  const isStaff = role==="service"||role==="admin";
  const readOnly = Boolean(preview);
  useEffect(()=>{
    if(!storeReady||!isStaff||preview)return;
    const ownersByAccount=new Map(customers.map(customer=>[customer.id,customer.owner||"מנהל המערכת"]));
    const reconcile=()=>setStore(current=>{
      const tasks=current.machines.reduce((next,machine)=>reconcileFilterReplacementTask(next,machine,ownersByAccount.get(machine.accountId)||"מנהל המערכת"),current.tasks);
      return tasks===current.tasks?current:{...current,tasks};
    });
    reconcile();
    const timer=window.setInterval(reconcile,60*60*1000);
    return()=>window.clearInterval(timer);
  },[customers,isStaff,preview,storeReady]);
  // What this session already synced, so two open screens that see the contract differently cannot keep
  // overwriting each other (on 11.10 two screens rewrote the same orders some 2,000 times in four minutes).
  const contractSyncApplied=useRef(new Set<string>());
  useEffect(()=>{
    // Only administrators: they see the quotes the contract may come from, and one role doing it is enough.
    if(!storeReady||role!=="admin"||preview)return;
    const agreementFor=(customer:Customer)=>customerAgreement(customer,salesWorkspace.quotes);
    const once=(key:string)=>{if(contractSyncApplied.current.has(key))return false;contractSyncApplied.current.add(key);return true;};
    const sync=()=>{
      const month=currentMonthKey();
      const due=customers.filter(customer=>once(`order:${customer.id}:${month}:${contractMonthlyKg(customer,agreementFor(customer))}`));
      if(!due.length)return;
      setStore(current=>{const orders=syncContractOrders(current.orders,due,month,agreementFor);return orders===current.orders?current:{...current,orders};});
    };
    // The card's monthly quantity is shown on many screens; keep it equal to the contract it works with.
    for(const customer of customers){
      const agreement=agreementFor(customer);
      if(!agreement)continue;
      const kg=contractMonthlyKg(customer,agreement);
      if(kg>0&&kg!==customer.monthlyKg&&once(`kg:${customer.id}:${kg}`))void saveCustomer({...customer,monthlyKg:kg}).then(()=>setCustomers(list=>list.map(item=>item.id===customer.id?{...item,monthlyKg:kg}:item))).catch(error=>setSyncError(firebaseMessage(error)));
    }
    sync();
    // A new month starts while the app stays open.
    const timer=window.setInterval(sync,60*60*1000);
    return()=>window.clearInterval(timer);
  },[customers,role,preview,storeReady,salesWorkspace.quotes]);
  const clientId = customers.some(customer=>customer.id===selectedCustomer)?selectedCustomer:(customers[0]?.id||"");
  const scopedMachines = isStaff?store.machines:store.machines.filter(m=>m.accountId===clientId);
  const scopedTickets = isStaff?store.tickets:store.tickets.filter(t=>t.accountId===clientId);
  const scopedOrders = isStaff?store.orders:store.orders.filter(o=>o.accountId===clientId);
  const scopedTasks = role==="service"?store.tasks.filter(task=>!task.assignedUid||task.assignedUid===profile?.uid||task.assignedTo===profile?.displayName):store.tasks;
  const nav = role==="admin"?adminNav:role==="service"?serviceNav:customerNav;
  const firstName = (profile?.displayName||profile?.email||"משתמש").trim().split(/\s+/)[0];
  const selectedCustomerName = customers.find(customer=>customer.id===clientId)?.name || "—";

  const navigate=(next:View)=>{setView(next);setMobileOpen(false);};
  // A tapped push notification opens the app on its screen: "?view=" on a
  // fresh start, or a message from the service worker when already open.
  useEffect(()=>{
    // Wait for the user's role: until then the menu is not the user's own.
    if(!role)return;
    const allowed=new Set<string>(nav.map(item=>item.id));
    const open=(value:unknown)=>{if(typeof value==="string"&&allowed.has(value)){setView(value as View);setMobileOpen(false);}};
    const params=new URLSearchParams(window.location.search);
    if(params.has("view")){open(params.get("view"));params.delete("view");window.history.replaceState(null,"",`${window.location.pathname}${params.size?`?${params}`:""}`);}
    const onMessage=(event:MessageEvent)=>{if(event.data?.type==="open-view")open(event.data.view);};
    navigator.serviceWorker?.addEventListener("message",onMessage);
    return()=>navigator.serviceWorker?.removeEventListener("message",onMessage);
  },[nav,role]);
  const [push,setPush]=useState<PushState>("unsupported");
  const [pushBusy,setPushBusy]=useState(false);
  useEffect(()=>{
    if(!profile||profile.status!=="active"||preview)return;
    void pushState().then(setPush);
    void refreshPush().catch(()=>undefined);
  },[profile,preview]);
  const togglePush=async()=>{
    if(push==="needs-install"){setToast("באייפון: שיתוף ← \"הוספה למסך הבית\", ואז להפעיל התראות מתוך האפליקציה");return;}
    if(push==="denied"){setToast("ההתראות חסומות. יש לאפשר אותן בהגדרות הדפדפן לאתר הזה");return;}
    setPushBusy(true);
    try{
      if(push==="on"){await disablePush();setToast("ההתראות בנייד הזה כובו");}
      else{await enablePush();setToast("ההתראות הופעלו בנייד הזה");}
    }catch(error){setToast(error instanceof Error&&error.message==="push/denied"?"ההתראות נחסמו. אפשר לאפשר אותן בהגדרות הדפדפן":firebaseMessage(error));}
    finally{setPush(await pushState());setPushBusy(false);}
  };
  const pushLabel=push==="on"?"התראות בנייד פעילות":push==="needs-install"?"התראות: הוספה למסך הבית":push==="denied"?"התראות חסומות בדפדפן":"הפעלת התראות בנייד";
  const logout=async()=>{await disablePush().catch(()=>undefined);await signOutUser();};
  // The bell: customer orders, low orders and access requests for administrators; service calls for all staff.
  const notifications=preview?[]:buildNotifications({role,orders:store.orders,tickets:store.tickets,users,highUsage:customers.flatMap(customer=>{const high=highConsumption(store.orders.filter(order=>order.accountId===customer.id),contractMonthlyKg(customer,customerAgreement(customer,salesWorkspace.quotes)),currentMonthKey());return high?[{accountId:customer.id,...high}]:[];}),customerName:(accountId:string)=>customers.find(customer=>customer.id===accountId)?.name||"לקוח"});
  const openNotification=(item:AppNotification)=>{
    setMobileOpen(false);
    if(item.target.type==="ticket"){setSelectedTicket(item.target.id);setModal("detail");return;}
    if(item.target.type==="access"){setView("access");return;}
    if(item.target.type==="customer"&&item.target.accountId){setSelectedCustomer(item.target.accountId);setCustomerTab("חוזה והצעות");setView("customer");return;}
    if(item.target.accountId){setSelectedCustomer(item.target.accountId);setCustomerTab("הזמנות קפה");setView("customer");}
  };
  const allowWrite=()=>{if(readOnly){setToast("מצב התצוגה הוא לקריאה בלבד");return false;}return true;};
  const openTicket=(machineId="")=>{if(!allowWrite())return;if(!customers.length){setToast("יש להקים לקוח לפני פתיחת קריאת שירות");return;}setSelectedTicket(machineId);setModal("ticket");};
  const openTicketForCustomer=(accountId:string)=>{if(!allowWrite())return;setSelectedCustomer(accountId);setSelectedTicket("");setModal("ticket");};
  const openTaskForCustomer=(accountId:string)=>{if(!allowWrite())return;if(!customers.length){setToast("יש להקים לקוח לפני יצירת משימה");return;}setSelectedCustomer(accountId);setModal("task");};
  const openMachineEditor=(machineId="",accountId=clientId)=>{if(!allowWrite())return;if(!isStaff){setToast("עריכת ציוד זמינה לצוות בלבד");return;}setSelectedCustomer(accountId);setSelectedMachine(machineId);setModal("machine");};
  const openCustomer=(id:string)=>{setSelectedCustomer(id);setCustomerTab(undefined);setView("customer");};
  const enterPreview=(next:PreviewContext)=>{setPreview(next);setSelectedCustomer(next.accountId||"");setView("dashboard");setPreviewOpen(false);setModal(null);};
  const leavePreview=()=>{setPreview(null);setView("dashboard");setModal(null);};
  const loginGoogle=async()=>{setAuthBusy(true);setAuthError("");try{await signInWithGoogle();}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const loginEmail=async(email:string,password:string)=>{setAuthBusy(true);setAuthError("");try{await signInWithEmail(email,password);}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const sendReset=async(email:string)=>{setAuthBusy(true);setAuthError("");try{await resetPassword(email);setToast("קישור לאיפוס סיסמה נשלח");}catch(error){setAuthError(firebaseMessage(error));}finally{setAuthBusy(false);}};
  const saveQuoteInCycle=async(quote:Quote)=>{
    if(!allowWrite())return;
    const previous=salesWorkspace.quotes.find(item=>item.id===quote.id);
    // Always store the edited quote first; approval only adds the customer card on top.
    await saveQuote(quote);
    const justApproved=quote.status==="אושרה"&&previous?.status!=="אושרה";
    const needsInvite=quote.status==="אושרה"&&Boolean(quote.accountId)&&!quote.accessInviteEmail&&Boolean(quote.email?.trim());
    if(quote.status==="אושרה"&&(!quote.accountId||justApproved||needsInvite)){
      const lead=salesWorkspace.leads.find(item=>item.id===quote.leadId);
      const result=await convertQuoteToCustomer(quote,lead,{existingAccountId:existingAccountIdForQuote(quote,salesWorkspace.quotes,lead)});
      setToast(result.inviteStatus==="created"
        ? `העסקה אושרה, כרטיס הלקוח הוקם והגישה מוכנה עבור ${result.inviteEmail}`
        : result.inviteStatus==="already-accepted"
          ? "העסקה אושרה וכרטיס הלקוח הוקם. המשתמש הקיים כבר משויך אליו."
          : "העסקה אושרה וכרטיס הלקוח הוקם. ניתן להוסיף מייל וגישה ללקוח בהמשך.");
      return;
    }
    // A customer working from this quote gets its agreement rebuilt from the update.
    const working=customers.filter(customer=>customer.activeQuoteId===quote.id);
    for(const customer of working){
      const next={...customer,...customerUpdateForActiveQuote(customer,quote,commercialAgreementFromQuote(quote))};
      await saveCustomer(next);
      await addQuoteMachines(next,quote);
      setCustomers(current=>current.map(item=>item.id===next.id?next:item));
    }
    setToast(working.length?`ההצעה נשמרה והנתונים בכרטיס ${working.map(item=>item.name).join(", ")} עודכנו`:"הצעת המחיר נשמרה");
  };
  const saveLeadInCycle=async(lead:Lead)=>{
    if(!allowWrite())return;
    const previous=salesWorkspace.leads.find(item=>item.id===lead.id);
    await saveLead(lead);
    // Marking a lead closed or as a pilot opens (or updates) its customer card.
    // Saving it again retries when an earlier conversion failed and left no card.
    if((lead.status!=="נסגר"&&lead.status!=="פיילוט")||(previous?.status===lead.status&&(lead.convertedAccountId||previous?.convertedAccountId))){setToast("הליד נשמר");return;}
    const leadQuotes=salesWorkspace.quotes.filter(quote=>quote.leadId===lead.id);
    const quote=leadQuotes.find(item=>item.status==="אושרה")||[...leadQuotes].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    try{
      const knownAccountId=lead.convertedAccountId||previous?.convertedAccountId||leadQuotes.find(item=>item.accountId)?.accountId;
      const result=await convertLeadToCustomer({...lead,convertedAccountId:knownAccountId},lead.status,quote);
      setToast(lead.status==="פיילוט"
        ?(result.created?`${lead.company} נוסף ללקוחות כלקוח בפיילוט`:`${lead.company} סומן כלקוח בפיילוט`)
        :(result.created?`${lead.company} נוסף לרשימת הלקוחות`:`${lead.company} עודכן כלקוח קבוע`));
    }catch(error){setSyncError(firebaseMessage(error));}
  };
  const endPilot=async(customer:Customer)=>{
    if(!allowWrite())return;
    await updateCustomer({...customer,pilot:false});
    const lead=salesWorkspace.leads.find(item=>item.status==="פיילוט"&&(item.convertedAccountId===customer.id||item.id===customer.sourceLeadId));
    if(lead){const changedAt=new Date().toISOString();await saveLead({...lead,status:"נסגר",statusChangedAt:changedAt,statusHistory:[...(lead.statusHistory||[]),{from:"פיילוט",to:"נסגר",changedAt}],updatedAt:changedAt});}
    setToast(`הפיילוט הסתיים. ${customer.name} הוא עכשיו לקוח קבוע`);
  };
  const openNewQuoteForCustomer=(customer:Customer)=>{setQuoteToOpen(null);setQuoteCustomer(customer);setQuoteReturnCustomer(customer.id);navigate("quotes");};
  const openCustomerQuote=(quote:Quote)=>{setQuoteCustomer(null);setQuoteToOpen(quote);setQuoteReturnCustomer(clientId);navigate("quotes");};
  const finishCustomerQuote=()=>{setQuoteToOpen(null);setQuoteCustomer(null);if(quoteReturnCustomer){setSelectedCustomer(quoteReturnCustomer);setCustomerTab("חוזה והצעות");setView("customer");setQuoteReturnCustomer("");}};
  const addTicketEvent=(label:string,type:NonNullable<Ticket["events"]>[number]["type"],visibleToCustomer=true)=>({
    id:createId("event"),type,label,createdAt:new Date().toISOString(),createdBy:profile?.displayName||profile?.email||"מערכת",visibleToCustomer,
  });
  const updateTicket=(id:string,status:string)=>{
    if(!allowWrite())return;
    const changedAt=new Date().toISOString();
    setStore(current=>({...current,tickets:current.tickets.map(ticket=>{
      if(ticket.id!==id)return ticket;
      const firstResponseAt=ticket.firstResponseAt||(!["התקבלה"].includes(status)?changedAt:undefined);
      return {...ticket,status,updatedAt:changedAt,firstResponseAt,
        arrivedAt:status==="הגעה ללקוח"?changedAt:ticket.arrivedAt,
        workStartedAt:status==="בטיפול"?changedAt:ticket.workStartedAt,
        events:[...(ticket.events||[]),addTicketEvent(`סטטוס הקריאה עודכן ל־${status}`,"status")],
      };
    })}));
    setToast("סטטוס הקריאה עודכן");
  };
  const assignTicket=(id:string,uid:string)=>{
    if(!allowWrite())return;
    const assignee=users.find(user=>user.uid===uid);
    const changedAt=new Date().toISOString();
    setStore(current=>({...current,tickets:current.tickets.map(ticket=>ticket.id===id?{
      ...ticket,assignedUid:assignee?.uid||"",assignedTo:assignee?.displayName||"טרם הוקצה",updatedAt:changedAt,
      events:[...(ticket.events||[]),addTicketEvent(assignee?`הקריאה הוקצתה ל־${assignee.displayName}`:"הקצאת הקריאה בוטלה","assignment",false)],
    }:ticket)}));
    setToast(assignee?"הקריאה הוקצתה":"הקצאת הקריאה הוסרה");
  };
  const updateMachine=(id:string,status:string)=>{if(!allowWrite())return;setStore(current=>({...current,machines:current.machines.map(machine=>machine.id===id?{...machine,status,updatedAt:new Date().toISOString()}:machine)}));setToast("סטטוס המכונה עודכן");};
  const updateMachineCommercial=(id:string,commercial:string)=>{if(!allowWrite())return;setStore(current=>({...current,machines:current.machines.map(machine=>machine.id===id?{...machine,commercial,updatedAt:new Date().toISOString()}:machine)}));setToast("המודל המסחרי עודכן");};
  const saveMachine=(machine:Machine)=>{if(!allowWrite())return;const customer=customers.find(item=>item.id===machine.accountId);setStore(current=>({
    ...current,
    machines:current.machines.some(item=>item.id===machine.id)?current.machines.map(item=>item.id===machine.id?machine:item):[machine,...current.machines],
    tasks:reconcileFilterReplacementTask(current.tasks,machine,customer?.owner||"מנהל המערכת"),
  }));setModal(null);setToast("פרטי המכונה נשמרו");};
  const updateOrder=(id:string,data:Partial<Order>)=>{if(!allowWrite())return;setStore(current=>({...current,orders:current.orders.map(order=>order.id===id?{...order,...data,updatedAt:new Date().toISOString()}:order)}));setToast(isStaff?"ההזמנה עודכנה":data.status==="בוטל"?"ההזמנה בוטלה":data.status==="אושר"?"ההזמנה אושרה, תודה!":"הבקשה נשלחה לאישור המנהל");};
  const createExtraOrder=(order:Order)=>{if(!allowWrite())return;setStore(current=>({...current,orders:[order,...current.orders]}));setToast("ההזמנה נשלחה. נעדכן אותך כשתאושר.");};
  const updateAdditionalSale=(recordId:string,saleId:string,patch:Partial<ProfitabilitySaleLine>)=>{if(!allowWrite())return;setStore(current=>({...current,profitability:current.profitability.map(record=>record.id===recordId?{...record,sales:record.sales.map(sale=>sale.id===saleId?{...sale,...patch}:sale),updatedAt:new Date().toISOString()}:record)}));setToast("המכירה עודכנה");};
  const saveProfitability=(record:MonthlyProfitability)=>{if(!allowWrite())return;setStore(current=>({...current,profitability:current.profitability.some(item=>item.id===record.id)?current.profitability.map(item=>item.id===record.id?record:item):[record,...current.profitability]}));setToast("נתוני הרווחיות נשמרו");};
  const updateTask=(id:string,status:string)=>{if(!allowWrite())return;const changedAt=new Date().toISOString();setStore(current=>({...current,tasks:updateTaskStatus(current.tasks,id,status,changedAt)}));setToast("המשימה עודכנה");};
  const removeCustomer=async(customer:Customer)=>{
    if(!allowWrite())return;
    const result=await deleteCustomerAccount(customer.id);
    setCustomers(current=>current.filter(item=>item.id!==customer.id));
    setModal(null);setSelectedCustomer("");setView("customers");
    setToast(`כרטיס הלקוח ${customer.name} נמחק${result.unlinkedQuotes?`. ${result.unlinkedQuotes} הצעות מחיר נשארו בהיסטוריה`:""}`);
  };
  const updateCustomer=async(customer:Customer)=>{if(!allowWrite())return;await saveCustomer(customer);setCustomers(current=>current.map(item=>item.id===customer.id?customer:item));setToast("כרטיס הלקוח נשמר");};
  const createCustomer=async(customer:Customer)=>{if(!allowWrite())return;await saveCustomer(customer);const createdAt=new Date().toISOString();setStore(current=>current.tasks.some(task=>task.id===`task-onboarding-${customer.id}`)?current:({...current,tasks:[{id:`task-onboarding-${customer.id}`,accountId:customer.id,title:"השלמת קליטת לקוח חדש",type:"הקמת לקוח",dueDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),priority:"גבוהה",status:"פתוחה",assignedTo:customer.owner||"מנהל המערכת",createdAt,updatedAt:createdAt},...current.tasks]}));setSelectedCustomer(customer.id);setToast("כרטיס הלקוח נוצר");};
  const downloadBackup=()=>{if(!allowWrite())return;const backup=createBusinessBackup(customers,users,salesWorkspace,store);const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`mister-bean-backup-${backup.exportedAt.slice(0,10)}.json`;link.click();URL.revokeObjectURL(link.href);setToast("גיבוי נתוני העסק הורד בהצלחה");};

  if(!authReady) return <LoadingScreen/>;
  if(!profile) return <Login onGoogle={loginGoogle} onEmail={loginEmail} onReset={sendReset} busy={authBusy} error={authError}/>;
  if(profile.status!=="active") return <PendingAccess profile={profile} onLogout={()=>void logout()}/>;
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
          {!preview&&push!=="unsupported"&&<button className={`account-password push-toggle ${push==="on"?"on":""}`} disabled={pushBusy} onClick={()=>void togglePush()}><BellRing size={17}/><span>{pushBusy?"רגע…":pushLabel}</span></button>}
          <button className="logout" onClick={()=>void logout()} aria-label="התנתקות"><LogOut size={17}/><span>התנתקות</span></button>
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
            {isStaff&&!preview&&<NotificationBell uid={profile.uid} notifications={notifications} onOpen={openNotification} onToast={setToast}/>}
            {isStaff&&<button className="top-create" onClick={()=>openTicket()}><Plus size={17}/> קריאה חדשה</button>}
          </div>
        </header>
        <div className="content">
          {view==="dashboard"&&(role==="service"?<ServiceDashboard profile={profile} store={store} customers={customers} go={navigate} onUpdateTicket={updateTicket}/>:role==="admin"?<AdminDashboard store={store} sales={salesWorkspace} customers={customers} go={navigate} openCustomer={openCustomer} greeting={greeting} firstName={firstName}/>:customers.find(c=>c.id===clientId)?<CustomerDashboard customer={customers.find(c=>c.id===clientId)!} store={store} go={navigate} openTicket={openTicket} greeting={greeting}/>:<EmptyCustomerState/>)}
          {view==="leads"&&role==="admin"&&<LeadsWorkspace workspace={salesWorkspace} readOnly={readOnly} canMigrate={profile.role==="admin"&&!preview} onSaveLead={saveLeadInCycle} onSaveQuote={saveQuoteInCycle} onImport={async(next:SalesWorkspace)=>{if(!allowWrite())return;const result=await importSalesWorkspace(next);setToast(`הועברו ${result.importedLeads} לידים ו־${result.importedQuotes} הצעות. במאגר המאוחד: ${result.storedLeads} לידים ו־${result.storedQuotes} הצעות.`);}} onOpenQuotes={()=>navigate("quotes")}/>}
          {view==="quotes"&&role==="admin"&&<QuotesWorkspace workspace={salesWorkspace} readOnly={readOnly} onSaveQuote={saveQuoteInCycle} onDeleteQuote={async(quoteId:string)=>{if(!allowWrite())return;await deleteQuote(quoteId);setToast("גרסת ההצעה נמחקה");}} onConvert={async(quote:Quote,lead?:Lead):Promise<CustomerConversionResult>=>{if(!allowWrite())throw new Error("מצב תצוגה הוא לקריאה בלבד");const result=await convertQuoteToCustomer(quote,lead,{manual:quote.status!=="אושרה",existingAccountId:existingAccountIdForQuote(quote,salesWorkspace.quotes,lead)});setToast(result.inviteStatus==="created"?`כרטיס הלקוח הוקם והגישה מוכנה עבור ${result.inviteEmail}`:result.inviteStatus==="already-accepted"?"חשבון הלקוח הוקם והמשתמש כבר משויך אליו":quote.status==="אושרה"?"כרטיס הלקוח הוקם. ניתן להוסיף מייל וגישה בהמשך.":"כרטיס הלקוח הוקם ידנית");return result;}} onOpenLeads={()=>navigate("leads")} initialQuote={quoteToOpen} initialCustomer={quoteCustomer} customerCount={customers.length} onInitialRequestConsumed={finishCustomerQuote}/>}
          {view==="customers"&&<Customers
            customers={customers}
            canCreateCustomer={role==="admin"}
            store={store}
            openCustomer={openCustomer}
            openTicket={openTicketForCustomer}
            openTask={openTaskForCustomer}
            onNewCustomer={()=>setModal("newCustomer")}
          />}
          {view==="customer"&&(customers.find(c=>c.id===clientId)?<CustomerCard key={`${clientId}-${customerTab||""}`} initialTab={customerTab} customer={customers.find(c=>c.id===clientId)!} store={store} sales={salesWorkspace} canManageCustomer={role==="admin"} openTicket={openTicket} openTask={()=>{if(allowWrite())setModal("task");}} onNewQuote={openNewQuoteForCustomer} onOpenQuote={openCustomerQuote} onOpenTicket={id=>{setSelectedTicket(id);setModal("detail");}} onCloseTicket={id=>{if(!allowWrite())return;setSelectedTicket(id);setModal("close");}} onEdit={()=>{if(role==="admin")setModal("customer");else setToast("עריכת פרטי לקוח זמינה למנהל מערכת");}} onMachineStatus={updateMachine} onMachineCommercial={updateMachineCommercial} onEditMachine={id=>openMachineEditor(id,clientId)} onAddMachine={()=>openMachineEditor("",clientId)} onTicketStatus={updateTicket} onOrderChange={updateOrder} onSaleChange={updateAdditionalSale} onTaskStatus={updateTask} onSaveCustomer={updateCustomer} onSaveProfitability={saveProfitability} customers={customers} readOnly={readOnly} actor={profile.email} onToast={setToast} onEndPilot={endPilot}/>:<EmptyCustomerState/>)}
          {view==="tickets"&&<Tickets tickets={scopedTickets} machines={store.machines} isStaff={isStaff} staffUsers={users.filter(user=>user.status==="active"&&(user.role==="service"||user.role==="admin"))} onAssign={assignTicket} onUpdate={updateTicket} onOpen={id=>{setSelectedTicket(id);setModal("detail");}} onClose={id=>{if(!allowWrite())return;setSelectedTicket(id);setModal("close");}} openTicket={openTicket}/>}
          {view==="machines"&&
            <Machines machines={scopedMachines} isStaff={isStaff} openTicket={openTicket} onStatus={updateMachine} onCommercial={updateMachineCommercial} onEdit={id=>openMachineEditor(id)} onAdd={()=>openMachineEditor("",clientId)}/>
          }
          {view==="orders"&&(isStaff?<OrdersBoard orders={scopedOrders} profitability={store.profitability} activities={store.activities} agreementFor={id=>{const customer=customers.find(item=>item.id===id);return customer?customerAgreement(customer,salesWorkspace.quotes):undefined;}} onOrderChange={updateOrder} onSaleChange={updateAdditionalSale}/>:<CustomerOrders orders={scopedOrders} onChange={updateOrder} accountId={clientId} onCreateExtra={createExtraOrder}/>)}
          {view==="tasks"&&<Tasks tasks={scopedTasks} onCreate={()=>{if(allowWrite())setModal("task");}} onStatus={updateTask}/>}
          {view==="tastings"&&role==="admin"&&<TastingWorkspace customers={customers} readOnly={readOnly} actor={profile.email} onToast={setToast}/>}
          {view==="reports"&&role==="admin"&&<Reports store={store} customers={customers} users={users}/>}
          {view==="access"&&profile.role==="admin"&&<AccessManagement currentUser={profile} customers={customers} users={users} readOnly={readOnly} onBackup={downloadBackup} onSave={async(user,role,accountIds,status)=>{if(!allowWrite())throw new Error("מצב התצוגה הוא לקריאה בלבד");try{await updateUserAccess(user.uid,role,accountIds,status);setSyncError("");setToast("ההרשאות עודכנו בהצלחה");}catch(error){setSyncError(firebaseMessage(error));throw error;}}} onRevoke={async user=>{if(!allowWrite())throw new Error("מצב התצוגה הוא לקריאה בלבד");try{await revokeUserAccess(user);setSyncError("");setToast("הגישה הוסרה והמשתמש נותק מנתוני הלקוחות");}catch(error){setSyncError(firebaseMessage(error));throw error;}}} onSetPassword={async(email,password)=>{if(!allowWrite())throw new Error("מצב התצוגה הוא לקריאה בלבד");const result=await adminSetUserPassword(email,password);setToast(result.created?"המשתמש נוצר. יש לאשר לו הרשאות ברשימה":"הסיסמה נשמרה. אפשר להתחבר עם מייל וסיסמה");}} onPreview={next=>enterPreview(next)}/>}
          {view==="contract"&&(customers.find(c=>c.id===clientId)?<Contract customer={customers.find(c=>c.id===clientId)!} machines={scopedMachines}/>:<EmptyCustomerState/>)}
        </div>
      </main>
      <div className="mobile-nav">{nav.slice(0,5).map(n=>{const Icon=n.icon;return <button key={n.id} className={view===n.id?"active":""} onClick={()=>navigate(n.id)}><Icon size={19}/>{n.label}</button>})}</div>
      {modal==="ticket"&&<TicketModal customers={customers} accountId={clientId} allowAccountChange={isStaff} preselectedMachine={selectedTicket} machines={store.machines} onClose={()=>setModal(null)} onSave={ticket=>{setStore(s=>({...s,tickets:[ticket,...s.tickets]}));setModal(null);setView("tickets");setToast(`הקריאה ${ticket.id} נפתחה בהצלחה`);}}/>}
      {modal==="task"&&<TaskModal customers={customers} staffUsers={users.filter(user=>user.status==="active"&&(user.role==="service"||user.role==="admin"))} accountId={clientId} onClose={()=>setModal(null)} onSave={task=>{setStore(s=>({...s,tasks:[task,...s.tasks]}));setModal(null);setToast("המשימה נוצרה בהצלחה");}}/>}
      {modal==="close"&&<CloseModal onClose={()=>setModal(null)} onSave={(reason,summary,parts,confirmedBy)=>{const changedAt=new Date().toISOString();setStore(s=>({...s,tickets:s.tickets.map(t=>t.id===selectedTicket?{...t,status:"נסגרה",closedAt:changedAt,updatedAt:changedAt,closeReason:reason,workSummary:summary,partsUsed:parts,customerConfirmedBy:confirmedBy||undefined,customerConfirmedAt:confirmedBy?changedAt:undefined,events:[...(t.events||[]),addTicketEvent(`הקריאה נסגרה: ${reason}`,"closed")]}:t)}));setModal(null);setToast("הקריאה נסגרה");}}/>}
      {modal==="detail"&&<TicketDetailModal
        ticket={store.tickets.find(t=>t.id===selectedTicket)!}
        machine={store.machines.find(m=>m.id===store.tickets.find(t=>t.id===selectedTicket)?.machineId)}
        canEdit={!isStaff&&!closed(store.tickets.find(t=>t.id===selectedTicket)?.status||"")}
        onEdit={()=>setModal("editTicket")}
        onClose={()=>setModal(null)}
      />}
      {modal==="editTicket"&&store.tickets.find(t=>t.id===selectedTicket)&&<TicketEditModal ticket={store.tickets.find(t=>t.id===selectedTicket)!} onClose={()=>setModal("detail")} onSave={(description,contact,phone,resolved)=>{const changedAt=new Date().toISOString();setStore(current=>({...current,tickets:current.tickets.map(ticket=>ticket.id===selectedTicket?{...ticket,description,contact,phone,status:resolved?"בוטלה על ידי הלקוח":ticket.status,updatedAt:changedAt,closedAt:resolved?changedAt:ticket.closedAt,closeReason:resolved?"הלקוח עדכן שהסתדר":ticket.closeReason,events:[...(ticket.events||[]),addTicketEvent(resolved?"הלקוח עדכן שהסתדר וביטל את הקריאה":"הלקוח עדכן את פרטי הקריאה",resolved?"closed":"note")]}:ticket)}));setModal("detail");setToast(resolved?"הקריאה בוטלה":"פרטי הקריאה עודכנו");}}/>}
      {modal==="password"&&<PasswordSetupModal email={profile.email} onClose={()=>setModal(null)} onSave={async password=>{await linkPasswordToCurrentUser(password);setModal(null);setToast("הכניסה עם סיסמה הופעלה בהצלחה");}}/>}
      {modal==="customer"&&customers.find(customer=>customer.id===clientId)&&<CustomerEditorModal customer={customers.find(customer=>customer.id===clientId)!} onClose={()=>setModal(null)} onSave={async customer=>{await updateCustomer(customer);setModal(null);}} onDelete={readOnly?undefined:removeCustomer} errorMessage={firebaseMessage}/>}
      {modal==="newCustomer"&&<NewCustomerModal onClose={()=>setModal(null)} onSave={async customer=>{await createCustomer(customer);setModal(null);setView("customer");}}/>}
      {modal==="machine"&&<MachineEditorModal machine={store.machines.find(item=>item.id===selectedMachine)} accountId={clientId} customers={customers} onClose={()=>setModal(null)} onSave={saveMachine}/>}
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
      <button className="google-login" type="button" disabled={busy} onClick={()=>void onGoogle()}><b>G</b> {busy?"מתחבר…":"כניסה באמצעות Google"}</button>
    </form>
  </div></div>;
}

function LoadingScreen(){return <div className="loading-screen" dir="rtl"><BrandIcon large/><h1>Mister Bean</h1><p>מחברים את סביבת העבודה המאובטחת…</p><i/></div>}

function PendingAccess({profile,onLogout}:{profile:UserProfile;onLogout:()=>void}){const revoked=profile.status==="revoked";return <div className="pending-screen" dir="rtl"><div className="pending-card"><span><LockKeyhole size={26}/></span><small>{revoked?"הגישה לחשבון הוסרה":"החשבון נוצר בהצלחה"}</small><h1>{revoked?"החשבון אינו פעיל":"הגישה ממתינה לאישור"}</h1><p>{revoked?<>הגישה של <strong>{profile.email}</strong> הוסרה על ידי מנהל המערכת. ניתן לפנות למנהל לצורך חידוש הרשאה.</>:<>החשבון של <strong>{profile.email}</strong> מחובר. מנהל המערכת צריך לשייך אותו ללקוח ולהגדיר הרשאה לפני הצגת מידע.</>}</p><button onClick={onLogout}><LogOut size={17}/> יציאה</button></div></div>}

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

function AccessManagement({currentUser,customers,users,readOnly,onSave,onRevoke,onSetPassword,onPreview,onBackup}:{currentUser:UserProfile;customers:Customer[];users:UserProfile[];readOnly:boolean;onSave:(user:UserProfile,role:Role,accountIds:string[],status:UserProfile["status"])=>Promise<void>;onRevoke:(user:UserProfile)=>Promise<void>;onSetPassword:(email:string,password:string)=>Promise<void>;onPreview:(preview:PreviewContext)=>void;onBackup:()=>void}){
  const [passwordEmail,setPasswordEmail]=useState<string|null>(null);
  return <>{passwordEmail!==null&&<AdminPasswordModal initialEmail={passwordEmail} users={users} onClose={()=>setPasswordEmail(null)} onSave={async(email,password)=>{await onSetPassword(email,password);setPasswordEmail(null);}}/>}<SectionTitle title="ניהול והרשאות" action={<button disabled={readOnly} onClick={onBackup}><Download size={16}/> הורדת גיבוי נתונים</button>}/><div className="access-summary"><div><UserCog size={20}/><span><strong>{users.filter(user=>user.status!=="revoked").length}</strong> משתמשים פעילים וממתינים</span></div><div><LockKeyhole size={20}/><span><strong>{users.filter(user=>user.status==="pending").length}</strong> ממתינים לאישור</span></div><div><ShieldCheck size={20}/><span><strong>{users.filter(isTrustedAdminProfile).length}</strong> מנהלים מאושרים</span></div></div><section className="panel access-panel"><div className="access-head"><div><h3>משתמשי המערכת</h3><p>הרשאת מנהל מחייבת אישור מפורש של בעל המערכת.</p></div>{readOnly?<Badge>קריאה בלבד</Badge>:<button onClick={()=>setPasswordEmail("")}><KeyRound size={15}/> משתמש עם סיסמה</button>}</div><div className="access-list">{users.length?users.map(user=><UserAccessRow currentUser={currentUser} customers={customers} key={user.uid} user={user} readOnly={readOnly} onSave={onSave} onRevoke={onRevoke} onPassword={()=>setPasswordEmail(user.email)} onPreview={onPreview}/>):<div className="empty-access"><UserCog size={28}/><strong>אין משתמשים רשומים</strong></div>}</div></section><AuditLogPanel customers={customers}/></>
}

function UserAccessRow({currentUser,customers,user,readOnly,onSave,onRevoke,onPassword,onPreview}:{currentUser:UserProfile;customers:Customer[];user:UserProfile;readOnly:boolean;onSave:(user:UserProfile,role:Role,accountIds:string[],status:UserProfile["status"])=>Promise<void>;onRevoke:(user:UserProfile)=>Promise<void>;onPassword:()=>void;onPreview:(preview:PreviewContext)=>void}){
  const [editing,setEditing]=useState(false);
  const [role,setRole]=useState<Role>(user.role);
  const [accountIds,setAccountIds]=useState<string[]>(user.accountIds);
  const [status,setStatus]=useState<UserProfile["status"]>(user.status);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState("");
  const [adminConfirmed,setAdminConfirmed]=useState(false);
  const trustedAdmin=isTrustedAdminProfile(user);
  const canGrantAdmin=isBootstrapAdminEmail(currentUser.email);
  const canRevoke=!readOnly&&user.uid!==currentUser.uid&&!isBootstrapAdminEmail(user.email)&&user.status!=="revoked";
  const toggleAccount=(accountId:string)=>setAccountIds(current=>current.includes(accountId)?current.filter(id=>id!==accountId):[...current,accountId]);
  const save=async()=>{setSaving(true);setSaveError("");try{await onSave(user,role,accountIds,status);setEditing(false);setAdminConfirmed(false);}catch(error){setSaveError(firebaseMessage(error));}finally{setSaving(false);}};
  const revoke=async()=>{if(!window.confirm(`להסיר את הגישה של ${user.email}? המשתמש לא יוכל לראות נתוני לקוחות.`))return;setSaving(true);setSaveError("");try{await onRevoke(user);setEditing(false);}catch(error){setSaveError(firebaseMessage(error));}finally{setSaving(false);}};
  const statusLabel=user.status==="active"?"פעיל":user.status==="revoked"?"גישה הוסרה":"ממתין לאישור";
  return <article className="access-user"><div className="access-user-main"><span className="customer-avatar">{(user.displayName||user.email).slice(0,2)}</span><div><strong>{user.displayName||"משתמש"}</strong><small>{user.email}</small></div><Badge>{statusLabel}</Badge><span className="role-label">{user.role==="admin"&&!trustedAdmin?"מנהל לא מאושר":roleNames[user.role]}</span><div className="access-actions"><button disabled={user.status!=="active"||!trustedAdmin&&user.role==="admin"} onClick={()=>onPreview({role:user.role,accountId:user.accountIds[0]||customers[0]?.id||""})}><Eye size={15}/> תצוגה</button><button disabled={readOnly} onClick={()=>{setEditing(value=>!value);setSaveError("");}}><UserCog size={15}/> הרשאות</button>{!readOnly&&(!isTrustedAdminProfile(user)||canGrantAdmin)&&<button onClick={onPassword}><KeyRound size={15}/> סיסמה</button>}{canRevoke&&<button className="access-revoke" disabled={saving} onClick={()=>void revoke()}><Trash2 size={15}/> הסרת גישה</button>}</div></div>{editing&&<div className="access-editor"><label><span>תפקיד</span><select value={role} onChange={event=>{setRole(event.target.value as Role);setAdminConfirmed(false);setSaveError("");}}><option value="customer">לקוח רגיל</option><option value="multi">לקוח מרובה סניפים</option><option value="service">נציג שירות</option>{canGrantAdmin&&<option value="admin">מנהל מערכת</option>}</select></label><label><span>מצב החשבון</span><select value={status} onChange={event=>{setStatus(event.target.value as UserProfile["status"]);setSaveError("");}}><option value="pending">ממתין לאישור</option><option value="active">פעיל</option>{user.status==="revoked"&&<option value="revoked">גישה הוסרה</option>}</select></label>{(role==="customer"||role==="multi")&&<fieldset><legend>חשבונות לקוח</legend><div>{customers.map(customer=><label key={customer.id}><input type="checkbox" checked={accountIds.includes(customer.id)} onChange={()=>{toggleAccount(customer.id);setSaveError("");}}/><span>{customer.name}</span></label>)}</div></fieldset>}{role==="admin"&&<label className="admin-confirm"><input type="checkbox" checked={adminConfirmed} onChange={event=>setAdminConfirmed(event.target.checked)}/><span>אני מאשר במפורש לתת למשתמש גישת מנהל מלאה</span></label>}{saveError&&<div className="access-save-error"><LockKeyhole size={15}/><span>{saveError}</span></div>}<footer><button onClick={()=>setEditing(false)}>ביטול</button><button className="primary" disabled={saving||(role==="admin"&&!adminConfirmed)||(status==="active"&&(role==="customer"||role==="multi")&&!accountIds.length)} onClick={()=>void save()}>{saving?"שומר…":"שמירת הרשאות"}</button></footer></div>}</article>
}

const auditActionLabels:Record<AuditEntry["action"],string>={"password-set":"הוגדרה סיסמה","password-user-created":"נוצר משתמש עם סיסמה","user-created":"נרשם משתמש חדש","user-deleted":"משתמש נמחק","access-changed":"שינוי הרשאות"};

function auditAccessText(access:AuditEntry["after"],customers:Customer[]){
  if(!access)return "—";
  const status=access.status==="active"?"פעיל":access.status==="revoked"?"גישה הוסרה":"ממתין";
  const accounts=access.accountIds.map(id=>customers.find(customer=>customer.id===id)?.name||id).join(", ");
  return `${roleNames[access.role as Role]||access.role} · ${status}${accounts?` · ${accounts}`:""}`;
}

function AuditLogPanel({customers}:{customers:Customer[]}){
  const [entries,setEntries]=useState<AuditEntry[]|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const load=async()=>{setBusy(true);setError("");try{setEntries(await loadAuditLog());}catch(nextError){setError(firebaseMessage(nextError));}finally{setBusy(false);}};
  return <section className="panel access-panel audit-panel"><div className="access-head"><div><h3>יומן פעולות</h3><p>שינויי הרשאות וסיסמאות, מי ביצע ומתי.</p></div><button disabled={busy} onClick={()=>void load()}><History size={15}/> {busy?"טוען…":entries?"רענון":"הצגת היומן"}</button></div>{error&&<div className="access-save-error"><LockKeyhole size={15}/><span>{error}</span></div>}{entries&&(entries.length?<ul className="audit-list">{entries.map(entry=><li key={entry.id}><div><strong>{auditActionLabels[entry.action]||entry.action}</strong><span dir="ltr">{entry.targetEmail}</span></div>{entry.action==="access-changed"&&<small>{auditAccessText(entry.before,customers)} ← {auditAccessText(entry.after,customers)}</small>}<small>{new Date(entry.at).toLocaleString("he-IL")}{entry.actorEmail?` · ${entry.actorEmail}`:""}</small></li>)}</ul>:<div className="empty-access"><History size={28}/><strong>אין עדיין פעולות ביומן</strong></div>)}</section>;
}

function AdminPasswordModal({initialEmail,users,onClose,onSave}:{initialEmail:string;users:UserProfile[];onClose:()=>void;onSave:(email:string,password:string)=>Promise<void>}) {
  const [email,setEmail]=useState(initialEmail);
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const existing=users.some(user=>user.email.toLowerCase()===email.trim().toLowerCase());
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const securityError=passwordSecurityError(password);
    if(securityError){setError(securityError);return;}
    if(password!==confirmation){setError("הסיסמאות אינן זהות.");return;}
    setBusy(true);setError("");
    try{await onSave(email.trim(),password);}catch(nextError){setError(firebaseMessage(nextError));setBusy(false);}
  };
  return <Modal title="כניסה עם מייל וסיסמה" onClose={onClose}><form className="modal-form password-setup" onSubmit={submit}>
    <div className="password-setup-note"><KeyRound size={20}/><div><strong>{existing?"סיסמה למשתמש קיים":"משתמש חדש"}</strong><p>{existing?"המשתמש יוכל להתחבר עם המייל והסיסמה. אם היה מחובר עם Google, גם הכניסה הזו תמשיך לעבוד.":"החשבון ייווצר כממתין לאישור. אחרי השמירה יש להגדיר לו הרשאות ברשימת המשתמשים."}</p></div></div>
    <label><span>כתובת המייל</span><input type="email" dir="ltr" value={email} onChange={event=>setEmail(event.target.value)} list="access-user-emails" required readOnly={Boolean(initialEmail)} autoComplete="off"/><datalist id="access-user-emails">{users.map(user=><option key={user.uid} value={user.email}/>)}</datalist></label>
    <label><span>סיסמה</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={12} required autoComplete="new-password" placeholder="12 תווים, כולל אות ומספר"/></label>
    <label><span>אימות הסיסמה</span><input type="password" value={confirmation} onChange={event=>setConfirmation(event.target.value)} minLength={12} required autoComplete="new-password" placeholder="הקלדה חוזרת"/></label>
    {error&&<div className="auth-error">{error}</div>}
    <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={busy}>{busy?"שומר…":"שמירת סיסמה"}</button></footer>
  </form></Modal>;
}

function firebaseMessage(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes("auth/invalid-credential"))return "פרטי הכניסה אינם נכונים.";
  if(message.includes("auth/popup-closed-by-user"))return "חלון הכניסה נסגר לפני השלמת התהליך.";
  if(message.includes("auth/popup-blocked"))return "הדפדפן חסם את חלון הכניסה. יש לאפשר חלונות קופצים ולנסות שוב.";
  if(message.includes("auth/cancelled-popup-request"))return "בקשת הכניסה הקודמת בוטלה. אפשר לנסות שוב.";
  if(message.includes("auth/network-request-failed"))return "החיבור לאינטרנט נקטע בזמן הכניסה. יש לבדוק קליטה ולנסות שוב.";
  if(message.includes("auth/web-storage-unsupported"))return "הדפדפן חוסם שמירת התחברות. יש לפתוח את המערכת ב־Safari או Chrome רגיל ולא מתוך דפדפן פנימי.";
  if(message.includes("auth/operation-not-supported-in-this-environment"))return "הדפדפן הנוכחי אינו תומך בכניסה מאובטחת. יש לפתוח את הקישור ישירות ב־Safari או Chrome.";
  if(message.includes("auth/unauthorized-domain"))return "כתובת האתר עדיין לא אושרה להתחברות ב־Firebase.";
  if(message.includes("auth/weak-password"))return "יש לבחור סיסמה חזקה יותר, באורך 12 תווים לפחות וכוללת אות ומספר.";
  if(message.includes("auth/provider-already-linked"))return "כניסה עם סיסמה כבר מוגדרת לחשבון הזה.";
  if(message.includes("auth/credential-already-in-use")||message.includes("auth/email-already-in-use"))return "כתובת המייל כבר משויכת לחשבון אחר. יש לפנות למנהל המערכת.";
  if(message.includes("auth/requires-recent-login"))return "מטעמי אבטחה יש להתנתק, להתחבר שוב עם Google ולנסות שנית.";
  if(message.includes("auth/missing-email"))return "לא נמצאה כתובת מייל בחשבון המחובר.";
  if(message.includes("auth/operation-not-allowed"))return "שיטת הכניסה עדיין לא הופעלה ב־Firebase.";
  if(message.includes("access/cannot-revoke-self"))return "אי אפשר להסיר או להחליש את ההרשאה של המשתמש המחובר.";
  if(message.includes("access/cannot-revoke-owner"))return "אי אפשר להסיר את חשבון הבעלים של המערכת.";
  if(message.includes("access/customer-account-required"))return "לקוח פעיל חייב להיות משויך לכרטיס לקוח אחד לפחות.";
  if(message.includes("access/admin-owner-approval-required"))return "רק בעל המערכת יכול לאשר מנהל נוסף.";
  if(message.includes("access/invalid-email"))return "כתובת המייל אינה תקינה.";
  if(message.includes("access/admin-required"))return "רק מנהל מאושר יכול להגדיר סיסמה למשתמשים.";
  if(message.startsWith("functions/"))return "שירות הסיסמאות עדיין לא הופעל בשרת. יש לפנות לתמיכה.";
  if(message.includes("access/email-assigned-to-another-customer"))return "כתובת המייל כבר משויכת לכרטיס לקוח אחר.";
  if(message.startsWith("platform/partial-save:"))return `חלק מהשינויים לא נשמרו (${message.slice("platform/partial-save:".length)}). שאר השינויים נשמרו. רעננו את הדף ונסו שוב; אם זה חוזר, פנו לתמיכה.`;
  if(message.includes("permission-denied")||message.includes("Missing or insufficient permissions"))return "אין הרשאה לשמור את השינוי. רעננו את הדף ונסו שוב; אם זה חוזר, פנו לתמיכה.";
  return message.replace("Firebase: ","");
}

function SectionTitle({title,sub,action}:{title:string;sub?:string;action?:React.ReactNode}) {return <div className="section-title"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action}</div>}
function Kpi({label,value,meta,tone="default",onClick}:{label:string;value:string|number;meta:string;tone?:string;onClick?:()=>void}) {return <button className={`kpi ${tone}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{meta}</small></button>}

function AdminDashboard({store,sales,customers,go,openCustomer,greeting,firstName}:{store:Store;sales:SalesWorkspace;customers:Customer[];go:(v:View)=>void;openCustomer:(id:string)=>void;greeting:string;firstName:string}) {
  const customerName=useCustomerName();
  const open=store.tickets.filter(t=>!closed(t.status)), urgent=open.filter(t=>t.urgency==="דחופה");
  const pending=store.orders.filter(o=>o.status==="ממתין לאישור");
  const risks=customers.filter(c=>riskReasons(c,store).length>0);
  const slaTickets=store.tickets.filter(ticket=>ticket.resolutionDueAt);
  const withinSla=slaTickets.filter(ticket=>closed(ticket.status)?Boolean(ticket.closedAt&&new Date(ticket.closedAt)<=new Date(ticket.resolutionDueAt!)):!slaBreached(ticket)).length;
  const slaScore=slaTickets.length?Math.round(withinSla/slaTickets.length*100):100;
  const today=new Date().toISOString().slice(0,10);
  const dueTasks=store.tasks.filter(task=>!["בוצעה","בוטלה"].includes(task.status)&&task.dueDate<=today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||Number(b.priority==="גבוהה")-Number(a.priority==="גבוהה"));
  const maintenanceDue=store.machines.filter(machine=>(machine.nextService&&machine.nextService.slice(0,10)<=today)||(machine.filterReplacementDue&&machine.filterReplacementDue.slice(0,10)<=today));
  return <><section className="ops-hero"><CoffeeBotanical className="hero-coffee-branch"/><div className="ops-copy"><span className="hero-kicker"><Activity size={15}/> תמונת מצב</span><h2>{greeting}, {firstName}</h2><div className="hero-actions"><button className="hero-primary" onClick={()=>go("tickets")}><Headphones size={17}/> קריאות שירות</button><button onClick={()=>go("tasks")}><CalendarDays size={17}/> משימות</button></div></div><div className="service-score"><div className="score-ring" style={{"--score":`${slaScore}%`} as React.CSSProperties}><div><strong>{slaScore}</strong><span>עמידה ב־SLA</span></div></div><div className="score-copy"><span>{withinSla} מתוך {slaTickets.length||0} קריאות</span><small>מחושב מנתוני השירות בפועל</small></div></div></section>
    <SectionTitle title="סקירה"/>
    <div className="kpi-grid">
      <Kpi label="לידים פעילים" value={sales.leads.filter(lead=>!["נסגר","לא רלוונטי"].includes(lead.status)).length} meta="בתהליך מכירה" tone="purple" onClick={()=>go("leads")}/>
      <Kpi label="הצעות פתוחות" value={sales.quotes.filter(quote=>!["אושרה","נדחתה"].includes(quote.status)&&!isSupersededQuote(quote,sales.quotes)).length} meta="טיוטות והצעות שנשלחו" tone="orange" onClick={()=>go("quotes")}/>
      <Kpi label="לקוחות פעילים" value={customers.filter(c=>c.status==="פעיל").length} meta={`מתוך ${customers.length} לקוחות`}/>
      <Kpi label="קריאות פתוחות" value={open.length} meta={`${open.filter(t=>t.status==="ממתין לטכנאי").length} ממתינות לטכנאי`} tone="blue" onClick={()=>go("tickets")}/>
      <Kpi label="קריאות דחופות" value={urgent.length} meta="דורשות טיפול עכשיו" tone="red" onClick={()=>go("tickets")}/>
      <Kpi label="הזמנות לאישור" value={pending.length} meta={`לחודש ${monthLabel()}`} tone="orange" onClick={()=>go("orders")}/>
      <Kpi label="מכונות לטיפול" value={new Set([...store.machines.filter(m=>m.status!=="פעילה"),...maintenanceDue].map(machine=>machine.id)).size} meta={`${maintenanceDue.length} מועדי תחזוקה הגיעו`} tone="purple" onClick={()=>go("machines")}/>
      <Kpi label="לקוחות בסיכון" value={risks.length} meta="נדרש מעקב יזום" tone="red" onClick={()=>go("customers")}/>
    </div>
    <div className="dashboard-grid">
      <section className="panel wide"><div className="panel-head"><div><h3>לטיפול היום</h3><p>משימות וקריאות לפי סדר עדיפות</p></div><button className="text-btn" onClick={()=>go("tasks")}>לכל המשימות ←</button></div>
        <div className="work-list">{dueTasks.length?dueTasks.slice(0,5).map(t=><div className="work-row" key={t.id}><span className={`priority-dot ${t.priority==="גבוהה"?"high":""}`}></span><div><strong>{t.title}</strong><small>{customerName(t.accountId)} · {t.assignedTo}</small></div><Badge>{t.status}</Badge><time>{formatDate(t.dueDate)}</time></div>):<div className="inline-empty">אין משימות שהגיע מועדן.</div>}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>קריאות דחופות</h3><p>לפי חריגה מ־SLA</p></div><button className="text-btn" onClick={()=>go("tickets")}>הצג הכל</button></div>
        {urgent.map(t=><button className="alert-card" key={t.id} onClick={()=>go("tickets")}><div><strong>{t.type}</strong><span>{customerName(t.accountId)} · {t.site}</span></div><div><Badge>{t.status}</Badge><small>{t.id}</small></div></button>)}
      </section>
      <section className="panel"><div className="panel-head"><div><h3>לקוחות בסיכון</h3><p>הסיבות הבולטות</p></div></div>
        {risks.slice(0,4).map(c=><button className="risk-row" key={c.id} onClick={()=>openCustomer(c.id)}><span className="customer-avatar">{c.name.slice(0,2)}</span><div><strong>{c.name}</strong><small>{riskReasons(c,store)[0]}</small></div><span>←</span></button>)}
      </section>
    </div></>;
}

function ServiceDashboard({profile,store,customers,go,onUpdateTicket}:{profile:UserProfile;store:Store;customers:Customer[];go:(view:View)=>void;onUpdateTicket:(id:string,status:string)=>void}) {
  const assigned=store.tickets.filter(ticket=>!closed(ticket.status)&&(ticket.assignedUid===profile.uid||ticket.assignedTo===profile.displayName));
  const unassigned=store.tickets.filter(ticket=>!closed(ticket.status)&&!ticket.assignedUid);
  const tasks=store.tasks.filter(task=>task.status!=="בוצעה"&&(task.assignedUid===profile.uid||task.assignedTo===profile.displayName));
  const customerName=(id:string)=>customers.find(customer=>customer.id===id)?.name||"לקוח";
  const ordered=[...assigned].sort((left,right)=>Number(slaBreached(right))-Number(slaBreached(left))||left.resolutionDueAt?.localeCompare(right.resolutionDueAt||"")||0);
  return <div className="service-cockpit"><section className="service-cockpit-hero"><div><span>מרחב עבודה אישי</span><h2>{greetingForHour(new Date().getHours())}, {profile.displayName.split(" ")[0]}</h2><p>{assigned.length?`${assigned.length} קריאות פעילות משויכות אליך`:"אין כרגע קריאות פעילות משויכות אליך"}</p></div><button onClick={()=>go("tickets")}><Headphones size={18}/> כל הקריאות</button></section><div className="kpi-grid"><Kpi label="הקריאות שלי" value={assigned.length} meta="פתוחות כרגע" tone="blue"/><Kpi label="חריגות SLA" value={assigned.filter(slaBreached).length} meta="דורשות קדימות" tone="red"/><Kpi label="משימות שלי" value={tasks.length} meta="פתוחות ובטיפול" tone="orange"/><Kpi label="ממתינות להקצאה" value={unassigned.length} meta="במוקד השירות"/></div><SectionTitle title="סדר היום שלי" sub="קריאות לפי דחיפות ויעד פתרון"/>{ordered.length?<div className="technician-ticket-list">{ordered.map(ticket=><article className={slaBreached(ticket)?"technician-ticket overdue":"technician-ticket"} key={ticket.id}><header><div><Badge>{ticket.urgency}</Badge>{slaBreached(ticket)&&<Badge>חריגת SLA</Badge>}</div><strong>{ticket.id}</strong></header><h3>{ticket.type}</h3><p>{customerName(ticket.accountId)} · {ticket.site}</p><dl><div><dt>סטטוס</dt><dd>{ticket.status}</dd></div><div><dt>יעד פתרון</dt><dd>{formatDateTime(ticket.resolutionDueAt||"")}</dd></div><div><dt>איש קשר</dt><dd>{ticket.contact} · {ticket.phone}</dd></div></dl><footer><button onClick={()=>go("tickets")}>פרטי הקריאה</button>{!closed(ticket.status)&&<button className="primary" onClick={()=>onUpdateTicket(ticket.id,nextTechnicianStatus(ticket.status))}>{ticket.status==="בדרך"?"הגעתי ללקוח":ticket.status==="הגעה ללקוח"?"התחלת טיפול":ticket.status==="בטיפול"?"עדכון טיפול":"יציאה לדרך"}</button>}</footer></article>)}</div>:<section className="panel inline-empty">אין קריאות משויכות כרגע. קריאות חדשות יופיעו כאן לאחר הקצאה.</section>}</div>;
}

function CustomerDashboard({customer,store,go,openTicket,greeting}:{customer:Customer;store:Store;go:(v:View)=>void;openTicket:(m?:string)=>void;greeting:string}) {
  const ms=store.machines.filter(m=>m.accountId===customer.id), ts=store.tickets.filter(t=>t.accountId===customer.id&&!closed(t.status));
  const order=latestCustomerOrder(store.orders,customer.id);
  const next=[...ms].filter(machine=>machine.nextService).sort((a,b)=>a.nextService.localeCompare(b.nextService))[0];
  const contactFirstName=customer.contactName.trim().split(" ")[0]||"";
  return <><div className="customer-hello"><CoffeeBotanical className="customer-coffee-branch"/><div><span className="eyebrow">{greeting}{contactFirstName?`, ${contactFirstName}`:""}</span><h2>{customer.name}</h2></div><Badge>{ts.some(t=>t.urgency==="דחופה")?"יש קריאה דחופה פתוחה":"הכל תקין"}</Badge></div>
    {order?.status==="ממתין לעדכון לקוח"&&<div className="banner"><div><strong>הזמנת הקפה לחודש הבא ממתינה לעדכון</strong><span>אפשר לעדכן את הכמות והתערובת לפני סגירת ההזמנות.</span></div><button onClick={()=>go("orders")}>לעדכון ההזמנה</button></div>}
    <div className="kpi-grid customer-kpis"><Kpi label="מכונות פעילות" value={ms.filter(m=>m.status==="פעילה").length} meta={`מתוך ${ms.length} מכונות`}/><Kpi label="קריאות פתוחות" value={ts.length} meta={ts.length?"אנחנו מטפלים בזה":"אין קריאות פעילות"} tone={ts.length?"blue":"default"}/><Kpi label="הזמנה לחודש הבא" value={order?`${order.requestedKg} ק״ג`:"טרם הוגדרה"} meta={order?.blend||"הצוות ישלים את ההקמה"}/><Kpi label="הטיפול הבא" value={next?formatDate(next.nextService):"—"} meta={next?.model||"אין טיפול מתוכנן"}/></div>
    <SectionTitle title="פעולות מהירות"/><div className="quick-actions"><button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאת שירות</button><button onClick={()=>go("orders")}>♨ עדכון הזמנת קפה</button><button onClick={()=>go("machines")}>▣ המכונות שלי</button><button onClick={()=>go("orders")}>☕ נגמר לי הקפה</button></div>
    {ts.length>0&&<section className="panel"><div className="panel-head"><div><h3>קריאות פתוחות</h3><p>עדכונים אחרונים מצוות השירות</p></div><button className="text-btn" onClick={()=>go("tickets")}>לכל הקריאות ←</button></div>{ts.slice(0,2).map(t=><div className="ticket-strip" key={t.id}><span className="ticket-icon">◉</span><div><strong>{t.type}</strong><small>{t.id} · נפתחה ב־{formatDate(t.openedAt)}</small></div><Badge>{t.urgency}</Badge><Badge>{t.status}</Badge></div>)}</section>}
  </>;
}

function Customers({customers,canCreateCustomer,store,openCustomer,openTicket,openTask,onNewCustomer}:{customers:Customer[];canCreateCustomer:boolean;store:Store;openCustomer:(id:string)=>void;openTicket:(id:string)=>void;openTask:(id:string)=>void;onNewCustomer:()=>void}) {
  const [q,setQ]=useState(""); const [filter,setFilter]=useState("הכל");
  const rows=customers.filter(c=>(c.name+c.contactName+c.city).toLowerCase().includes(q.toLowerCase())&&(filter==="הכל"||(filter==="פיילוט"?Boolean(c.pilot):c.status===filter)));
  return <><SectionTitle title="לקוחות" sub={`${customers.length} חשבונות לקוח במערכת`} action={canCreateCustomer?<button className="primary" onClick={onNewCustomer}>＋ לקוח חדש</button>:undefined}/>
    <div className="filters"><label className="search">⌕<input placeholder="חיפוש לפי לקוח, איש קשר או עיר" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option>הכל</option><option>פעיל</option><option>בסיכון</option><option>בהקמה</option><option>בהשהיה</option><option>פיילוט</option></select><span className="result-count">{rows.length} תוצאות</span></div>
    <div className="table-wrap"><table><thead><tr><th>לקוח</th><th>סטטוס</th><th>עיר</th><th>איש קשר</th><th>סניפים</th><th>מכונות</th><th>ק״ג חודשי</th><th>קריאות</th><th>הזמנה</th><th></th></tr></thead><tbody>{rows.map(c=>{const open=store.tickets.filter(t=>t.accountId===c.id&&!closed(t.status)).length, order=latestCustomerOrder(store.orders,c.id), risks=riskReasons(c,store);return <tr key={c.id}><td><button className="name-cell" onClick={()=>openCustomer(c.id)}><span className="customer-avatar">{c.name.slice(0,2)}</span><strong>{c.name}</strong></button></td><td><Badge>{risks.length?"בסיכון":c.status}</Badge>{c.pilot&&<PilotBadge/>}{risks.length>0&&<small>{risks[0]}</small>}</td><td>{c.city}</td><td><strong>{c.contactName}</strong><small>{c.phone}</small></td><td>{c.branches.length}</td><td>{store.machines.filter(m=>m.accountId===c.id).length}</td><td>{c.monthlyKg}</td><td>{open?<span className="count-alert">{open}</span>:"—"}</td><td>{order&&<Badge>{order.status}</Badge>}</td><td><div className="row-actions"><button className="row-action" onClick={()=>openCustomer(c.id)}>כרטיס</button><button className="row-action" onClick={()=>openTicket(c.id)}>קריאה</button><button className="row-action" onClick={()=>openTask(c.id)}>משימה</button></div></td></tr>})}</tbody></table></div>
    <div className="mobile-cards">{rows.map(c=><button className="mobile-card" key={c.id} onClick={()=>openCustomer(c.id)}><div><span className="customer-avatar">{c.name.slice(0,2)}</span><strong>{c.name}</strong><Badge>{c.status}</Badge>{c.pilot&&<PilotBadge/>}</div><p>{c.contactName||"איש קשר טרם הוגדר"} · {c.city||"מיקום טרם הוגדר"}</p><small>{store.machines.filter(m=>m.accountId===c.id).length} מכונות · {c.monthlyKg} ק״ג בחודש</small></button>)}</div>
    {!rows.length&&<EmptyCustomerState/>}
  </>;
}

function EmptyCustomerState(){return <section className="panel empty-customer-state"><Building2 size={34}/><h2>עדיין אין לקוחות פעילים</h2><p>כרטיס לקוח יופיע כאן לאחר אישור הצעת מחיר או לאחר הקמה ידנית.</p></section>}

function CustomerCard({initialTab,customer,store,sales,canManageCustomer,openTicket,openTask,onNewQuote,onOpenQuote,onOpenTicket,onCloseTicket,onEdit,onMachineStatus,onMachineCommercial,onEditMachine,onAddMachine,onTicketStatus,onOrderChange,onSaleChange,onTaskStatus,onSaveCustomer,onSaveProfitability,customers,readOnly,actor,onToast,onEndPilot}:{initialTab?:string;onSaleChange:(recordId:string,saleId:string,patch:Partial<ProfitabilitySaleLine>)=>void;customers:Customer[];readOnly:boolean;actor:string;onToast:(message:string)=>void;onEndPilot:(customer:Customer)=>void;customer:Customer;store:Store;sales:SalesWorkspace;canManageCustomer:boolean;openTicket:(m?:string)=>void;openTask:()=>void;onNewQuote:(customer:Customer)=>void;onOpenQuote:(quote:Quote)=>void;onOpenTicket:(id:string)=>void;onCloseTicket:(id:string)=>void;onEdit:()=>void;onMachineStatus:(id:string,status:string)=>void;onMachineCommercial:(id:string,commercial:string)=>void;onEditMachine:(id:string)=>void;onAddMachine:()=>void;onTicketStatus:(id:string,status:string)=>void;onOrderChange:(id:string,data:Partial<Order>)=>void;onTaskStatus:(id:string,status:string)=>void;onSaveCustomer:(customer:Customer)=>Promise<void>;onSaveProfitability:(record:MonthlyProfitability)=>void}) {
  const [tab,setTab]=useState(initialTab||"סקירה");
  const [note,setNote]=useState(""),[noteSaving,setNoteSaving]=useState(false);
  const ms=store.machines.filter(m=>m.accountId===customer.id), ts=store.tickets.filter(t=>t.accountId===customer.id), os=store.orders.filter(o=>o.accountId===customer.id);
  const profitabilityRecords=store.profitability.filter(record=>record.accountId===customer.id);
  const quotes=customerQuotes(customer,sales.quotes);
  // The quote the card works from: the one chosen as active, else the latest approved one.
  const approvedQuote=activeQuoteFor(customer,quotes);
  const [activating,setActivating]=useState("");
  const chooseActiveQuote=async(quote:Quote)=>{if(readOnly){onToast("מצב התצוגה הוא לקריאה בלבד");return;}if(customer.commercialAgreement&&!window.confirm(`לעבוד מול "${quote.versionName}"? ההסכם המסחרי בכרטיס ייבנה מחדש מההצעה הזו, ושינויים שהוזנו בו ידנית יוחלפו.`))return;setActivating(quote.id);try{await onSaveCustomer({...customer,...customerUpdateForActiveQuote(customer,quote,commercialAgreementFromQuote(quote))});const added=await addQuoteMachines(customer,quote);onToast(`"${quote.versionName}" היא עכשיו ההצעה הפעילה של ${customer.name}${added?` · נוספו ${added} מכונות לציוד`:""}`);}finally{setActivating("");}};
  const commercialAgreement=customer.commercialAgreement||(approvedQuote?commercialAgreementFromQuote(approvedQuote):undefined);
  const contractEnd=customer.contractEnd?formatDate(customer.contractEnd):"טרם הוגדר";
  const value=(text:string|undefined)=>text||"טרם הוגדר";
  const onboardingChecks=[{label:"פרטי לקוח ואנשי קשר",done:Boolean(customer.contactName&&customer.phone)},{label:"הסכם מסחרי פעיל",done:commercialAgreement?.status==="active"},{label:"סניפים",done:customer.branches.length>0},{label:"מכונות ומספרים סידוריים",done:ms.length>0&&ms.every(machine=>machine.serial&&machine.serial!=="טרם הוגדר")},{label:"תקופת הסכם",done:Boolean(customer.contractStart&&customer.contractEnd)},{label:"הזמנה חודשית",done:os.length>0}];
  const saveNote=async()=>{if(!note.trim())return;setNoteSaving(true);try{await onSaveCustomer({...customer,notes:[...(customer.notes||[]),{id:createId("note"),text:note.trim(),createdAt:new Date().toISOString(),createdBy:"צוות Mister Bean"}]});setNote("");}finally{setNoteSaving(false);}};
  const deleteNote=async(id:string)=>{if(!window.confirm("למחוק את ההערה הזו?"))return;await onSaveCustomer({...customer,notes:(customer.notes||[]).filter(item=>item.id!==id)});};
  const tabs=["סקירה","חוזה והצעות",...(canManageCustomer?["טעימות"]:[]),"שירות וציוד",...(canManageCustomer?["הזמנות קפה","רווחיות"]:[]),"משימות","הערות"];
  return <><div className="customer-header"><div className="customer-avatar xl">{customer.name.slice(0,2)}</div><div><div className="header-line"><h2>{customer.name}</h2>{customer.pilot&&<PilotBadge large/>}<Badge>{customer.status}</Badge><Badge>{customer.rank}</Badge></div><p>{value(customer.city)} · מנהל לקוח: {value(customer.owner)}{customer.pilot&&customer.pilotStartedAt&&<> · בפיילוט מ־{formatDate(customer.pilotStartedAt)}</>}</p></div><div className="title-actions">{canManageCustomer&&customer.pilot&&<button onClick={()=>{if(window.confirm(`לסיים את הפיילוט ולהפוך את ${customer.name} ללקוח קבוע?`))onEndPilot(customer);}}>✓ סיום פיילוט</button>}{canManageCustomer&&<button onClick={()=>onNewQuote(customer)}>＋ הצעת מחיר חדשה</button>}<button onClick={openTask}>＋ יצירת משימה</button><button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאה</button></div></div>
    <div className="tabs">{tabs.map(t=><button className={tab===t?"active":""} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==="סקירה"&&<><div className="kpi-grid"><Kpi label="ק״ג חודשי מוסכם" value={contractMonthlyKg(customer,commercialAgreement)} meta="לפי החוזה"/><Kpi label="מכונות פעילות" value={ms.filter(m=>m.status==="פעילה").length} meta={`מתוך ${ms.length}`}/><Kpi label="קריאות פתוחות" value={ts.filter(t=>!closed(t.status)).length} meta="דורשות מעקב" tone="blue"/><Kpi label="סיום הסכם" value={contractEnd} meta="מעקב חידוש"/></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><h3>פרטי לקוח</h3><button className="row-action" onClick={onEdit}>עריכה</button></div><dl><div><dt>איש קשר</dt><dd>{value(customer.contactName)}</dd></div><div><dt>טלפון</dt><dd>{value(customer.phone)}</dd></div><div><dt>דוא״ל</dt><dd>{value(customer.email)}</dd></div><div><dt>כתובת</dt><dd>{[customer.address,customer.city].filter(Boolean).join(", ")||"טרם הוגדרה"}</dd></div><div><dt>תערובות בחוזה</dt><dd>{customer.contractBlends?.join(", ")||"טרם הוגדרו"}</dd></div><div><dt>יום אספקה</dt><dd>{customer.deliveryDayOfMonth||1} בחודש</dd></div></dl></section><section className="panel onboarding-panel"><div className="panel-head"><div><h3>קליטת לקוח</h3><p>{customer.onboardingStatus||"בהקמה"}</p></div><Badge>{onboardingChecks.filter(item=>item.done).length}/{onboardingChecks.length}</Badge></div>{onboardingChecks.map(item=><div className={item.done?"onboarding-check done":"onboarding-check"} key={item.label}><i>{item.done?"✓":"○"}</i><span>{item.label}</span></div>)}</section></div>{canManageCustomer&&<CustomerProfitOverview customer={customer} orders={os} records={profitabilityRecords} approvedQuote={approvedQuote} agreement={commercialAgreement} onEdit={()=>setTab("הזמנות קפה")}/>}</>}
    {tab==="שירות וציוד"&&<><Machines machines={ms} isStaff openTicket={openTicket} onStatus={onMachineStatus} onCommercial={onMachineCommercial} onEdit={onEditMachine} onAdd={onAddMachine}/><div className="section-spacer"/><Tickets tickets={ts} machines={store.machines} isStaff staffUsers={[]} onAssign={()=>{}} onUpdate={onTicketStatus} onOpen={onOpenTicket} onClose={onCloseTicket} openTicket={openTicket}/></>}
    {tab==="הזמנות קפה"&&<OrdersBoard accountId={customer.id} orders={os} profitability={profitabilityRecords} activities={store.activities} agreementFor={()=>commercialAgreement} onOrderChange={onOrderChange} onSaleChange={onSaleChange} onAddSale={()=>setTab("רווחיות")}/>}
    {tab==="רווחיות"&&<ProfitabilityBoard customer={customer} orders={os} records={profitabilityRecords} approvedQuote={approvedQuote} agreement={commercialAgreement} onSave={onSaveProfitability} onSaveCustomer={onSaveCustomer} operations/>}
    {tab==="חוזה והצעות"&&<><CommercialAgreementCard key={`${commercialAgreement?.sourceQuoteId||""}-${commercialAgreement?.updatedAt||""}`} customer={customer} agreement={commercialAgreement} sourceQuote={approvedQuote} onSave={onSaveCustomer}/><div className="section-spacer"/><div className="dashboard-grid"><div><Contract customer={customer} machines={ms}/></div><section className="panel customer-history-panel"><header><div><h3>הצעות מחיר</h3><p>ההצעה הפעילה היא זו שממנה נלקחים ההסכם, הרווחיות והחישובים בכרטיס.</p></div><button className="primary" onClick={()=>onNewQuote(customer)}>＋ הצעה חדשה</button></header>{quotes.length?<div className="customer-history-list">{quotes.map(quote=>{const isActive=approvedQuote?.id===quote.id;return <div className={`customer-quote-row${isActive?" active":""}`} key={quote.id}><button onClick={()=>onOpenQuote(quote)}><div><strong>{quote.versionName}</strong><small>{formatDate(quote.savedAt||quote.updatedAt)}</small></div><Badge>{quote.status}</Badge><span>{quote.knownKg||0} ק״ג</span><b>פתיחה ←</b></button>{isActive?<span className="active-quote-label">✓ ההצעה הפעילה{customer.activeQuoteId?"":" (אחרונה שאושרה)"}</span>:canManageCustomer&&<button className="row-action" disabled={Boolean(activating)} onClick={()=>void chooseActiveQuote(quote)}>{activating===quote.id?"מעדכן…":"עבודה מול הצעה זו"}</button>}</div>;})}</div>:<div className="inline-empty">אין עדיין הצעות משויכות.</div>}</section></div><div className="section-spacer"/><div className="card-grid">{customer.branches.map((branch,index)=><div className="info-card" key={`${branch}-${index}`}><span>סניף {index+1}</span><h3>{branch}</h3><p>{customer.address}, {customer.city}</p><small>{customer.contactName} · {customer.phone}</small></div>)}</div></>}
    {tab==="טעימות"&&canManageCustomer&&<TastingWorkspace customers={customers} customer={customer} readOnly={readOnly} actor={actor} onToast={onToast}/>}
    {tab==="משימות"&&<Tasks tasks={store.tasks.filter(task=>task.accountId===customer.id)} onCreate={openTask} onStatus={onTaskStatus}/>}
    {tab==="הערות"&&<div className="dashboard-grid"><section className="panel notes"><h3>הערות פנימיות</h3>{customer.notes?.length?<div className="note-list">{[...customer.notes].reverse().map(item=><article key={item.id}><div><p>{item.text}</p><small>{item.createdBy} · {formatDateTime(item.createdAt)}</small></div>{canManageCustomer&&<button aria-label="מחיקת הערה" onClick={()=>void deleteNote(item.id)}><Trash2 size={14}/></button>}</article>)}</div>:<div className="inline-empty">עדיין לא נוספו הערות.</div>}{canManageCustomer&&<><textarea value={note} onChange={event=>setNote(event.target.value)} placeholder="הוספת הערה פנימית…"/><button className="primary" disabled={!note.trim()||noteSaving} onClick={()=>void saveNote()}>{noteSaving?"שומר…":"שמירת הערה"}</button></>}</section><section className="panel activity-panel"><h3>פעילות אחרונה</h3>{store.activities.filter(item=>item.accountId===customer.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(item=><div className="activity-row" key={item.id}><i/><div><strong>{item.summary}</strong><small>{item.actorName} · {formatDateTime(item.createdAt)}</small></div></div>)}</section></div>}
  </>;
}

function CommercialAgreementCard({customer,agreement,sourceQuote,onSave}:{customer:Customer;agreement?:CommercialAgreement;sourceQuote?:Quote;onSave:(customer:Customer)=>Promise<void>}) {
  const initial=agreement||{...emptyCommercialAgreement(),monthlyBeanKg:customer.monthlyKg||0,effectiveFrom:customer.contractStart||"",effectiveTo:customer.contractEnd||""};
  const [editing,setEditing]=useState(!agreement),[saving,setSaving]=useState(false),[draft,setDraft]=useState<CommercialAgreement>(initial);
  const update=<K extends keyof CommercialAgreement>(key:K,value:CommercialAgreement[K])=>setDraft(current=>({...current,[key]:value}));
  const income=commercialAgreementMonthlyIncome(draft,new Date().toISOString().slice(0,7));
  const saveAgreement=async()=>{setSaving(true);try{const next={...draft,status:"active" as const,updatedAt:new Date().toISOString()};await onSave({...customer,monthlyKg:next.model==="monthly_package"?next.packageCount*next.packageIncludedKgPerUnit:next.monthlyBeanKg,contractStart:next.effectiveFrom||customer.contractStart,contractEnd:next.effectiveTo||customer.contractEnd,commercialAgreement:next});setDraft(next);setEditing(false);}finally{setSaving(false);}};
  return <section className="panel commercial-agreement-card"><div className="panel-head"><div><h3>ההסכם המסחרי הפעיל</h3><p>{sourceQuote?`מבוסס על ההצעה הפעילה: ${sourceQuote.versionName}`:"הוזן כחלק מהקמת הלקוח"}</p></div><div className="agreement-head-actions"><Badge>{draft.status==="active"?"פעיל":"דורש אישור"}</Badge>{!editing&&<button className="row-action" onClick={()=>setEditing(true)}>עריכת תנאים</button>}</div></div>{editing?<div className="agreement-form"><label><span>סוג ההסכם</span><select value={draft.model} onChange={event=>update("model",event.target.value as CommercialAgreementModel)}><option value="beans_only">מכירת פולים בלבד</option><option value="equipment_rental">השכרת מכונות ופולים</option><option value="equipment_sale">מכירת מכונות ופולים</option><option value="monthly_package">חבילה חודשית — מכונה, שירות ופולים</option><option value="mixed">הסכם משולב</option></select></label><label><span>תחילת ההסכם</span><input type="date" value={draft.effectiveFrom||""} onChange={event=>update("effectiveFrom",event.target.value)}/></label><label><span>סיום ההסכם</span><input type="date" value={draft.effectiveTo||""} onChange={event=>update("effectiveTo",event.target.value)}/></label>{draft.model==="monthly_package"?<><label><span>מספר חבילות / מכונות</span><input type="number" min="1" value={draft.packageCount} onChange={event=>update("packageCount",Math.max(1,Number(event.target.value)))}/></label><label><span>מחיר חודשי לחבילה</span><input type="number" min="0" value={draft.packageMonthlyFee} onChange={event=>update("packageMonthlyFee",Number(event.target.value))}/></label><label><span>ק״ג כלולים בכל חבילה</span><input type="number" min="0" value={draft.packageIncludedKgPerUnit} onChange={event=>update("packageIncludedKgPerUnit",Number(event.target.value))}/></label><label><span>מחיר לק״ג נוסף</span><input type="number" min="0" value={draft.extraKgPrice} onChange={event=>update("extraKgPrice",Number(event.target.value))}/></label></>:<><label><span>כמות פולים חודשית</span><input type="number" min="0" value={draft.monthlyBeanKg} onChange={event=>update("monthlyBeanKg",Number(event.target.value))}/></label><label><span>מחיר מכירה לק״ג</span><input type="number" min="0" value={draft.beanPricePerKg} onChange={event=>update("beanPricePerKg",Number(event.target.value))}/></label></>}<label><span>עלות פולים לנו לק״ג</span><input type="number" min="0" value={draft.beanCostPerKg} onChange={event=>update("beanCostPerKg",Number(event.target.value))}/></label>{["equipment_rental","mixed"].includes(draft.model)&&<label><span>הכנסה חודשית מהשכרת מכונות</span><input type="number" min="0" value={draft.monthlyRentalIncome} onChange={event=>update("monthlyRentalIncome",Number(event.target.value))}/></label>}{["equipment_sale","mixed"].includes(draft.model)&&<><label><span>הכנסה חד־פעמית ממכירת מכונות</span><input type="number" min="0" value={draft.oneTimeEquipmentIncome} onChange={event=>update("oneTimeEquipmentIncome",Number(event.target.value))}/></label><label><span>חודש ההכנסה</span><input type="month" value={draft.oneTimeEquipmentIncomeMonth||""} onChange={event=>update("oneTimeEquipmentIncomeMonth",event.target.value)}/></label></>}<label><span>הכנסה חודשית נוספת משירות</span><input type="number" min="0" value={draft.monthlyServiceIncome} onChange={event=>update("monthlyServiceIncome",Number(event.target.value))}/></label><footer><button onClick={()=>{setDraft(initial);setEditing(false)}}>ביטול</button><button className="primary" disabled={saving||draft.model==="monthly_package"&&(draft.packageCount<=0||draft.packageMonthlyFee<=0)} onClick={()=>void saveAgreement()}>{saving?"שומר…":"אישור ושמירת ההסכם"}</button></footer></div>:<div className="agreement-summary"><div><small>מסלול</small><strong>{commercialAgreementLabel(draft.model)}</strong></div><div><small>הכנסה חודשית קבועה</small><strong>{Math.round(income.recurringIncome).toLocaleString("he-IL")} ₪</strong></div><div><small>כמות חודשית בחוזה</small><strong>{Math.round(draft.model==="monthly_package"?draft.packageCount*draft.packageIncludedKgPerUnit:draft.monthlyBeanKg)} ק״ג</strong></div><div><small>מחיר לק״ג נוסף</small><strong>{draft.extraKgPrice?`${Math.round(draft.extraKgPrice)} ₪`:"לפי מכירה"}</strong></div>{draft.oneTimeEquipmentIncome>0&&<div><small>מכירת ציוד חד־פעמית</small><strong>{Math.round(draft.oneTimeEquipmentIncome).toLocaleString("he-IL")} ₪</strong></div>}</div>}</section>;
}

/** Sales typed in by hand (extra, employees, legacy rows); lines with a "contract-" id are derived from the month's order. */
const manualProfitabilitySales=(sales:ProfitabilitySaleLine[])=>sales.filter(item=>!item.id.startsWith("contract-")&&item.channel!=="contract");

/** Contract coffee built from an order, costed by what we last recorded paying for that blend. */
const contractSales=(customer:Customer,quote:Quote|undefined,order:Order|undefined,agreement:CommercialAgreement|undefined)=>{const remembered=(customer.profitabilityBlends||[]).filter(item=>item.channel!=="employees").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return buildDefaultCompanySales(quote,order,agreement).map(line=>{const preset=remembered.find(item=>item.name.trim().toLowerCase()===line.blendName.trim().toLowerCase());return preset&&preset.costPerKg>0?{...line,costPerKg:preset.costPerKg}:line;});};

/**
 * Coffee sold to the company in a month, built from its orders: the contract order and the top-ups the customer
 * asked for during the month (company extras, priced as extra kilograms). Cancelled top-ups are left out.
 */
const monthOrderSales=(customer:Customer,quote:Quote|undefined,orders:Order[],month:string,agreement:CommercialAgreement|undefined):ProfitabilitySaleLine[]=>{
  const contract=contractSales(customer,quote,contractOrdersOnly(orders).find(item=>item.month===month),agreement);
  const remembered=(customer.profitabilityBlends||[]).filter(item=>item.channel!=="employees");
  const extras=orders.filter(item=>isExtraOrder(item)&&item.month===month&&item.status!=="בוטל").map(item=>{
    const preset=remembered.find(entry=>entry.name.trim().toLowerCase()===item.blend.trim().toLowerCase());
    const price=agreement?.model==="monthly_package"?agreement.extraKgPrice:(agreement?.beanPricePerKg||agreement?.extraKgPrice||preset?.pricePerKg||0);
    return {id:`contract-${item.id}`,channel:"company_extra" as const,blendName:item.blend,quantityKg:Math.max(0,item.approvedKg||item.requestedKg),costPerKg:preset?.costPerKg||agreement?.beanCostPerKg||0,pricePerKg:price||0,deliveryStatus:item.status==="סופק"?"סופק" as const:"ממתין להכנה" as const,paid:Boolean(item.paid),...(item.deliveredAt?{deliveredAt:item.deliveredAt}:{})};
  });
  return [...contract,...extras];
};

/** The month's figures: the saved record when there is one, otherwise defaults from the agreement, order and approved quote. */
function buildProfitabilityDraft(customer:Customer,orders:Order[],records:MonthlyProfitability[],selectedMonth:string,approvedQuote?:Quote,agreement?:CommercialAgreement):MonthlyProfitability{
  const planned=approvedQuote?calculateQuote(approvedQuote):null;
  const timestamp=new Date().toISOString();
  const contractMonths=Math.max(1,approvedQuote?.clientCostMonths||36);
  const saved=records.find(record=>record.month===selectedMonth);
  const sales=monthOrderSales(customer,approvedQuote,orders,selectedMonth,agreement);
  const agreementIncome=agreement?commercialAgreementMonthlyIncome(agreement,selectedMonth):null;
  const agreementRevenue=agreementIncome?{fixedRevenue:Math.round(agreementIncome.packageIncome+agreementIncome.serviceIncome),rentalRevenue:Math.round(agreementIncome.rentalIncome),otherRevenue:Math.round(agreementIncome.equipmentSaleIncome)}:null;
  if(saved){
    // A closed month is final. Otherwise contract lines are rebuilt from the actual order and only hand-entered sales are kept.
    if(saved.status==="closed")return saved;
    return {...saved,...(agreementRevenue||{}),sales:[...sales,...manualProfitabilitySales(saved.sales)]};
  }
  const packageRevenue=agreementRevenue?.fixedRevenue??(approvedQuote?.pricingModel==="monthly_package"?(approvedQuote.packageCount||1)*(approvedQuote.packageMonthlyFee||0):0);
  return {id:`${customer.id}-${selectedMonth}`,accountId:customer.id,month:selectedMonth,sales,fixedRevenue:Math.round(packageRevenue),rentalRevenue:agreementRevenue?.rentalRevenue??Math.round(planned?.equipment.leaseIncome||0),otherRevenue:agreementRevenue?.otherRevenue??0,serviceCost:Math.round(approvedQuote?.monthlyServiceCost||0),deliveryCost:0,equipmentCost:Math.round((planned?.profitability.totalEquipmentEconomicCost||0)/contractMonths),otherCost:Math.round(approvedQuote?.extraMonthlyCost||0),status:"draft",createdAt:timestamp,updatedAt:timestamp};
}

function CustomerProfitOverview({customer,orders,records,approvedQuote,agreement,onEdit}:{customer:Customer;orders:Order[];records:MonthlyProfitability[];approvedQuote?:Quote;agreement?:CommercialAgreement;onEdit:()=>void}) {
  const now=new Date();
  // Up to six months, never before the customer started (an estimate for those months would be invented).
  const firstMonth=(customer.contractStart||customer.createdAt||"").slice(0,7);
  const months=Array.from({length:6},(_,index)=>{const date=new Date(now.getFullYear(),now.getMonth()-5+index,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;}).filter((month,index,all)=>index===all.length-1||!firstMonth||month>=firstMonth||records.some(item=>item.month===month));
  const series=months.map(month=>{const record=buildProfitabilityDraft(customer,orders,records,month,approvedQuote,agreement);const metrics=calculateActualProfitability(record);return {month,saved:records.some(item=>item.month===month),closed:record.status==="closed",metrics,costs:metrics.beanCost+metrics.operatingCosts};});
  const current=series[series.length-1];
  const hasData=series.some(item=>item.metrics.revenue>0||item.costs>0);
  const scale=Math.max(1,...series.flatMap(item=>[item.metrics.revenue,item.costs]));
  const money=(value:number)=>`${Math.round(value).toLocaleString("he-IL")} ₪`;
  const signedMoney=(value:number)=>`${value<0?"−":""}${money(Math.abs(value))}`;
  const monthLabel=(month:string)=>`${month.slice(5)}/${month.slice(2,4)}`;
  const record=buildProfitabilityDraft(customer,orders,records,current.month,approvedQuote,agreement);
  const revenueParts=[{label:"פולים בחוזה",value:current.metrics.contract.revenue},{label:"חבילה ושירות קבוע",value:Number(record.fixedRevenue)||0},{label:"שכירות ציוד",value:Number(record.rentalRevenue)||0},{label:"אקסטרה לחברה",value:current.metrics.companyExtra.revenue},{label:"הזמנות עובדים",value:current.metrics.employees.revenue},{label:"הכנסה אחרת",value:Number(record.otherRevenue)||0}].filter(item=>item.value>0);
  const costParts=[{label:"עלות פולים",value:current.metrics.beanCost},{label:"שירות",value:Number(record.serviceCost)||0},{label:"הובלה ולוגיסטיקה",value:Number(record.deliveryCost)||0},{label:"ציוד",value:Number(record.equipmentCost)||0},{label:"הוצאה אחרת",value:Number(record.otherCost)||0}].filter(item=>item.value>0);
  const partsScale=Math.max(1,...revenueParts.map(item=>item.value),...costParts.map(item=>item.value));
  return <section className="panel customer-profit-overview">
    <div className="panel-head"><div><h3>רווחיות הלקוח</h3><p>עד חצי שנה אחורה. חודשים שלא נשמרו מוצגים כהערכה לפי ההסכם וההזמנה.</p></div><button className="row-action" onClick={onEdit}>עדכון נתוני החודש ←</button></div>
    {!hasData?<div className="inline-empty">עדיין אין נתוני מכירות או הסכם מסחרי. אחרי הזנת הזמנות והסכם, הרווחיות תוצג כאן.</div>:<>
      <div className="profit-overview-stats">
        <div><small>רווח החודש</small><strong className={current.metrics.netProfit>=0?"positive-text":"negative-text"}>{signedMoney(current.metrics.netProfit)}</strong><span>{current.saved?(current.closed?"חודש סגור":"טיוטה שמורה"):"הערכה"}</span></div>
        <div><small>הכנסות החודש</small><strong>{money(current.metrics.revenue)}</strong><span>{Math.round(current.metrics.totalKg).toLocaleString("he-IL")} ק״ג</span></div>
        <div><small>עלויות החודש</small><strong>{money(current.costs)}</strong><span>פולים {money(current.metrics.beanCost)}</span></div>
        <div><small>שיעור רווח</small><strong>{current.metrics.revenue>0?`${Math.round(current.metrics.marginPercent)}%`:"—"}</strong><span>מההכנסות</span></div>
      </div>
      <div className="profit-overview-grid">
        <figure className="profit-bars" aria-label="הכנסות ועלויות לפי חודש">
          <figcaption><span><i className="revenue"/>הכנסות</span><span><i className="cost"/>עלויות</span><span><i className="estimate"/>הערכה</span></figcaption>
          <div className="profit-bars-plot" style={{gridTemplateColumns:`repeat(${Math.max(3,series.length)},1fr)`}}>{series.map(item=><div className={`profit-bars-month ${item.saved?"":"estimate"}`} key={item.month}>
            <div className="profit-bars-pair">
              <i className="revenue" style={{height:`${item.metrics.revenue/scale*100}%`}} title={`${monthLabel(item.month)} · הכנסות ${money(item.metrics.revenue)}`}/>
              <i className="cost" style={{height:`${item.costs/scale*100}%`}} title={`${monthLabel(item.month)} · עלויות ${money(item.costs)}`}/>
            </div>
            <b className={item.metrics.netProfit>=0?"":"negative-text"}>{signedMoney(item.metrics.netProfit)}</b>
            <span>{monthLabel(item.month)}</span>
          </div>)}</div>
          <p className="profit-bars-note">המספר מתחת לכל חודש הוא הרווח הנקי.</p>
        </figure>
        <div className="profit-parts">
          <div><h4>הכנסות החודש לפי מקור</h4>{revenueParts.length?revenueParts.map(item=><div className="profit-part" key={item.label}><span>{item.label}</span><div><i className="revenue" style={{width:`${item.value/partsScale*100}%`}}/></div><b>{money(item.value)}</b></div>):<small>אין הכנסות החודש</small>}</div>
          <div><h4>עלויות החודש לפי סוג</h4>{costParts.length?costParts.map(item=><div className="profit-part" key={item.label}><span>{item.label}</span><div><i className="cost" style={{width:`${item.value/partsScale*100}%`}}/></div><b>{money(item.value)}</b></div>):<small>אין עלויות החודש</small>}</div>
        </div>
      </div>
    </>}
  </section>;
}

/** salesOnly: additional sales only. operations: monthly sales, costs and closing, without the charts (those are on the customer overview). */
function ProfitabilityBoard({customer,orders,records,approvedQuote,agreement,onSave,onSaveCustomer,salesOnly=false,operations=false}:{customer:Customer;orders:Order[];records:MonthlyProfitability[];approvedQuote?:Quote;agreement?:CommercialAgreement;onSave:(record:MonthlyProfitability)=>void;onSaveCustomer:(customer:Customer)=>Promise<void>;salesOnly?:boolean;operations?:boolean}){
  const today=new Date();
  const currentMonth=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
  const [month,setMonth]=useState(currentMonth);
  const planned=approvedQuote?calculateQuote(approvedQuote):null;
  const makeDraft=(selectedMonth:string)=>buildProfitabilityDraft(customer,orders,records,selectedMonth,approvedQuote,agreement);
  const [draft,setDraft]=useState<MonthlyProfitability>(()=>makeDraft(currentMonth));
  const emptyLine=(channel:ProfitabilitySalesChannel="company_extra"):ProfitabilitySaleLine=>({id:createId("sale"),channel,blendName:"",quantityKg:0,costPerKg:0,pricePerKg:0,deliveryStatus:"ממתין להכנה"});
  const [line,setLine]=useState<ProfitabilitySaleLine>(()=>emptyLine());
  const changeMonth=(selectedMonth:string)=>{setMonth(selectedMonth);setDraft(makeDraft(selectedMonth));setLine(emptyLine());};
  const orderSignature=orders.filter(item=>item.month===month).map(item=>`${item.id}:${item.status}:${item.approvedKg}:${item.requestedKg}:${item.defaultKg}:${item.blend}:${item.paid?1:0}`).sort().join("|");
  // An order edited above changes what was actually sold this month; keep the hand-entered lines.
  const [syncedOrder,setSyncedOrder]=useState(orderSignature);
  if(syncedOrder!==orderSignature){setSyncedOrder(orderSignature);setDraft(current=>current.status==="closed"?current:{...current,sales:[...monthOrderSales(customer,approvedQuote,orders,month,agreement),...manualProfitabilitySales(current.sales)]});}
  const metrics=calculateActualProfitability(draft);
  const plannedProfit=planned?.profitability.averageMonthlyProfit||0;
  const plannedRevenue=agreement?commercialAgreementMonthlyIncome(agreement,month).recurringIncome:planned?.profitability.monthlyClientRevenue||0;
  const plannedKg=planned?.beans.totalKg||0;
  const locked=draft.status==="closed";
  const blendOptions=knownBlends(customer,approvedQuote,line.channel==="employees"?"employees":"company");
  const presets=blendOptions.filter(item=>item.pricePerKg>0);
  const selectBlend=(name:string)=>{const known=findKnownBlend(blendOptions,name);setLine(current=>({...current,blendName:name,...(known?.costPerKg?{costPerKg:known.costPerKg}:{}),...(known?.pricePerKg?{pricePerKg:known.pricePerKg}:{})}));};
  // Cost and price are remembered per blend as soon as a sale is added, not only when the month is saved.
  const rememberBlends=(sales:ProfitabilitySaleLine[],timestamp:string)=>{const remembered=[...(customer.profitabilityBlends||[])];for(const sale of sales){if(!sale.blendName.trim())continue;const key=`${sale.channel}:${sale.blendName.trim().toLowerCase()}`;const preset:ProfitabilityBlendPreset={id:key,channel:sale.channel,name:sale.blendName.trim(),costPerKg:sale.costPerKg,pricePerKg:sale.pricePerKg,updatedAt:timestamp};const index=remembered.findIndex(item=>item.id===key);if(index>=0)remembered[index]=preset;else remembered.push(preset);}return onSaveCustomer({...customer,profitabilityBlends:remembered});};
  const addLine=()=>{if(!line.blendName.trim()||line.quantityKg<=0)return;const added={...line,quantityKg:Math.round(line.quantityKg),costPerKg:Math.round(line.costPerKg),pricePerKg:Math.round(line.pricePerKg),blendName:line.blendName.trim()};setDraft(current=>({...current,sales:[...current.sales,added]}));setLine(emptyLine(line.channel));void rememberBlends([added],new Date().toISOString());};
  const updateLine=(id:string,patch:Partial<ProfitabilitySaleLine>)=>setDraft(current=>({...current,sales:current.sales.map(item=>item.id===id?{...item,...patch}:item)}));
  const save=async(status:MonthlyProfitability["status"]="draft")=>{
    const timestamp=new Date().toISOString();
    const next={...draft,status,updatedAt:timestamp};
    onSave(next);setDraft(next);
    await rememberBlends(manualProfitabilitySales(next.sales),timestamp);
  };
  const history=[...records.filter(record=>record.id!==draft.id),draft].sort((a,b)=>a.month.localeCompare(b.month)).slice(-8);
  const historyMetrics=history.map(record=>({record,metrics:calculateActualProfitability(record)}));
  const maxProfit=Math.max(1,plannedProfit,...historyMetrics.map(item=>Math.abs(item.metrics.netProfit)));
  const additionalSales=draft.sales.filter(sale=>sale.channel==="company_extra"||sale.channel==="employees");
  const additionalGrossProfit=metrics.companyExtra.grossProfit+metrics.employees.grossProfit;
  const contractRevenue=agreement?.model==="monthly_package"?agreement.packageCount*agreement.packageMonthlyFee:metrics.contract.revenue;
  const contractGrossProfit=contractRevenue-metrics.contract.beanCost;
  // Package coffee has no per-kg price: the package fee is its revenue, split by the kilograms delivered.
  const includedKg=draft.sales.reduce((sum,sale)=>sum+(sale.includedInFixedRevenue?sale.quantityKg:0),0);
  const blendRows=[...draft.sales.reduce((map,sale)=>{const key=`${sale.channel}:${sale.blendName}`;const current=map.get(key)||{channel:sale.channel,name:sale.blendName,kg:0,revenue:0,cost:0};current.kg+=sale.quantityKg;current.revenue+=sale.includedInFixedRevenue?(includedKg>0?contractRevenue*sale.quantityKg/includedKg:0):sale.quantityKg*sale.pricePerKg;current.cost+=sale.quantityKg*sale.costPerKg;map.set(key,current);return map;},new Map<string,{channel:ProfitabilitySalesChannel;name:string;kg:number;revenue:number;cost:number}>()).values()];
  const money=(value:number)=>`${Math.round(value).toLocaleString("he-IL")} ₪`;
  return <div className={`profit-board ${salesOnly?"profit-sales-only":operations?"profit-operations":"profit-detail"}`}>
    {operations&&<div className="sales-month-toolbar"><div><strong>מכירות, הכנסות והוצאות לחודש {month.slice(5)}/{month.slice(0,4)}</strong><span>הנתונים כאן מזינים את גרף הרווחיות בסקירת הלקוח</span></div><label><span>בחירת חודש</span><input type="month" value={month} onChange={event=>changeMonth(event.target.value)}/></label><Badge>{locked?"חודש סגור":"טיוטה"}</Badge></div>}
    {!salesOnly&&!operations&&<section className="profit-hero"><div><span>ביצוע עסקי בפועל</span><h2>{`רווחיות ${customer.name}`}</h2><p>{approvedQuote?`מול ${approvedQuote.versionName}`:"ללקוח עדיין אין הצעה פעילה להשוואה"}</p></div><label><span>חודש פעילות</span><input type="month" value={month} onChange={event=>changeMonth(event.target.value)}/></label><Badge>{locked?"חודש סגור":"טיוטה"}</Badge></section>}
    {!salesOnly&&!operations&&<div className="profit-scope-note"><strong>כל הנתונים מתייחסים לחודש {month.slice(5)}/{month.slice(0,4)} בלבד.</strong><span>הכמות החוזית וההזמנה המאושרת נטענות אוטומטית; אפשר לתקן אותן לפי מה שנמכר בפועל. רווח לכל תקופת החוזה מוצג בהצעה המאושרת.</span></div>}
    {salesOnly&&<div className="sales-month-toolbar"><div><strong>מכירות נוספות לחודש {month.slice(5)}/{month.slice(0,4)}</strong><span>אקסטרה לחברה והזמנות עובדים בלבד</span></div><label><span>בחירת חודש</span><input type="month" value={month} onChange={event=>changeMonth(event.target.value)}/></label><Badge>{locked?"חודש סגור":"טיוטה"}</Badge></div>}
    <div className="profit-kpis"><article><small>רווח חודשי בפועל</small><strong className={metrics.netProfit>=0?"positive-text":"negative-text"}>{money(metrics.netProfit)}</strong><span>{planned?`${metrics.netProfit-plannedProfit>=0?"מעל":"מתחת"} לתכנון החודשי ב־${money(Math.abs(metrics.netProfit-plannedProfit))}`:"ללא יעד מתוכנן"}</span></article><article><small>הכנסות החודש</small><strong>{money(metrics.revenue)}</strong><span>תכנון חודשי: {money(plannedRevenue)}</span></article><article><small>כמות החודש</small><strong>{Math.round(metrics.totalKg).toLocaleString("he-IL")} ק״ג</strong><span>תכנון: {Math.round(plannedKg).toLocaleString("he-IL")} ק״ג</span></article><article><small>שיעור רווח חודשי</small><strong className={metrics.marginPercent>=0?"positive-text":"negative-text"}>{Math.round(metrics.marginPercent)}%</strong><span>{money(metrics.profitPerKg)} לק״ג</span></article><article><small>עלויות החודש</small><strong>{money(metrics.beanCost+metrics.operatingCosts)}</strong><span>פולים {money(metrics.beanCost)} · נוספות {money(metrics.operatingCosts)}</span></article></div>
    <div className="profit-dashboard-grid profit-insights"><section className="panel profit-trend"><header><div><h3>מגמת רווח חודשי</h3><p>רווח בפועל מול יעד של {money(plannedProfit)}</p></div></header><div className="profit-chart">{historyMetrics.map(({record,metrics:item})=><div className="profit-chart-column" key={record.id}><b>{money(item.netProfit)}</b><div className="profit-chart-track"><i className={item.netProfit>=0?"positive":"negative"} style={{height:`${Math.max(6,Math.abs(item.netProfit)/maxProfit*100)}%`}}/></div><span>{record.month.slice(5)}/{record.month.slice(2,4)}</span></div>)}</div></section><section className="panel channel-split"><header><h3>ערוצי המכירה</h3><p>החוזה, האקסטרה והעובדים מוצגים בנפרד</p></header><div><article><span>במסגרת החוזה</span><strong>{Math.round(metrics.contract.kg)} ק״ג</strong><b className={contractGrossProfit>=0?"positive-text":"negative-text"}>רווח גולמי {money(contractGrossProfit)}</b><small>הכנסה {money(contractRevenue)} · עלות פולים {money(metrics.contract.beanCost)}</small></article><article><span>אקסטרה לחברה</span><strong>{Math.round(metrics.companyExtra.kg)} ק״ג</strong><b>רווח גולמי {money(metrics.companyExtra.grossProfit)}</b><small>הכנסה {money(metrics.companyExtra.revenue)}</small></article><article><span>הזמנות עובדים</span><strong>{Math.round(metrics.employees.kg)} ק״ג</strong><b>רווח גולמי {money(metrics.employees.grossProfit)}</b><small>הכנסה {money(metrics.employees.revenue)}</small></article></div></section></div>
    <section className="panel actual-sales"><div className="panel-head"><div><h3>מכירות נוספות</h3><p>הכמות שבחוזה מופיעה בשורת ההזמנה למעלה. כאן מזינים רק אקסטרה לחברה והזמנות עובדים.</p></div><Badge>{additionalSales.length} שורות</Badge></div>{presets.length>0&&<div className="saved-blends"><span>בלנדים שמורים:</span>{presets.map(preset=><button key={preset.name} disabled={locked} onClick={()=>selectBlend(preset.name)}>{preset.name} · עלות {Math.round(preset.costPerKg)} ₪ · מכירה {Math.round(preset.pricePerKg)} ₪</button>)}</div>}{!locked&&<div className="sale-entry"><label><span>סוג מכירה</span><select value={line.channel} onChange={event=>setLine(emptyLine(event.target.value as ProfitabilitySalesChannel))}><option value="company_extra">אקסטרה לחברה</option><option value="employees">הזמנות עובדים</option></select></label><label><span>בלנד</span><input list="profit-blend-options" value={line.blendName} onChange={event=>selectBlend(event.target.value)} placeholder="בחירה מהרשימה או הקלדה"/><datalist id="profit-blend-options">{blendOptions.map(item=><option value={item.name} key={item.name}>{item.costPerKg?`עלות ${Math.round(item.costPerKg)} ₪`:""}{item.pricePerKg?` · מכירה ${Math.round(item.pricePerKg)} ₪`:""}</option>)}</datalist></label><label><span>כמות בק״ג</span><input type="number" min="0" step="1" value={line.quantityKg||""} onChange={event=>setLine(current=>({...current,quantityKg:Math.round(Number(event.target.value))}))}/></label><label><span>עלות לנו לק״ג</span><input type="number" min="0" step="1" value={line.costPerKg||""} onChange={event=>setLine(current=>({...current,costPerKg:Math.round(Number(event.target.value))}))}/></label><label><span>מחיר ללקוח לק״ג</span><input type="number" min="0" step="1" value={line.pricePerKg||""} onChange={event=>setLine(current=>({...current,pricePerKg:Math.round(Number(event.target.value))}))}/></label><button className="primary" disabled={!line.blendName.trim()||line.quantityKg<=0} onClick={addLine}>＋ הוספה</button></div>}
      {additionalSales.length?<div className="sale-lines"><header><span>סוג מכירה / בלנד</span><span>ק״ג</span><span>עלות לנו</span><span>מחיר מכירה</span><span>רווח גולמי</span><span>משלוח ומסמכים</span><span/></header>{additionalSales.map(sale=><div key={sale.id}><span><Badge>{profitabilityChannelLabel(sale.channel)}</Badge><input disabled={locked} value={sale.blendName} onChange={event=>updateLine(sale.id,{blendName:event.target.value})}/></span><input disabled={locked} type="number" min="0" step="1" value={Math.round(sale.quantityKg)} onChange={event=>updateLine(sale.id,{quantityKg:Math.round(Number(event.target.value))})}/><input disabled={locked} type="number" min="0" step="1" value={Math.round(sale.costPerKg)} onChange={event=>updateLine(sale.id,{costPerKg:Math.round(Number(event.target.value))})}/><input disabled={locked} type="number" min="0" step="1" value={Math.round(sale.pricePerKg)} onChange={event=>updateLine(sale.id,{pricePerKg:Math.round(Number(event.target.value))})}/><b className={sale.quantityKg*(sale.pricePerKg-sale.costPerKg)>=0?"positive-text":"negative-text"}>{money(sale.quantityKg*(sale.pricePerKg-sale.costPerKg))}</b><AdditionalSaleFulfillment sale={sale} locked={locked} onChange={patch=>updateLine(sale.id,patch)}/><button disabled={locked} onClick={()=>setDraft(current=>({...current,sales:current.sales.filter(item=>item.id!==sale.id)}))} aria-label="מחיקת שורה"><Trash2 size={15}/></button></div>)}</div>:<div className="inline-empty">אין מכירות נוספות בחודש זה.</div>}
      <div className="additional-sales-summary"><div><small>רווח גולמי ממכירות נוספות</small><strong className={additionalGrossProfit>=0?"positive-text":"negative-text"}>{money(additionalGrossProfit)}</strong></div><div><small>הכנסות החודש הכוללות</small><strong>{money(metrics.revenue)}</strong></div><div><small>עלויות החודש הכוללות</small><strong>{money(metrics.beanCost+metrics.operatingCosts)}</strong></div><div><small>רווח חודשי סופי</small><strong className={metrics.netProfit>=0?"positive-text":"negative-text"}>{money(metrics.netProfit)}</strong></div></div>
    </section>
    <div className="profit-dashboard-grid"><section className="panel monthly-costs"><div className="panel-head"><div><h3>הכנסות והוצאות חודשיות</h3><p>סכומים לחודש הנבחר, ללא מע״מ. ניתן לתקן את ברירות המחדל מההצעה.</p></div></div><div>{([ ["fixedRevenue","הכנסה קבועה מחבילה"],["rentalRevenue","שכירות ציוד"],["otherRevenue","הכנסה אחרת"],["serviceCost","עלות שירות"],["deliveryCost","הובלה ולוגיסטיקה"],["equipmentCost","עלות ציוד חודשית"],["otherCost","הוצאה אחרת"] ] as Array<[keyof MonthlyProfitability,string]>).map(([key,label])=><label key={key}><span>{label}</span><input disabled={locked} type="number" min="0" step="1" value={Math.round(draft[key] as number)} onChange={event=>setDraft(current=>({...current,[key]:Math.round(Number(event.target.value))}))}/></label>)}</div></section><section className="panel blend-performance"><div className="panel-head"><div><h3>רווחיות לפי בלנד</h3><p>השוואה חודשית בין ערוצים, כמויות ומרווח בפועל.</p></div></div>{blendRows.length?<div>{blendRows.map(row=><article key={`${row.channel}:${row.name}`}><div><Badge>{profitabilityChannelLabel(row.channel)}</Badge><strong>{row.name}</strong><small>{Math.round(row.kg)} ק״ג</small></div><span>הכנסה <b>{money(row.revenue)}</b></span><span>עלות <b>{money(row.cost)}</b></span><span>רווח גולמי <b className={row.revenue-row.cost>=0?"positive-text":"negative-text"}>{money(row.revenue-row.cost)}</b></span></article>)}</div>:<div className="inline-empty">נתוני הבלנדים יופיעו לאחר הזנת מכירות.</div>}</section></div>
    <footer className="profit-actions">{locked?<><span>החודש נסגר ונשמר כהיסטוריה.</span><button onClick={()=>void save("draft")}>פתיחה מחדש לעריכה</button></>:salesOnly?<><span>שמירת המכירות תעדכן את נתוני הרווחיות ואת ברירות המחדל של הבלנדים.</span><button className="primary" onClick={()=>void save("draft")}>שמירת מכירות</button></>:<><span>שמירת החודש תעדכן גם את ברירות המחדל של הבלנדים לפעם הבאה.</span><button onClick={()=>void save("draft")}>שמירת טיוטה</button><button className="primary" onClick={()=>void save("closed")}>סגירת חודש</button></>}</footer>
  </div>;
}

function AdditionalSaleFulfillment({sale,locked,onChange}:{sale:ProfitabilitySaleLine;locked:boolean;onChange:(patch:Partial<ProfitabilitySaleLine>)=>void}) {
  const status=sale.deliveryStatus||"ממתין להכנה";
  const changeStatus=(value:NonNullable<ProfitabilitySaleLine["deliveryStatus"]>)=>onChange({deliveryStatus:value,...(value==="סופק"&&!sale.deliveredAt?{deliveredAt:new Date().toISOString().slice(0,10)}:{})});
  return <div className="additional-sale-fulfillment">
    <select disabled={locked} value={status} onChange={event=>changeStatus(event.target.value as NonNullable<ProfitabilitySaleLine["deliveryStatus"]>)}>{["ממתין להכנה","מוכן למשלוח","נשלח","סופק","בוטל"].map(value=><option key={value}>{value}</option>)}</select>
    {status==="סופק"&&<input disabled={locked} aria-label="תאריך אספקה" type="date" value={(sale.deliveredAt||"").slice(0,10)} onChange={event=>onChange({deliveredAt:event.target.value})}/>}
    <div><label><input disabled={locked} type="checkbox" checked={Boolean(sale.paid)} onChange={event=>onChange({paid:event.target.checked})}/><span>שולם</span></label><label><input disabled={locked} type="checkbox" checked={Boolean(sale.invoiceSent)} onChange={event=>onChange({invoiceSent:event.target.checked})}/><span>חשבונית</span></label><label><input disabled={locked} type="checkbox" checked={Boolean(sale.deliveryNoteSent)} onChange={event=>onChange({deliveryNoteSent:event.target.checked})}/><span>תעודת משלוח</span></label></div>
  </div>;
}

function Tickets({tickets,machines,isStaff,staffUsers,onAssign,onUpdate,onOpen,onClose,openTicket}:{tickets:Ticket[];machines:Machine[];isStaff:boolean;staffUsers:UserProfile[];onAssign:(id:string,uid:string)=>void;onUpdate:(id:string,s:string)=>void;onOpen:(id:string)=>void;onClose:(id:string)=>void;openTicket:(m?:string)=>void}) {
  const customerName=useCustomerName();
  const [status,setStatus]=useState("הכל"),[urgency,setUrgency]=useState("הכל"),[q,setQ]=useState("");
  const rows=tickets.filter(t=>(status==="הכל"||t.status===status)&&(urgency==="הכל"||t.urgency===urgency)&&(t.id+customerName(t.accountId)+t.type).toLowerCase().includes(q.toLowerCase()));
  return <><SectionTitle title="קריאות שירות" sub={`${tickets.filter(t=>!closed(t.status)).length} קריאות פתוחות`} action={<button className="primary" onClick={()=>openTicket()}>＋ פתיחת קריאה</button>}/>
    <div className="filters"><label className="search">⌕<input placeholder="חיפוש קריאה, לקוח או תקלה" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>הכל</option>{["התקבלה","בטיפול","ממתין ללקוח","ממתין לטכנאי","תואם ביקור","נסגרה"].map(x=><option key={x}>{x}</option>)}</select><select value={urgency} onChange={e=>setUrgency(e.target.value)}><option>הכל</option><option>דחופה</option><option>גבוהה</option><option>רגילה</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>קריאה</th>{isStaff&&<th>לקוח</th>}<th>מכונה / סניף</th><th>תקלה</th><th>דחיפות</th><th>סטטוס</th><th>יעד פתרון</th>{isStaff&&<th>אחראי</th>}<th></th></tr></thead><tbody>{rows.map(t=>{const m=machines.find(m=>m.id===t.machineId);return <tr key={t.id}><td><strong>{t.id}</strong><small>עודכן {formatDateTime(t.updatedAt)}</small></td>{isStaff&&<td><strong>{customerName(t.accountId)}</strong></td>}<td><strong>{m?.model||"בעיה כללית"}</strong><small>{t.site}</small></td><td>{t.type}</td><td><div className="badge-stack">{t.intake?.safetyReview&&<span className="safety-badge">⚠️ בטיחות</span>}<Badge>{t.urgency}</Badge>{slaBreached(t)&&<Badge>חריגת SLA</Badge>}</div></td><td>{isStaff&&!closed(t.status)?<select className="status-select" value={t.status} onChange={e=>onUpdate(t.id,e.target.value)}>{["התקבלה","ממתין לטכנאי","תואם ביקור","בדרך","הגעה ללקוח","בטיפול","ממתין ללקוח","בוצע טיפול"].map(s=><option key={s}>{s}</option>)}</select>:<Badge>{t.status}</Badge>}</td><td>{formatDateTime(t.resolutionDueAt||"")}</td>{isStaff&&<td>{staffUsers.length?<select className="status-select" value={t.assignedUid||""} onChange={event=>onAssign(t.id,event.target.value)}><option value="">טרם הוקצה</option>{staffUsers.map(user=><option value={user.uid} key={user.uid}>{user.displayName||user.email}</option>)}</select>:t.assignedTo}</td>}<td><div className="row-actions"><button className="row-action" onClick={()=>onOpen(t.id)}>פרטים</button>{isStaff&&!closed(t.status)&&<button className="row-action danger" onClick={()=>onClose(t.id)}>סגירה</button>}</div></td></tr>})}</tbody></table></div>
    <div className="mobile-cards">{rows.map(t=><button className="mobile-card" key={t.id} onClick={()=>onOpen(t.id)}><div><strong>{t.id} · {t.type}</strong>{t.intake?.safetyReview&&<span className="safety-badge">⚠️ בטיחות</span>}<Badge>{t.urgency}</Badge></div><p>{isStaff&&`${customerName(t.accountId)} · `}{t.site}</p><small>{t.assignedTo} · יעד {formatDateTime(t.resolutionDueAt||"")}</small><div><Badge>{t.status}</Badge><small>{formatDate(t.openedAt)}</small></div></button>)}</div>
  </>;
}

function Machines({machines,isStaff,openTicket,onStatus,onCommercial,onEdit,onAdd}:{machines:Machine[];isStaff:boolean;openTicket:(id?:string)=>void;onStatus:(id:string,s:string)=>void;onCommercial:(id:string,s:string)=>void;onEdit?:(id:string)=>void;onAdd?:()=>void}) {
  const customerName=useCustomerName();
  const [q,setQ]=useState(""),[status,setStatus]=useState("הכל"); const rows=machines.filter(m=>(status==="הכל"||m.status===status)&&(m.serial+m.model+customerName(m.accountId)).toLowerCase().includes(q.toLowerCase()));
  return <><SectionTitle title={isStaff?"מכונות":"המכונות שלי"} sub={`${machines.length} פריטי ציוד`} action={isStaff&&onAdd?<button className="primary" onClick={onAdd}>＋ הוספת מכונה</button>:undefined}/><div className="filters"><label className="search">⌕<input placeholder="חיפוש לפי לקוח, דגם או מספר סידורי" value={q} onChange={e=>setQ(e.target.value)}/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>הכל</option><option>פעילה</option><option>דורשת טיפול</option><option>מושבתת</option></select></div>
    <div className="table-wrap"><table><thead><tr>{isStaff&&<th>לקוח</th>}<th>דגם</th><th>מספר סידורי</th><th>סניף / מיקום</th><th>סטטוס</th>{isStaff&&<th>מודל מסחרי</th>}<th>התקנה / פילטר</th><th>שכירות</th><th></th></tr></thead><tbody>{rows.map(m=><tr key={m.id}>{isStaff&&<td><strong>{customerName(m.accountId)}</strong></td>}<td><strong>{m.model}</strong></td><td>{m.serial}</td><td><strong>{m.site}</strong><small>{[m.floor&&`קומה ${m.floor}`,m.location].filter(Boolean).join(" · ")}</small></td><td>{isStaff?<select className="status-select" value={m.status} onChange={e=>onStatus(m.id,e.target.value)}><option>בהקמה</option><option>פעילה</option><option>דורשת טיפול</option><option>מושבתת</option><option>בהחלפה</option><option>הוחזרה</option></select>:<Badge>{m.status}</Badge>}</td>{isStaff&&<td><select className="status-select" value={["ללא עלות","מכירה","השכרה"].includes(m.commercial)?m.commercial:"ללא עלות"} onChange={event=>onCommercial(m.id,event.target.value)}><option>ללא עלות</option><option>מכירה</option><option>השכרה</option></select></td>}<td><strong>{formatDate(m.installedAt||"")}</strong><small>{m.filterReplacementDue?`החלפת פילטר: ${formatDate(m.filterReplacementDue)}`:"אין מועד החלפה"}</small></td><td><strong>{m.monthlyRent?`${m.monthlyRent} ₪ לחודש`:"—"}</strong><small>{m.rentalEnd?`עד ${formatDate(m.rentalEnd)}`:""}</small></td><td><div className="row-actions">{isStaff&&onEdit&&<button className="row-action" onClick={()=>onEdit(m.id)}>עריכה</button>}<button className="row-action" onClick={()=>openTicket(m.id)}>פתיחת קריאה</button></div></td></tr>)}</tbody></table></div>
    <div className="mobile-cards">{rows.map(m=><div className="mobile-card" key={m.id}><div><strong>{m.model}</strong><Badge>{m.status}</Badge></div><p>{m.site} · {[m.floor&&`קומה ${m.floor}`,m.location].filter(Boolean).join(" · ")}</p><small>{m.serial}</small>{m.filterReplacementDue&&<small>החלפת פילטר: {formatDate(m.filterReplacementDue)}</small>}{isStaff&&<label><span>מודל מסחרי</span><select value={["ללא עלות","מכירה","השכרה"].includes(m.commercial)?m.commercial:"ללא עלות"} onChange={event=>onCommercial(m.id,event.target.value)}><option>ללא עלות</option><option>מכירה</option><option>השכרה</option></select></label>}<div className="row-actions">{isStaff&&onEdit&&<button onClick={()=>onEdit(m.id)}>עריכה</button>}<button onClick={()=>openTicket(m.id)}>פתיחת קריאה</button></div></div>)}</div>
  </>;
}

/** The customer's own coffee order: confirm the month's order, top up when the coffee runs out, see past orders. */
function CustomerOrders({orders,onChange,accountId="",onCreateExtra}:{orders:Order[];onChange:(id:string,data:Partial<Order>)=>void;accountId?:string;onCreateExtra?:(order:Order)=>void}) {
  const customers=useContext(CustomerDirectoryContext);
  const [extraOpen,setExtraOpen]=useState(false);
  const rows=[...orders].sort((a,b)=>b.month.localeCompare(a.month));
  const monthName=(month:string)=>{const [year,value]=month.split("-");return `${value}/${year}`;};
    const customer=customers.find(item=>item.id===(orders[0]?.accountId||accountId));
    const contractRows=rows.filter(item=>!isExtraOrder(item));
    const o=[...contractRows].reverse().find(item=>!["סופק","בוטל"].includes(item.status))||contractRows[0];
    const others=rows.filter(item=>item.id!==o?.id);
    const pendingExtras=openExtraOrders(orders);
    const outOfCoffee=customer&&onCreateExtra&&<button className="primary out-of-coffee" onClick={()=>setExtraOpen(true)}>☕ נגמר לי הקפה</button>;
    return <><SectionTitle title="הזמנת קפה" sub={o?`הזמנה לחודש ${monthName(o.month)}`:"הזמנות קפה"} action={outOfCoffee||undefined}/>
      {pendingExtras.length>0&&<section className="panel extra-order-pending">{pendingExtras.map(item=><div key={item.id}><div><strong>הזמנת השלמה · {Math.round(item.approvedKg||item.requestedKg)} ק״ג · <bdi>{item.blend}</bdi></strong><span>{item.status==="אושר"?"אושרה":"ממתינה לאישור"}{deliveryPreferenceLabel(item)?` · אספקה ${deliveryPreferenceLabel(item)}`:""}</span></div>{item.status==="ממתין לאישור"&&<button className="extra-order-cancel" onClick={()=>{if(window.confirm(`לבטל את הזמנת ההשלמה של ${Math.round(item.requestedKg)} ק״ג?`))onChange(item.id,{status:"בוטל"});}}>ביטול ההזמנה</button>}</div>)}</section>}
      {o?<><section className="order-hero"><div><span>{o.status==="סופק"?"תאריך אספקה":"מועד האספקה הבא"}</span><h2>{o.deliveredAt?formatDate(o.deliveredAt):customer?formatDate(nextDeliveryDate(customer,o)):formatDate(`${o.month}-01`)}</h2><Badge>{o.status}</Badge></div><div className="kg-ring"><strong>{Math.round(o.requestedKg)}</strong><span>ק״ג</span></div></section><OrderEditor key={o.id} order={o} blends={customer?.contractBlends||[]} deliveryDate={customer?nextDeliveryDate(customer,o):`${o.month}-01`} onSave={onChange}/></>:<section className="panel inline-empty">אין עדיין הזמנה חודשית.</section>}
      {others.length>0&&<section className="panel customer-order-history"><h3>הזמנות נוספות</h3>{others.map(item=><div key={item.id}><strong>{isExtraOrder(item)?`השלמה · ${formatDate(item.createdAt||`${item.month}-01`)}`:monthName(item.month)}</strong><span>{Math.round(item.approvedKg||item.requestedKg)} ק״ג · {item.blend}{isExtraOrder(item)&&deliveryPreferenceLabel(item)&&!item.deliveredAt?` · אספקה ${deliveryPreferenceLabel(item)}`:""}{item.deliveredAt?` · סופק ${formatDate(item.deliveredAt)}`:""}</span><Badge>{item.status}</Badge></div>)}</section>}
      {extraOpen&&customer&&onCreateExtra&&<ExtraOrderModal customer={customer} orders={orders} onClose={()=>setExtraOpen(false)} onSubmit={order=>{onCreateExtra(order);setExtraOpen(false);}}/>}
    </>;
}

const currentMonth=()=>{const today=new Date();return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;};
const monthTitle=(month:string)=>{const [year,value]=month.split("-").map(Number);return new Intl.DateTimeFormat("he-IL",{month:"long",year:"numeric"}).format(new Date(year,value-1,1));};
const shekels=(value:number)=>`₪${Math.round(value).toLocaleString("he-IL")}`;

/**
 * The office's coffee orders: one month at a time, every sale of the month in
 * one list, placed on the pipeline from the customer to payment. Each row
 * offers its next step; everything else is edited in the side drawer.
 * With `accountId` it is the same board for one customer card.
 */
function OrdersBoard({orders,profitability,activities,agreementFor,onOrderChange,onSaleChange,accountId,onAddSale}:{orders:Order[];profitability:MonthlyProfitability[];activities:ActivityRecord[];agreementFor:(accountId:string)=>CommercialAgreement|undefined;onOrderChange:(id:string,data:Partial<Order>)=>void;onSaleChange:(recordId:string,saleId:string,patch:Partial<ProfitabilitySaleLine>)=>void;accountId?:string;onAddSale?:()=>void}) {
  const customerName=useCustomerName();
  const customers=useContext(CustomerDirectoryContext);
  const scoped=Boolean(accountId);
  // Month and stage live in the address (on the main screen), so back and a shared link return to the same view.
  const initial=typeof window!=="undefined"&&!scoped?new URLSearchParams(window.location.search):null;
  const [month,setMonth]=useState(()=>/^\d{4}-\d{2}$/.test(initial?.get("month")||"")?initial!.get("month")!:currentMonth());
  const [stage,setStage]=useState<OrderStage|"">(()=>(initial?.get("stage") as OrderStage)||"");
  const [query,setQuery]=useState("");
  const [openKey,setOpenKey]=useState("");
  useEffect(()=>{
    if(scoped)return;
    const params=new URLSearchParams(window.location.search);
    params.set("month",month);
    if(stage)params.set("stage",stage);else params.delete("stage");
    window.history.replaceState(null,"",`${window.location.pathname}?${params}`);
  },[month,stage,scoped]);
  const allRows=buildBoardRows({orders,profitability,agreementFor});
  const monthRows=allRows.filter(row=>row.month===month&&(!accountId||row.accountId===accountId));
  const summary=monthSummary(monthRows);
  const search=query.trim().toLowerCase();
  const visible=sortRows(monthRows.filter(row=>(stage?row.stage===stage:row.stage!=="cancelled")&&(!search||customerName(row.accountId).toLowerCase().includes(search)||row.blend.toLowerCase().includes(search))));
  const history=monthHistory(allRows.filter(row=>!accountId||row.accountId===accountId),month>currentMonth()?month:currentMonth());
  const maxKg=Math.max(1,...history.map(item=>item.kg));
  const open=allRows.find(row=>row.key===openKey);
  const act=(row:BoardRow)=>{const action=nextAction(row);if(!action)return;if("order" in action)onOrderChange(row.order!.id,action.order);else onSaleChange(row.sale!.recordId,row.sale!.line.id,action.sale);};
  const plannedDate=(row:BoardRow)=>{
    if(row.deliveredAt)return `סופק ${formatDate(row.deliveredAt)}`;
    if(row.order&&isExtraOrder(row.order))return deliveryPreferenceLabel(row.order)||"—";
    const customer=customers.find(item=>item.id===row.accountId);
    return row.order&&customer?formatDate(nextDeliveryDate(customer,row.order)):"—";
  };
  const exportCsv=()=>{const csv="חודש,לקוח,סוג,תערובת,ק״ג,שלב,ערך,אספקה\n"+monthRows.map(row=>[row.month,customerName(row.accountId),ROW_KIND_LABELS[row.kind],row.blend,row.kg,stageLabel(row.stage),Math.round(row.value),row.deliveredAt||""].map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv"}));a.download=`coffee-orders-${month}.csv`;a.click();};
  return <div className="orders-board">
    {!scoped&&<SectionTitle title="הזמנות קפה"/>}
    <div className="ob-toolbar">
      <div className="ob-month" role="group" aria-label="בחירת חודש"><button aria-label="חודש קודם" onClick={()=>setMonth(shiftMonth(month,-1))}>›</button><strong>{monthTitle(month)}</strong><button aria-label="חודש הבא" onClick={()=>setMonth(shiftMonth(month,1))}>‹</button>{month!==currentMonth()&&<button className="ob-today" onClick={()=>setMonth(currentMonth())}>החודש</button>}</div>
      <div className="ob-tools">{!scoped&&<input type="search" placeholder="חיפוש לקוח או תערובת" value={query} onChange={event=>setQuery(event.target.value)}/>}{onAddSale&&<button onClick={onAddSale}>＋ מכירה נוספת</button>}<button onClick={exportCsv} disabled={!monthRows.length}>ייצוא</button></div>
    </div>
    <div className="ob-kpis">
      <article><small>הוזמן החודש</small><strong>{summary.orderedKg.toLocaleString("he-IL")} ק״ג</strong><span>{summary.orders} הזמנות{scoped?"":` · ${summary.customers} לקוחות`}</span></article>
      <article><small>סופק</small><strong>{summary.deliveredKg.toLocaleString("he-IL")} ק״ג</strong><span>{summary.orderedKg?Math.round(summary.deliveredKg/summary.orderedKg*100):0}% מהחודש</span></article>
      <article><small>שווי ההזמנות</small><strong>{summary.value?shekels(summary.value):"—"}</strong><span>לפי ההסכם, ללא מע״מ</span></article>
      <article className={summary.unpaidCount?"alert":""}><small>סופק ולא שולם</small><strong>{summary.unpaidCount?shekels(summary.unpaidValue):"הכול שולם"}</strong><span>{summary.unpaidCount?`${summary.unpaidCount} הזמנות`:"אין חוב פתוח"}</span></article>
    </div>
    <div className="ob-pipeline" role="tablist" aria-label="שלבי ההזמנה">
      {ORDER_STAGES.map(item=><button role="tab" key={item.key} aria-selected={stage===item.key} className={`${stage===item.key?"active":""} ${item.key==="approval"&&summary.byStage.approval?"attention":""}`} onClick={()=>setStage(stage===item.key?"":item.key)}><b>{summary.byStage[item.key]}</b><span>{item.label}</span></button>)}
    </div>
    <div className="ob-filter-line">{stage?<><span>מוצג: {stageLabel(stage)}</span><button className="text-btn" onClick={()=>setStage("")}>הצגת הכול</button></>:<span>כל ההזמנות הפעילות של החודש</span>}{summary.byStage.cancelled>0&&stage!=="cancelled"&&<button className="text-btn" onClick={()=>setStage("cancelled")}>בוטלו ({summary.byStage.cancelled})</button>}</div>
    {visible.length?<div className="ob-list" role="table" aria-label="הזמנות החודש">
      <div className="ob-row ob-head" role="row"><span>{scoped?"הזמנה":"לקוח"}</span><span>כמות</span><span>אספקה</span><span>שלב</span><span>שווי</span><span/></div>
      {visible.map(row=>{const action=nextAction(row);return <div className={`ob-row stage-${row.stage}`} role="row" key={row.key} tabIndex={0} onClick={()=>setOpenKey(row.key)} onKeyDown={event=>{if(event.key==="Enter")setOpenKey(row.key);}}>
        <span className="ob-who"><strong>{scoped?ROW_KIND_LABELS[row.kind]:customerName(row.accountId)}</strong><small><bdi>{row.blend}</bdi>{scoped?"":` · ${ROW_KIND_LABELS[row.kind]}`}</small></span>
        <span className="ob-kg"><strong>{row.kg} ק״ג</strong>{row.contractKg!==undefined&&row.contractKg!==row.kg&&<small className={row.kg<row.contractKg?"below":""}>חוזה {row.contractKg}</small>}</span>
        <span className="ob-date">{plannedDate(row)}</span>
        <span><i className={`ob-chip ${row.stage}`}>{stageLabel(row.stage)}</i></span>
        <span className="ob-value">{row.value?shekels(row.value):"—"}</span>
        <span className="ob-action">{action&&<button className={row.stage==="approval"?"primary":""} onClick={event=>{event.stopPropagation();act(row);}}>{action.label}</button>}</span>
      </div>;})}
    </div>:<section className="panel inline-empty ob-empty">{monthRows.length?"אין הזמנות בשלב הזה.":`אין הזמנות ב${monthTitle(month)}.`}</section>}
    <section className="ob-history" aria-label="12 חודשים אחרונים">
      <header><span>12 חודשים אחרונים</span><small>לחיצה על חודש עוברת אליו</small></header>
      <div>{history.map(item=><button key={item.month} className={item.month===month?"active":""} onClick={()=>setMonth(item.month)} title={`${monthTitle(item.month)} · ${item.kg} ק״ג`} aria-label={`${monthTitle(item.month)}: ${item.kg} ק״ג`}><i style={{height:`${Math.max(4,item.kg/maxKg*100)}%`}}/><span>{Number(item.month.slice(5))}</span></button>)}</div>
    </section>
    {open&&<OrderDrawer row={open} activities={activities} onClose={()=>setOpenKey("")} onOrderChange={onOrderChange} onSaleChange={onSaleChange} plannedDate={plannedDate(open)}/>}
    {Array.from(new Set(monthRows.map(row=>row.accountId))).map(id=>{const customer=customers.find(item=>item.id===id);return <datalist id={`order-blends-${id}`} key={id}>{(customer?knownBlends(customer):BLEND_CATALOG.map(item=>({name:item.name}))).map(item=><option value={item.name} key={item.name}/>)}</datalist>;})}
  </div>;
}

/** Everything about one order, and the only place it is edited. */
function OrderDrawer({row,activities,plannedDate,onClose,onOrderChange,onSaleChange}:{row:BoardRow;activities:ActivityRecord[];plannedDate:string;onClose:()=>void;onOrderChange:(id:string,data:Partial<Order>)=>void;onSaleChange:(recordId:string,saleId:string,patch:Partial<ProfitabilitySaleLine>)=>void}) {
  const customerName=useCustomerName();
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[onClose]);
  const order=row.order;
  const history=order?activities.filter(item=>item.entityId===order.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
  const statuses=["ממתין לעדכון לקוח","ממתין לאישור","אושר","בהכנה","סופק","בוטל"];
  return <div className="ob-drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="ob-drawer" role="dialog" aria-modal="true" aria-label={`הזמנה של ${customerName(row.accountId)}`}>
    <header><div><small>{ROW_KIND_LABELS[row.kind]} · {monthTitle(row.month)}</small><h3>{customerName(row.accountId)}</h3><i className={`ob-chip ${row.stage}`}>{stageLabel(row.stage)}</i></div><button aria-label="סגירה" onClick={onClose}>✕</button></header>
    {order?<>
      <section><h4>כמות ותערובת</h4><div className="ob-fields">
        {!isExtraOrder(order)&&<label><span>לפי החוזה</span><div className="readonly">{Math.round(order.defaultKg)} ק״ג</div></label>}
        <label><span>הלקוח ביקש</span><div className="readonly">{Math.round(order.requestedKg)} ק״ג</div></label>
        <label><span>כמות מאושרת</span><OrderKgInput order={order} onChange={onOrderChange}/></label>
        <label><span>תערובת</span><OrderBlendInput order={order} onChange={onOrderChange}/></label>
      </div>{order.note&&<p className="ob-note"><b>הערת הלקוח:</b> {order.note}</p>}</section>
      <section><h4>אספקה</h4><div className="ob-fields">
        <label><span>מועד</span><div className="readonly">{plannedDate}</div></label>
        <label><span>תאריך אספקה בפועל</span><input type="date" value={(order.deliveredAt||"").slice(0,10)} onChange={event=>onOrderChange(order.id,{deliveredAt:event.target.value})}/></label>
        <label><span>סטטוס</span><select value={order.status==="לפי חוזה"?"ממתין לעדכון לקוח":order.status} onChange={event=>onOrderChange(order.id,{status:event.target.value,...(event.target.value==="סופק"&&!order.deliveredAt?{deliveredAt:new Date().toISOString().slice(0,10)}:{})})}>{statuses.map(value=><option key={value}>{value}</option>)}</select></label>
      </div></section>
      <section><h4>תשלום ומסמכים</h4><OrderFulfillmentControls order={order} onChange={onOrderChange}/></section>
      <section><h4>היסטוריה</h4><ol className="ob-timeline">
        {history.map(item=><li key={item.id}><strong>{item.summary}</strong><small>{item.actorName} · {formatDateTime(item.createdAt)}</small></li>)}
        {order.customerConfirmedAt&&<li><strong>הלקוח {isExtraOrder(order)?"ביקש השלמה":"אישר את ההזמנה"}</strong><small>{formatDateTime(order.customerConfirmedAt)}</small></li>}
        {order.createdAt&&<li><strong>ההזמנה נפתחה</strong><small>{formatDateTime(order.createdAt)}</small></li>}
      </ol></section>
    </>:row.sale&&<>
      <section><h4>פרטי המכירה</h4><div className="ob-fields">
        <label><span>תערובת</span><div className="readonly"><bdi>{row.sale.line.blendName}</bdi></div></label>
        <label><span>כמות</span><div className="readonly">{row.kg} ק״ג</div></label>
        <label><span>מחיר לק״ג</span><div className="readonly">{shekels(row.sale.line.pricePerKg)}</div></label>
      </div><p className="ob-note">את הכמות והמחיר עורכים בלשונית ״רווחיות״ בכרטיס הלקוח.</p></section>
      <section><h4>אספקה ותשלום</h4><AdditionalSaleFulfillment sale={row.sale.line} locked={row.sale.locked} onChange={patch=>onSaleChange(row.sale!.recordId,row.sale!.line.id,patch)}/></section>
    </>}
  </aside></div>;
}
/**
 * Approved quantity of an order. Typing stays in the field and is saved when
 * the field is left or Enter is pressed: saving on every key wrote each digit
 * to the database, showed a message per key, and an emptied field jumped back
 * to the requested quantity, so a new number could not be typed.
 */
function OrderKgInput({order,small=false,onChange}:{order:Order;small?:boolean;onChange:(id:string,data:Partial<Order>)=>void}) {
  const saved=Math.round(order.approvedKg||order.requestedKg);
  const [text,setText]=useState(String(saved));
  const [shown,setShown]=useState(saved);
  if(shown!==saved){setShown(saved);setText(String(saved));}
  const commit=()=>{const kg=Math.round(Number(text));if(text.trim()===""||!Number.isFinite(kg)||kg<0){setText(String(saved));return;}if(kg!==saved)onChange(order.id,{approvedKg:kg});};
  return <input className={`kg-input${small?" small":""}`} type="number" inputMode="numeric" min="0" step="1" aria-label="כמות מאושרת בק״ג" value={text} onChange={event=>setText(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();if(event.key==="Escape"){setText(String(saved));}}}/>;
}

/** Blend of a monthly order. Saved when the field is left, so typing does not write on every key. */
function OrderBlendInput({order,onChange}:{order:Order;onChange:(id:string,data:Partial<Order>)=>void}) {
  const commit=(value:string)=>{const blend=value.trim();if(blend&&blend!==order.blend)onChange(order.id,{blend});};
  return <input key={order.blend} className="order-blend-input" list={`order-blends-${order.accountId}`} defaultValue={order.blend==="טרם הוגדרה תערובת"?"":order.blend} placeholder="בחירת תערובת" aria-label="תערובת" onBlur={event=>commit(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/>;
}

function OrderFulfillmentControls({order,onChange}:{order:Order;onChange:(id:string,data:Partial<Order>)=>void}) {
  return <div className="order-fulfillment" aria-label="מעקב תשלום ומסמכים">
    <label><input type="checkbox" checked={Boolean(order.paid)} onChange={event=>onChange(order.id,{paid:event.target.checked})}/><span>שולם</span></label>
    <label><input type="checkbox" checked={Boolean(order.invoiceSent)} onChange={event=>onChange(order.id,{invoiceSent:event.target.checked})}/><span>חשבונית נשלחה</span></label>
    <label><input type="checkbox" checked={Boolean(order.deliveryNoteSent)} onChange={event=>onChange(order.id,{deliveryNoteSent:event.target.checked})}/><span>תעודת משלוח נשלחה</span></label>
  </div>;
}

/**
 * The customer confirms the month's order. The contract quantity is the
 * minimum: the same or more is confirmed right away; less goes to the office
 * for approval. Delivered and cancelled orders are read-only.
 */
/** "נגמר לי הקפה": a top-up order during the month, with the next contract delivery and this month's coffee in view. */
function ExtraOrderModal({customer,orders,onClose,onSubmit}:{customer:Customer;orders:Order[];onClose:()=>void;onSubmit:(order:Order)=>void}){
  const next=nextContractDelivery(customer.deliveryDayOfMonth||1,orders);
  const delivered=deliveredThisMonthKg(orders);
  const contractKg=Math.round(customer.monthlyKg||0);
  const blends=Array.from(new Set([...(customer.contractBlends||[]),...contractOrdersOnly(orders).map(item=>item.blend)].map(item=>item.trim()).filter(item=>item&&item!=="טרם הוגדרה תערובת")));
  const allowance=extraAllowanceKg(orders,contractKg,currentMonthKey());
  const [kg,setKg]=useState(Math.max(1,allowance.left)),[blend,setBlend]=useState(blends[0]||""),[note,setNote]=useState("");
  const [preference,setPreference]=useState<DeliveryPreference>("asap"),[date,setDate]=useState("");
  const tomorrow=(()=>{const d=new Date();d.setDate(d.getDate()+1);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);})();
  const error=validateExtraOrder({kg,preference,date,allowanceKg:allowance.left});
  const pending=openExtraOrders(orders);
  return <Modal title="נגמר לי הקפה" onClose={onClose}><form className="modal-form extra-order-form" onSubmit={event=>{event.preventDefault();if(error)return;onSubmit(newExtraOrder({accountId:customer.id,kg,blend,note,preference,date}));}}>
    <div className="extra-order-facts">
      <div><small>האספקה הבאה לפי החוזה</small><strong>{formatDate(next.date)}</strong><span>{next.days===0?"היום":next.days===1?"מחר":`בעוד ${next.days} ימים`}</span></div>
      <div><small>קיבלת החודש</small><strong>{Math.round(delivered)} ק״ג</strong><span>{contractKg?`מתוך ${contractKg} ק״ג בחוזה החודשי`:"לפי אספקות החודש"}</span></div>
    </div>
    {pending.length>0&&<p className="extra-order-warning">כבר יש לך הזמנת השלמה פתוחה של {Math.round(pending[0].requestedKg)} ק״ג.</p>}
    {allowance.left<=0?<><p className="extra-order-limit">{allowance.limit>0?`מכסת ההשלמה החודשית (${allowance.limit} ק״ג, 20% מהכמות בחוזה) נוצלה.`:"לחשבון שלך אין כמות חודשית בחוזה, ולכן אין אפשרות להזמין השלמה מכאן."} {CONTACT_OFFICE_MESSAGE}</p><footer><button type="button" className="primary" onClick={onClose}>הבנתי</button></footer></>:<>
    <p className="extra-order-allowance">אפשר להשלים עד <b>{allowance.left} ק״ג</b> החודש (20% מהכמות בחוזה). {CONTACT_OFFICE_MESSAGE}</p>
    <div className="form-grid">
      <label><span>כמה ק״ג להזמין?</span><div className="input-suffix"><input type="number" inputMode="numeric" min="1" max={Math.min(MAX_EXTRA_ORDER_KG,allowance.left)} step="1" value={kg||""} onChange={event=>setKg(Math.round(Number(event.target.value)))}/><b>ק״ג</b></div></label>
      <label><span>תערובת</span>{blends.length?<select value={blend} onChange={event=>setBlend(event.target.value)}>{blends.map(item=><option key={item}>{item}</option>)}</select>:<input value={blend} onChange={event=>setBlend(event.target.value)} placeholder="כמו בהזמנה הרגילה"/>}</label>
    </div>
    <fieldset className="extra-order-when"><legend>מתי לספק?</legend>{DELIVERY_PREFERENCES.map(([value,label])=><label key={value} className={preference===value?"active":""}><input type="radio" name="when" value={value} checked={preference===value} onChange={()=>setPreference(value)}/>{label}</label>)}</fieldset>
    {preference==="date"&&<label className="extra-order-date"><span>תאריך אספקה</span><input type="date" min={tomorrow} value={date} onChange={event=>setDate(event.target.value)}/></label>}
    <label className="extra-order-note"><span>הערה (לא חובה)</span><textarea rows={2} maxLength={500} value={note} onChange={event=>setNote(event.target.value)} placeholder="למשל: להשאיר בקבלה"/></label>
    {error&&kg>0&&<p className="extra-order-error">{error}</p>}
    <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={Boolean(error)}>שליחת הזמנה</button></footer>
    </>}
  </form></Modal>;
}

function OrderEditor({order,blends,deliveryDate,onSave}:{order:Order;blends:string[];deliveryDate:string;onSave:(id:string,d:Partial<Order>)=>void}) {
  const [kg,setKg]=useState(Math.round(order.requestedKg)),[blend,setBlend]=useState(order.blend),[note,setNote]=useState(order.note);
  const allowedBlends=Array.from(new Set([...blends,order.blend].map(item=>item.trim()).filter(item=>item&&item!=="טרם הוגדרה תערובת")));
  const contract=Math.round(order.defaultKg);
  const below=contract>0&&kg<contract;
  const closed=["בהכנה","סופק","בוטל"].includes(order.status);
  const valid=Number.isInteger(kg)&&kg>0&&kg<=10000;
  const save=()=>{
    const customerConfirmedAt=new Date().toISOString();
    onSave(order.id,below
      ?{requestedKg:kg,blend,note,status:"ממתין לאישור",customerConfirmedAt}
      :{requestedKg:kg,approvedKg:kg,blend,note,status:"אושר",customerConfirmedAt});
  };
  const state=order.status==="בהכנה"?<div className="order-confirm-state done">📦 ההזמנה בהכנה: {Math.round(order.approvedKg||order.requestedKg)} ק״ג. לשינוי יש לפנות למשרד.</div>
    :closed?null
    :order.status==="ממתין לאישור"?<div className="order-confirm-state pending">⏳ הבקשה ל־{Math.round(order.requestedKg)} ק״ג נשלחה לאישור המנהל, כי היא נמוכה מהחוזה.</div>
    :order.customerConfirmedAt&&order.status==="אושר"?<div className="order-confirm-state done">✓ ההזמנה אושרה: {Math.round(order.approvedKg||order.requestedKg)} ק״ג. אפשר לעדכן עד מועד האספקה.</div>
    :<div className="order-confirm-state todo">יש לאשר את ההזמנה לאספקה ב־{formatDate(deliveryDate)}. לפי החוזה {contract} ק״ג; אפשר להזמין יותר.</div>;
  return <section className="panel form-panel">{state}<div className="form-grid"><label><span>כמות לפי החוזה (מינימום)</span><div className="readonly">{contract} ק״ג</div></label><label><span>כמות להזמנה</span><div className="input-suffix"><input type="number" inputMode="numeric" min={1} step={1} value={kg} disabled={closed} onChange={e=>setKg(Math.round(+e.target.value))}/><b>ק״ג</b></div></label><label><span>תערובת לפי החוזה</span>{allowedBlends.length?<select value={blend} disabled={closed} onChange={e=>setBlend(e.target.value)}>{allowedBlends.map(b=><option key={b}>{b}</option>)}</select>:<div className="readonly">יש לפנות למנהל לעדכון התערובות בחוזה</div>}</label><label className="full"><span>הערה להזמנה</span><textarea placeholder="הערה לחלוקה, אספקה או תערובת" value={note} disabled={closed} onChange={e=>setNote(e.target.value)}/></label></div>{below&&!closed&&<div className="warning">⚠ הכמות נמוכה מהחוזה ({contract} ק״ג). ההזמנה תעבור לאישור המנהל.</div>}{!closed&&<div className="form-actions"><button className="primary" disabled={!allowedBlends.length||!valid} onClick={save}>{below?"שליחה לאישור המנהל":order.customerConfirmedAt?"עדכון ההזמנה":"אישור ההזמנה"}</button></div>}</section>
}

function Tasks({tasks,onCreate,onStatus}:{tasks:Task[];onCreate:()=>void;onStatus:(id:string,s:string)=>void}) {
  const customerName=useCustomerName();
  return <><SectionTitle title="משימות" action={<button className="primary" onClick={onCreate}>＋ משימה חדשה</button>}/><div className="kanban">{["פתוחה","בטיפול","בוצעה","בוטלה"].map(col=><section key={col}><header><h3>{col}</h3><span>{tasks.filter(t=>t.status===col).length}</span></header>{tasks.filter(t=>t.status===col).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(t=><div className="task-card" key={t.id}><div><Badge>{t.priority}</Badge><span>{t.type}{t.autoGenerated?" · אוטומטי":""}</span></div><h4>{t.title}</h4><p>{customerName(t.accountId)}</p><footer><span>{t.assignedTo}</span><time>{formatDate(t.dueDate)}</time></footer><select value={t.status} onChange={e=>onStatus(t.id,e.target.value)}><option>פתוחה</option><option>בטיפול</option><option>בוצעה</option><option>בוטלה</option></select></div>)}</section>)}</div></>
}

function Reports({store,customers,users}:{store:Store;customers:Customer[];users:UserProfile[]}) {
  const [reportTimestamp]=useState(()=>Date.now());
  const openTickets=store.tickets.filter(ticket=>!closed(ticket.status));
  const closedTickets=store.tickets.filter(ticket=>closed(ticket.status));
  const slaTickets=store.tickets.filter(ticket=>ticket.resolutionDueAt);
  const withinSla=slaTickets.filter(ticket=>closed(ticket.status)?Boolean(ticket.closedAt&&new Date(ticket.closedAt)<=new Date(ticket.resolutionDueAt!)):!slaBreached(ticket)).length;
  const slaRate=slaTickets.length?Math.round(withinSla/slaTickets.length*100):100;
  const resolutionHours=closedTickets.filter(ticket=>ticket.closedAt).map(ticket=>(new Date(ticket.closedAt!).getTime()-new Date(ticket.openedAt).getTime())/3_600_000);
  const averageResolution=resolutionHours.length?Math.round(resolutionHours.reduce((sum,value)=>sum+value,0)/resolutionHours.length*10)/10:0;
  const repeatMachines=new Map<string,number>();
  store.tickets.filter(ticket=>ticket.machineId).forEach(ticket=>repeatMachines.set(ticket.machineId,(repeatMachines.get(ticket.machineId)||0)+1));
  const repeatCount=[...repeatMachines.values()].filter(count=>count>1).length;
  const contractsDue=customers.filter(customer=>customer.contractEnd&&new Date(customer.contractEnd).getTime()-reportTimestamp<=60*86400000&&new Date(customer.contractEnd).getTime()>=reportTimestamp).length;
  const overdueMachines=store.machines.filter(machine=>machine.nextService&&new Date(machine.nextService).getTime()<reportTimestamp).length;
  const technicians=users.filter(user=>user.status==="active"&&user.role==="service");
  return <><SectionTitle title="תובנות ודוחות" sub="מדדים המחושבים מנתוני הפעילות בזמן אמת"/><div className="kpi-grid"><Kpi label="עמידה ב־SLA" value={`${slaRate}%`} meta={`${withinSla} מתוך ${slaTickets.length} קריאות`} tone={slaRate<85?"red":"default"}/><Kpi label="זמן פתרון ממוצע" value={`${averageResolution} ש׳`} meta="קריאות שנסגרו" tone="blue"/><Kpi label="קריאות פתוחות" value={openTickets.length} meta={`${openTickets.filter(slaBreached).length} בחריגה`} tone={openTickets.some(slaBreached)?"red":"blue"}/><Kpi label="מכונות עם תקלה חוזרת" value={repeatCount} meta="יותר מקריאה אחת" tone="orange"/><Kpi label="טיפולים באיחור" value={overdueMachines} meta="לפי מועד הטיפול הבא" tone={overdueMachines?"red":"default"}/><Kpi label="חוזים לחידוש" value={contractsDue} meta="ב־60 הימים הקרובים" tone="orange"/><Kpi label="צריכה חודשית מוסכמת" value={`${customers.reduce((sum,customer)=>sum+(customer.monthlyKg||0),0)} ק״ג`} meta={`${customers.length} לקוחות`}/><Kpi label="לקוחות בסיכון" value={customers.filter(customer=>riskReasons(customer,store).length).length} meta="לפי שירות, חוזה והזמנות" tone="red"/></div><div className="dashboard-grid"><section className="panel wide"><div className="panel-head"><div><h3>עומס צוות השירות</h3><p>קריאות פעילות וסגורות לפי איש צוות</p></div></div>{technicians.length?<div className="report-team-list">{technicians.map(user=>{const assigned=store.tickets.filter(ticket=>ticket.assignedUid===user.uid);return <div key={user.uid}><span className="customer-avatar">{(user.displayName||user.email).slice(0,2)}</span><div><strong>{user.displayName||user.email}</strong><small>{assigned.filter(ticket=>!closed(ticket.status)).length} פתוחות · {assigned.filter(ticket=>closed(ticket.status)).length} נסגרו</small></div><Badge>{assigned.filter(ticket=>!closed(ticket.status)&&slaBreached(ticket)).length} חריגות</Badge></div>})}</div>:<div className="inline-empty">לא הוגדרו עדיין משתמשי צוות שירות.</div>}</section><section className="panel"><div className="panel-head"><div><h3>לקוחות הדורשים תשומת לב</h3><p>הסיבה המרכזית לכל לקוח</p></div></div>{customers.filter(customer=>riskReasons(customer,store).length).slice(0,6).map(customer=><div className="risk-row" key={customer.id}><span className="customer-avatar">{customer.name.slice(0,2)}</span><div><strong>{customer.name}</strong><small>{riskReasons(customer,store)[0]}</small></div></div>)}</section></div></>;
}

function Contract({customer,machines}:{customer:Customer;machines:Machine[]}) {return <><SectionTitle title="פרטי אספקה וציוד"/><section className="panel contract"><div className="contract-head"><span className="contract-icon">▤</span><div><span>נתונים תפעוליים</span><h2>{customer.name}</h2></div></div><dl><div><dt>סיום התקופה</dt><dd>{formatDate(customer.contractEnd)}</dd></div><div><dt>כמות חודשית מוסכמת</dt><dd>{customer.monthlyKg||0} ק״ג</dd></div><div><dt>מכונות משויכות</dt><dd>{machines.length} פריטי ציוד</dd></div><div><dt>תערובות מאושרות</dt><dd>{customer.contractBlends?.join(", ")||"טרם הוגדרו"}</dd></div><div><dt>יום אספקה קבוע</dt><dd>{customer.deliveryDayOfMonth||1} בחודש</dd></div></dl></section></>}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {useEffect(()=>{document.body.classList.add("dialog-open");return()=>document.body.classList.remove("dialog-open");},[]);return <div className="modal-backdrop" {...backdropDismiss(onClose)}><div className="modal"><header><h2>{title}</h2><button onClick={onClose}>×</button></header>{children}</div></div>}
function MachineEditorModal({machine,accountId,customers,onClose,onSave}:{machine?:Machine;accountId:string;customers:Customer[];onClose:()=>void;onSave:(machine:Machine)=>void}) {
  const [draft,setDraft]=useState<Machine>(()=>machine?{...machine}:{id:createId("machine"),accountId:accountId||customers[0]?.id||"",site:"",model:"",serial:"",status:"בהקמה",commercial:"השכרה",location:"",lastService:"",nextService:"",waterSystem:"none",monthlyRent:0});
  const update=<K extends keyof Machine>(key:K,value:Machine[K])=>setDraft(current=>({...current,[key]:value}));
  const submit=(event:FormEvent)=>{event.preventDefault();if(!draft.accountId||!draft.model.trim()||!draft.serial.trim())return;onSave({...draft,model:draft.model.trim(),serial:draft.serial.trim(),updatedAt:new Date().toISOString()});};
  return <Modal title={machine?"עריכת מכונה וציוד":"הוספת מכונה"} onClose={onClose}><form className="modal-form machine-editor" onSubmit={submit}>
    <div className="machine-form-section"><h3>זיהוי ומיקום</h3><div className="form-grid">
      <label><span>לקוח</span><select value={draft.accountId} onChange={e=>update("accountId",e.target.value)} required><option value="">בחירת לקוח</option>{customers.map(customer=><option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
      <label><span>דגם / סוג מכונה</span><input value={draft.model} onChange={e=>update("model",e.target.value)} required/></label>
      <label><span>מספר סידורי</span><input value={draft.serial} onChange={e=>update("serial",e.target.value)} required/></label>
      <label><span>סניף</span><input value={draft.site} onChange={e=>update("site",e.target.value)}/></label>
      <label><span>קומה</span><input value={draft.floor||""} onChange={e=>update("floor",e.target.value)}/></label>
      <label><span>מיקום מדויק</span><input value={draft.location} onChange={e=>update("location",e.target.value)} placeholder="מטבחון, אגף או חדר"/></label>
      <label><span>סטטוס</span><select value={draft.status} onChange={e=>update("status",e.target.value)}>{["בהקמה","פעילה","דורשת טיפול","מושבתת","בהחלפה","הוחזרה"].map(value=><option key={value}>{value}</option>)}</select></label>
      <label><span>מודל מסחרי</span><select value={["ללא עלות","מכירה","השכרה"].includes(draft.commercial)?draft.commercial:"ללא עלות"} onChange={e=>update("commercial",e.target.value)}><option>ללא עלות</option><option>מכירה</option><option>השכרה</option></select></label>
    </div></div>
    <div className="machine-form-section"><h3>התקנה, מים ותחזוקה</h3><div className="form-grid">
      <label><span>תאריך התקנת מכונה</span><input type="date" value={draft.installedAt?.slice(0,10)||""} onChange={e=>update("installedAt",e.target.value)}/></label>
      <label><span>מערכת מים</span><select value={draft.waterSystem||"none"} onChange={e=>update("waterSystem",e.target.value as Machine["waterSystem"])}><option value="none">ללא</option><option value="filter">פילטר</option><option value="osmosis">אוסמוזה</option><option value="filter_and_osmosis">פילטר ואוסמוזה</option></select></label>
      <label><span>תאריך התקנת פילטר / אוסמוזה</span><input type="date" value={draft.waterSystemInstalledAt?.slice(0,10)||""} onChange={e=>update("waterSystemInstalledAt",e.target.value)}/></label>
      <label><span>החלפת פילטר אחרונה</span><input type="date" value={draft.lastFilterReplacementAt?.slice(0,10)||""} onChange={e=>update("lastFilterReplacementAt",e.target.value)}/></label>
      <label><span>מועד החלפת פילטר הבא</span><input type="date" min={draft.waterSystemInstalledAt?.slice(0,10)||undefined} value={draft.filterReplacementDue?.slice(0,10)||""} onChange={e=>update("filterReplacementDue",e.target.value)}/><small>המשימה תיפתח אוטומטית 14 ימים לפני מועד ההחלפה.</small></label>
      <label><span>טיפול הבא</span><input type="date" value={draft.nextService?.slice(0,10)||""} onChange={e=>update("nextService",e.target.value)}/></label>
    </div></div>
    <div className="machine-form-section"><h3>שכירות למכונה זו</h3><div className="form-grid">
      <label><span>תחילת שכירות</span><input type="date" value={draft.rentalStart?.slice(0,10)||""} onChange={e=>update("rentalStart",e.target.value)}/></label>
      <label><span>סיום שכירות</span><input type="date" min={draft.rentalStart?.slice(0,10)||undefined} value={draft.rentalEnd?.slice(0,10)||""} onChange={e=>update("rentalEnd",e.target.value)}/></label>
      <label><span>שכירות חודשית</span><input type="number" min="0" value={draft.monthlyRent||0} onChange={e=>update("monthlyRent",+e.target.value)}/></label>
    </div></div>
    <div className="form-actions"><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">שמירת פרטי המכונה</button></div>
  </form></Modal>;
}
function PasswordSetupModal({email,onClose,onSave}:{email:string;onClose:()=>void;onSave:(password:string)=>Promise<void>}) {
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const securityError=passwordSecurityError(password);
    if(securityError){setError(securityError);return;}
    if(password!==confirmation){setError("הסיסמאות אינן זהות.");return;}
    setBusy(true);setError("");
    try{await onSave(password);}catch(nextError){setError(firebaseMessage(nextError));setBusy(false);}
  };
  return <Modal title="הגדרת כניסה עם סיסמה" onClose={onClose}><form className="modal-form password-setup" onSubmit={submit}>
    <div className="password-setup-note"><KeyRound size={20}/><div><strong>אפשרות כניסה נוספת</strong><p>לאחר ההגדרה יהיה אפשר להתחבר לאותו חשבון גם באמצעות Google וגם באמצעות מייל וסיסמה.</p></div></div>
    <label><span>כתובת המייל</span><input type="email" value={email} disabled/></label>
    <label><span>סיסמה חדשה</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={12} required autoComplete="new-password" placeholder="12 תווים, כולל אות ומספר"/></label>
    <label><span>אימות הסיסמה</span><input type="password" value={confirmation} onChange={event=>setConfirmation(event.target.value)} minLength={12} required autoComplete="new-password" placeholder="הקלדה חוזרת"/></label>
    {error&&<div className="auth-error">{error}</div>}
    <footer><button type="button" onClick={onClose} disabled={busy}>ביטול</button><button className="primary" type="submit" disabled={busy}>{busy?"מגדיר…":"הפעלת כניסה עם סיסמה"}</button></footer>
  </form></Modal>;
}
/** One answer out of a few, as buttons; nothing is chosen until the customer picks. */
function ChoiceGroup({label,options,value,onChange,required=false,tone}:{label:string;options:readonly string[];value:string;onChange:(value:string)=>void;required?:boolean;tone?:(option:string)=>string}) {
  return <fieldset className="choice-group"><legend>{label}{required&&<b aria-hidden="true"> *</b>}</legend><div role="radiogroup" aria-label={label} aria-required={required}>{options.map(option=><button type="button" role="radio" aria-checked={value===option} key={option} className={`${value===option?"active":""} ${tone?.(option)||""}`} onClick={()=>onChange(option)}>{option}</button>)}</div></fieldset>;
}

/** Shown the moment a danger sign is chosen, before anything is sent. */
function SafetyAlert({unsure}:{unsure:boolean}) {
  return <div className="safety-alert" role="alert"><strong>⚠️ {unsure?"אם יש ספק, התייחסו לזה כסכנה":"זהו מצב שדורש טיפול בטיחותי"}</strong><ul><li>אם אפשר לעשות זאת בבטחה, נתקו את המכונה מהחשמל. אל תגעו במכונה או במים שסביבה כשהיא מחוברת.</li><li>אל תנסו להפעיל או לתקן את המכונה.</li><li>בעשן, אש או פגיעה באדם, חייגו מיד <a href="tel:102">102</a>.</li></ul><a className="safety-call" href={EMERGENCY_PHONE_LINK}>📞 התקשרו אלינו עכשיו: {EMERGENCY_PHONE}</a><small>הקריאה תסומן לטיפול בטיחותי. אפשר להמשיך ולשלוח אותה, אבל אל תחכו לתשובה בכתב.</small></div>;
}

function TicketModal({customers,accountId,allowAccountChange,preselectedMachine,machines,onClose,onSave}:{customers:Customer[];accountId:string;allowAccountChange:boolean;preselectedMachine:string;machines:Machine[];onClose:()=>void;onSave:(t:Ticket)=>void}) {
  const [activeAccount,setActiveAccount]=useState(accountId);
  const customer=customers.find(c=>c.id===activeAccount)||customers[0]; const available=machines.filter(m=>m.accountId===customer.id);
  const [type,setType]=useState("");
  const [intake,setIntake]=useState<Partial<TicketIntake>>({});
  const [missing,setMissing]=useState<string[]>([]);
  const answer=(key:keyof TicketIntake)=>(value:string)=>{setIntake(current=>({...current,[key]:value}));setMissing([]);};
  const hazard=isSafetyHazard({safety:intake.safety||""},type);
  const unsure=!hazard&&intake.safety===SAFETY_UNSURE;
  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    const gaps=missingIntake(intake,type);
    if(gaps.length){setMissing(gaps);return;}
    const f=new FormData(e.currentTarget),machineId=String(f.get("machine"));
    const answers:TicketIntake={
      safety:intake.safety||"",safetyReview:needsSafetyReview({safety:intake.safety||""},type),impact:intake.impact||"",startedWhen:intake.startedWhen||"",
      ...(intake.startedAt?{startedAt:intake.startedAt}:{}),screen:intake.screen||"",
      ...(intake.screen===SCREEN_YES?{screenMessage:(intake.screenMessage||"").trim().slice(0,500)}:{}),recurrence:intake.recurrence||"",
    };
    const urgency=urgencyForIntake(answers,type);
    const openedAt=new Date();
    const ticketId=createId("SR").toUpperCase();
    const deadlines=calculateTicketDeadlines(customer,urgency,openedAt);
    onSave({id:ticketId,accountId:customer.id,site:String(f.get("site")),machineId,type,urgency,status:"התקבלה",description:String(f.get("description")),contact:String(f.get("contact")),phone:String(f.get("phone")),assignedTo:"טרם הוקצה",assignedUid:"",openedAt:openedAt.toISOString(),updatedAt:openedAt.toISOString(),...deadlines,intake:answers,attachments:[],events:[{id:createId("event"),type:"created",label:answers.safetyReview?"קריאת השירות נפתחה · סומנה לטיפול בטיחותי":"קריאת השירות נפתחה",createdAt:openedAt.toISOString(),createdBy:String(f.get("contact"))||"לקוח",visibleToCustomer:true}]});
  };
  return <Modal title="פתיחת קריאת שירות" onClose={onClose}>
    <form onSubmit={submit} className="modal-form ticket-intake" noValidate>
      {allowAccountChange?<label className="account-picker"><span>לקוח</span><select value={activeAccount} onChange={e=>setActiveAccount(e.target.value)}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:<div className="customer-context"><span className="customer-avatar">{customer.name.slice(0,2)}</span><div><small>עבור</small><strong>{customer.name}</strong></div></div>}
      <ChoiceGroup label="האם יש סימן לסכנה?" required options={SAFETY_OPTIONS} value={intake.safety||""} onChange={answer("safety")} tone={option=>option===SAFETY_NONE?"":option===SAFETY_UNSURE?"caution":"danger"}/>
      {(hazard||unsure)&&<SafetyAlert unsure={unsure}/>}
      <div className="form-grid">
        <label><span>סניף</span><select name="site" required key={`site-${activeAccount}`}>{customer.branches.map(b=><option key={b}>{b}</option>)}</select></label>
        <label><span>מכונה</span><select name="machine" defaultValue={preselectedMachine} key={`machine-${activeAccount}`}><option value="">בעיה כללית</option>{available.map(m=><option key={m.id} value={m.id}>{m.model} · {m.serial}</option>)}</select></label>
        <label className="full"><span>סוג התקלה *</span><select value={type} onChange={e=>{setType(e.target.value);setMissing([]);}}><option value="" disabled>בחירת סוג התקלה</option>{TICKET_FAULT_TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      <ChoiceGroup label="השפעה על הפעילות" required options={IMPACT_OPTIONS} value={intake.impact||""} onChange={answer("impact")}/>
      <ChoiceGroup label="מתי התחילה התקלה?" required options={STARTED_OPTIONS} value={intake.startedWhen||""} onChange={answer("startedWhen")}/>
      <label className="optional-field"><span>שעה או תאריך מדויקים (רשות)</span><input type="datetime-local" value={intake.startedAt||""} max={new Date().toISOString().slice(0,16)} onChange={e=>setIntake(current=>({...current,startedAt:e.target.value}))}/></label>
      <ChoiceGroup label="האם מופיעה הודעה על המסך?" required options={SCREEN_OPTIONS} value={intake.screen||""} onChange={answer("screen")}/>
      {intake.screen===SCREEN_YES&&<label className="optional-field"><span>מה כתוב על המסך? *</span><input maxLength={500} value={intake.screenMessage||""} onChange={e=>{setIntake(current=>({...current,screenMessage:e.target.value}));setMissing([]);}} placeholder="העתיקו את ההודעה או הקוד בדיוק כפי שהם מופיעים"/><small>אין צורך לפרש את הקוד. הנוסח המדויק עדיף על ניחוש.</small></label>}
      <ChoiceGroup label="האם התקלה חזרה?" required options={RECURRENCE_OPTIONS} value={intake.recurrence||""} onChange={answer("recurrence")}/>
      <div className="form-grid">
        <label className="full"><span>פירוט נוסף</span><textarea name="description" rows={5} maxLength={5000} placeholder="מה קרה, מה כבר ניסיתם, ומה עוד חשוב שהטכנאי ידע"/></label>
        <label><span>איש קשר</span><input name="contact" maxLength={160} key={`contact-${activeAccount}`} defaultValue={customer.contactName}/></label>
        <label><span>טלפון לחזרה</span><input name="phone" maxLength={40} key={`phone-${activeAccount}`} defaultValue={customer.phone}/></label>
      </div>
      {missing.length>0&&<div className="auth-error" role="alert">יש להשלים: {missing.join(" · ")}</div>}
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">{hazard||unsure?"שליחה כקריאה בטיחותית":"פתיחת הקריאה"}</button></footer>
    </form>
  </Modal>
}
function TaskModal({customers,staffUsers,accountId,onClose,onSave}:{customers:Customer[];staffUsers:UserProfile[];accountId:string;onClose:()=>void;onSave:(t:Task)=>void}) {
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),assignedUid=String(f.get("assignee")),assignee=staffUsers.find(user=>user.uid===assignedUid),createdAt=new Date().toISOString();onSave({id:createId("task"),accountId:String(f.get("account")),title:String(f.get("title")),type:String(f.get("type")),dueDate:String(f.get("date")),priority:String(f.get("priority")),status:"פתוחה",assignedUid,assignedTo:assignee?.displayName||"טרם הוקצה",createdAt,updatedAt:createdAt})};
  return <Modal title="יצירת משימה" onClose={onClose}><form onSubmit={submit} className="modal-form"><div className="form-grid"><label className="full"><span>כותרת המשימה</span><input name="title" required placeholder="מה צריך לבצע?"/></label><label><span>לקוח</span><select name="account" defaultValue={accountId}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span>סוג</span><select name="type"><option>שירות</option><option>הזמנה</option><option>מכונה</option><option>חוזה</option><option>שימור</option><option>הקמת לקוח</option><option>כללי</option></select></label><label><span>תאריך יעד</span><input type="date" name="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><label><span>עדיפות</span><select name="priority"><option>נמוכה</option><option>בינונית</option><option>גבוהה</option></select></label><label className="full"><span>אחראי</span><select name="assignee"><option value="">טרם הוקצה</option>{staffUsers.map(user=><option value={user.uid} key={user.uid}>{user.displayName||user.email}</option>)}</select></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">יצירת משימה</button></footer></form></Modal>;
}
function CloseModal({onClose,onSave}:{onClose:()=>void;onSave:(reason:string,summary:string,parts:string[],confirmedBy:string)=>void}) {
  const [reason,setReason]=useState(""),[summary,setSummary]=useState(""),[parts,setParts]=useState(""),[confirmedBy,setConfirmedBy]=useState("");
  return <Modal title="סגירת קריאה" onClose={onClose}><div className="modal-form"><p>כדי לסגור את הקריאה חובה לתעד את תוצאת הטיפול.</p><label><span>סיבת סגירה</span><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">בחירת סיבה</option><option>התקלה טופלה</option><option>הוחלף חלק</option><option>בוצעה הדרכה</option><option>לא נמצאה תקלה</option><option>בוטל על ידי הלקוח</option></select></label><label><span>סיכום עבודה</span><textarea required value={summary} onChange={event=>setSummary(event.target.value)} placeholder="מה בוצע ומה נבדק?"/></label><label><span>חלקים שהוחלפו</span><input value={parts} onChange={event=>setParts(event.target.value)} placeholder="הפרדה בפסיקים, אם הוחלפו"/></label><label><span>אישור הלקוח באתר</span><input value={confirmedBy} onChange={event=>setConfirmedBy(event.target.value)} placeholder="שם המאשר — אופציונלי"/></label><footer><button onClick={onClose}>ביטול</button><button className="danger-btn" disabled={!reason||!summary.trim()} onClick={()=>onSave(reason,summary,parts.split(",").map(item=>item.trim()).filter(Boolean),confirmedBy.trim())}>סגירת הקריאה</button></footer></div></Modal>;
}

function CustomerEditorModal({customer,onClose,onSave,onDelete,errorMessage}:{customer:Customer;onClose:()=>void;onSave:(customer:Customer)=>Promise<void>;onDelete?:(customer:Customer)=>Promise<void>;errorMessage:(error:unknown)=>string}) {
  const [confirmName,setConfirmName]=useState(""),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState("");
  const remove=async()=>{if(!onDelete||confirmName.trim()!==customer.name.trim())return;if(!window.confirm(`למחוק לצמיתות את ${customer.name}? אי אפשר לבטל את הפעולה.`))return;setDeleting(true);setDeleteError("");try{await onDelete(customer);}catch(error){setDeleteError(errorMessage(error));}finally{setDeleting(false);}};
  const [draft,setDraft]=useState(customer),[branches,setBranches]=useState(customer.branches.join("\n")),[blends,setBlends]=useState((customer.contractBlends||[]).join("\n")),[saving,setSaving]=useState(false);
  const update=<K extends keyof Customer>(key:K,value:Customer[K])=>setDraft(current=>({...current,[key]:value}));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);try{await onSave({...draft,deliveryDayOfMonth:Math.min(28,Math.max(1,draft.deliveryDayOfMonth||1)),branches:branches.split("\n").map(item=>item.trim()).filter(Boolean),contractBlends:Array.from(new Set(blends.split("\n").map(item=>item.trim()).filter(Boolean)))});}finally{setSaving(false);}};
  return <Modal title={`עריכת לקוח · ${customer.name}`} onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>שם הלקוח</span><input required value={draft.name} onChange={event=>update("name",event.target.value)}/></label><label><span>סטטוס</span><select value={draft.status} onChange={event=>update("status",event.target.value)}><option>בהקמה</option><option>פעיל</option><option>בסיכון</option><option>בהשהיה</option></select></label><label><span>איש קשר</span><input value={draft.contactName} onChange={event=>update("contactName",event.target.value)}/></label><label><span>טלפון</span><input value={draft.phone} onChange={event=>update("phone",event.target.value)}/></label><label><span>דוא״ל</span><input type="email" value={draft.email} onChange={event=>update("email",event.target.value)}/></label><label><span>מנהל לקוח</span><input value={draft.owner} onChange={event=>update("owner",event.target.value)}/></label><label><span>עיר</span><input value={draft.city} onChange={event=>update("city",event.target.value)}/></label><label><span>כתובת</span><input value={draft.address} onChange={event=>update("address",event.target.value)}/></label><label><span>ק״ג חודשי</span>{customer.commercialAgreement?<><div className="readonly">{draft.monthlyKg} ק״ג</div><small>לפי ההסכם המסחרי. משנים בלשונית „חוזה והצעות”.</small></>:<input type="number" min="0" value={draft.monthlyKg} onChange={event=>update("monthlyKg",Number(event.target.value))}/>}</label><label><span>יום אספקה קבוע בחודש</span><input type="number" min="1" max="28" value={draft.deliveryDayOfMonth||1} onChange={event=>update("deliveryDayOfMonth",Number(event.target.value))}/></label><label><span>תחילת הסכם</span><input type="date" value={draft.contractStart||""} onChange={event=>update("contractStart",event.target.value)}/></label><label><span>סיום הסכם</span><input type="date" value={draft.contractEnd} onChange={event=>update("contractEnd",event.target.value)}/></label><label><span>זמן תגובה SLA (שעות)</span><input type="number" min="1" value={draft.slaResponseHours||4} onChange={event=>update("slaResponseHours",Number(event.target.value))}/></label><label><span>זמן פתרון SLA (שעות)</span><input type="number" min="1" value={draft.slaResolutionHours||24} onChange={event=>update("slaResolutionHours",Number(event.target.value))}/></label><label><span>קליטת לקוח</span><select value={draft.onboardingStatus||"בהקמה"} onChange={event=>update("onboardingStatus",event.target.value as Customer["onboardingStatus"])}><option>טרם התחיל</option><option>בהקמה</option><option>מוכן להפעלה</option><option>הושלם</option></select></label><label className="full"><span>תערובות בחוזה — שורה לכל תערובת</span><textarea value={blends} onChange={event=>setBlends(event.target.value)} placeholder="לדוגמה: EMERALD"/></label><label className="full"><span>סניפים — שורה לכל סניף</span><textarea value={branches} onChange={event=>setBranches(event.target.value)}/></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving}>{saving?"שומר…":"שמירת לקוח"}</button></footer></form>{onDelete&&<section className="customer-delete-zone"><h4>מחיקת כרטיס לקוח</h4><p>המחיקה מסירה את כרטיס הלקוח יחד עם המכונות, קריאות השירות, ההזמנות, המשימות, נתוני הרווחיות והטעימות שלו, ומבטלת את הגישה של משתמשי הלקוח. הצעות המחיר והלידים נשארים בהיסטוריה ומנותקים מהכרטיס. אי אפשר לבטל את הפעולה.</p><label><span>כדי לאשר, הקלידו את שם הלקוח: <b>{customer.name}</b></span><input value={confirmName} onChange={event=>setConfirmName(event.target.value)} autoComplete="off"/></label>{deleteError&&<p role="alert">{deleteError}</p>}<button type="button" className="danger-btn" disabled={deleting||confirmName.trim()!==customer.name.trim()} onClick={()=>void remove()}>{deleting?"מוחק…":"מחיקת הלקוח לצמיתות"}</button></section>}</Modal>;
}

function NewCustomerModal({onClose,onSave}:{onClose:()=>void;onSave:(customer:Customer)=>Promise<void>}) {
  const [saving,setSaving]=useState(false),[model,setModel]=useState<CommercialAgreementModel>("beans_only");
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget),createdAt=new Date().toISOString(),name=String(form.get("name")||"").trim(),branch=String(form.get("branch")||"").trim()||"סניף ראשי",packageCount=Math.max(1,Number(form.get("packageCount"))||1),includedKg=Number(form.get("includedKg"))||0,monthlyBeanKg=model==="monthly_package"?packageCount*includedKg:Number(form.get("monthlyKg"))||0;const commercialAgreement:CommercialAgreement={...emptyCommercialAgreement(createdAt),model,status:"active",effectiveFrom:String(form.get("contractStart")||""),effectiveTo:String(form.get("contractEnd")||""),monthlyBeanKg,beanCostPerKg:Number(form.get("beanCost"))||0,beanPricePerKg:Number(form.get("beanPrice"))||0,packageCount,packageMonthlyFee:Number(form.get("packageFee"))||0,packageIncludedKgPerUnit:includedKg,extraKgPrice:Number(form.get("extraKgPrice"))||0,monthlyRentalIncome:Number(form.get("rentalIncome"))||0,monthlyServiceIncome:Number(form.get("serviceIncome"))||0,oneTimeEquipmentIncome:Number(form.get("equipmentSaleIncome"))||0,oneTimeEquipmentIncomeMonth:String(form.get("equipmentSaleMonth")||""),updatedAt:createdAt};const customer:Customer={id:createId("customer"),name,status:"בהקמה",rank:String(form.get("rank")||"רגיל"),contactName:String(form.get("contact")||""),phone:String(form.get("phone")||""),email:String(form.get("email")||""),city:String(form.get("city")||""),address:String(form.get("address")||""),owner:String(form.get("owner")||""),monthlyKg:monthlyBeanKg,contractEnd:commercialAgreement.effectiveTo||"",contractStart:commercialAgreement.effectiveFrom||"",serviceLevel:"",branches:[branch],contractBlends:[],deliveryDayOfMonth:1,conversionType:"manual",onboardingStatus:"בהקמה",slaResponseHours:4,slaResolutionHours:24,notes:[],commercialAgreement,createdAt};setSaving(true);try{await onSave(customer);}finally{setSaving(false);}};
  return <Modal title="הקמת לקוח חדש" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="password-setup-note"><Building2 size={20}/><div><strong>הקמת לקוח והסכם מסחרי</strong><p>פרטי ההסכם שיוזנו כאן ישמשו אוטומטית לחישובי המכירות והרווחיות.</p></div></div><div className="form-grid"><label><span>שם הלקוח</span><input name="name" required/></label><label><span>דירוג</span><select name="rank"><option>רגיל</option><option>זהב</option><option>אסטרטגי</option></select></label><label><span>איש קשר</span><input name="contact"/></label><label><span>טלפון</span><input name="phone"/></label><label><span>דוא״ל</span><input type="email" name="email"/></label><label><span>מנהל לקוח</span><input name="owner" defaultValue="מנהל המערכת"/></label><label><span>עיר</span><input name="city"/></label><label><span>כתובת</span><input name="address"/></label><label><span>סניף ראשון</span><input name="branch" defaultValue="סניף ראשי"/></label><label><span>סוג ההסכם</span><select value={model} onChange={event=>setModel(event.target.value as CommercialAgreementModel)}><option value="beans_only">מכירת פולים בלבד</option><option value="equipment_rental">השכרת מכונות ופולים</option><option value="equipment_sale">מכירת מכונות ופולים</option><option value="monthly_package">חבילה חודשית — מכונה, שירות ופולים</option><option value="mixed">הסכם משולב</option></select></label><label><span>תחילת הסכם</span><input type="date" name="contractStart"/></label><label><span>סיום הסכם</span><input type="date" name="contractEnd"/></label>{model==="monthly_package"?<><label><span>מספר חבילות / מכונות</span><input type="number" min="1" name="packageCount" defaultValue="1"/></label><label><span>מחיר חודשי לחבילה</span><input type="number" min="0" name="packageFee" defaultValue="0"/></label><label><span>ק״ג כלולים בכל חבילה</span><input type="number" min="0" name="includedKg" defaultValue="0"/></label><label><span>מחיר לק״ג נוסף</span><input type="number" min="0" name="extraKgPrice" defaultValue="0"/></label></>:<><label><span>כמות פולים חודשית</span><input type="number" min="0" name="monthlyKg" defaultValue="0"/></label><label><span>מחיר מכירה לק״ג</span><input type="number" min="0" name="beanPrice" defaultValue="0"/></label></>}<label><span>עלות פולים לנו לק״ג</span><input type="number" min="0" name="beanCost" defaultValue="0"/></label>{["equipment_rental","mixed"].includes(model)&&<label><span>הכנסה חודשית מהשכרת מכונות</span><input type="number" min="0" name="rentalIncome" defaultValue="0"/></label>}{["equipment_sale","mixed"].includes(model)&&<><label><span>הכנסה חד־פעמית ממכירת מכונות</span><input type="number" min="0" name="equipmentSaleIncome" defaultValue="0"/></label><label><span>חודש ההכנסה</span><input type="month" name="equipmentSaleMonth"/></label></>}<label><span>הכנסה חודשית נוספת משירות</span><input type="number" min="0" name="serviceIncome" defaultValue="0"/></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving}>{saving?"מקים…":"הקמת לקוח והסכם"}</button></footer></form></Modal>;
}

function TicketEditModal({ticket,onClose,onSave}:{ticket:Ticket;onClose:()=>void;onSave:(description:string,contact:string,phone:string,resolved:boolean)=>void}) {
  const [description,setDescription]=useState(ticket.description),[contact,setContact]=useState(ticket.contact),[phone,setPhone]=useState(ticket.phone),[resolved,setResolved]=useState(false);
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();onSave(description.trim(),contact.trim(),phone.trim(),resolved);};
  return <Modal title={`עריכת קריאה ${ticket.id}`} onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label className="full"><span>תיאור הבעיה והמידע המעודכן</span><textarea required maxLength={5000} value={description} onChange={event=>setDescription(event.target.value)}/></label><label><span>איש קשר</span><input maxLength={160} value={contact} onChange={event=>setContact(event.target.value)}/></label><label><span>טלפון לחזרה</span><input maxLength={40} value={phone} onChange={event=>setPhone(event.target.value)}/></label><label className="full"><span><input type="checkbox" checked={resolved} onChange={event=>setResolved(event.target.checked)}/> הסתדרתי — אפשר לבטל את הקריאה</span></label></div><footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" type="submit">שמירת העדכון</button></footer></form></Modal>;
}

function TicketAttachment({attachment}:{attachment:NonNullable<Ticket["attachments"]>[number]}) {
  const [secureUrl,setSecureUrl]=useState(attachment.url||"");
  useEffect(()=>{
    if(!attachment.storagePath)return;
    let active=true,objectUrl="";
    void loadTicketAttachment(attachment.storagePath)
      .then(url=>{objectUrl=url;if(active)setSecureUrl(url);})
      .catch(()=>{if(active)setSecureUrl("");});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[attachment.storagePath]);
  if(!secureUrl)return <div className="attachment-loading"><span>🔒</span><small>{attachment.name}</small></div>;
  // Authenticated objects are rendered from short-lived local blob URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={secureUrl} target="_blank" rel="noopener noreferrer">{attachment.type.startsWith("image/")?<img src={secureUrl} alt={attachment.name}/>:<span>▶</span>}<small>{attachment.name}</small></a>;
}

function TicketDetailModal({ticket,machine,canEdit,onEdit,onClose}:{ticket:Ticket;machine?:Machine;canEdit:boolean;onEdit:()=>void;onClose:()=>void}) {
  const customerName=useCustomerName();
  if(!ticket) return null;
  const events=ticket.events?.length?ticket.events:[{id:"opened",type:"created" as const,label:"קריאת השירות נפתחה",createdAt:ticket.openedAt,createdBy:ticket.contact,visibleToCustomer:true},{id:"updated",type:"status" as const,label:`סטטוס: ${ticket.status}`,createdAt:ticket.updatedAt,createdBy:ticket.assignedTo,visibleToCustomer:true}];
  return <Modal title={`קריאה ${ticket.id}`} onClose={onClose}><div className="ticket-detail"><div className="detail-summary"><div><small>לקוח</small><strong>{customerName(ticket.accountId)}</strong></div><div><small>מכונה</small><strong>{machine?.model||"בעיה כללית"}</strong></div><div><small>דחיפות</small><Badge>{ticket.urgency}</Badge></div><div><small>סטטוס</small><Badge>{ticket.status}</Badge></div><div><small>אחראי</small><strong>{ticket.assignedTo}</strong></div><div><small>יעד פתרון</small><strong>{formatDateTime(ticket.resolutionDueAt||"")}</strong></div></div>{ticket.intake?.safetyReview&&<div className="safety-alert compact" role="note"><strong>⚠️ קריאה לטיפול בטיחותי</strong><span>סימן סכנה: {ticket.intake.safety}. אין לנסות תפעול רגיל מרחוק.</span></div>}<section><h3>{ticket.type}</h3>{ticket.intake&&<dl className="ticket-intake-answers"><div><dt>השפעה על הפעילות</dt><dd>{ticket.intake.impact}</dd></div><div><dt>מתי התחילה</dt><dd>{ticket.intake.startedWhen}{ticket.intake.startedAt?` · ${formatDateTime(ticket.intake.startedAt)}`:""}</dd></div><div><dt>הודעה על המסך</dt><dd>{ticket.intake.screen}{ticket.intake.screenMessage?<>: <bdi className="screen-message">{ticket.intake.screenMessage}</bdi></>:null}</dd></div><div><dt>האם חזרה</dt><dd>{ticket.intake.recurrence}</dd></div><div><dt>סימן לסכנה</dt><dd>{ticket.intake.safety}</dd></div></dl>}{ticket.description&&<p>{ticket.description}</p>}</section>{ticket.attachments?.length?<section className="ticket-attachments"><h3>תמונות וקבצים</h3><div>{ticket.attachments.map((attachment,index)=><TicketAttachment attachment={attachment} key={attachment.storagePath||attachment.url||`${attachment.name}-${index}`}/>)}</div></section>:null}<div className="timeline">{[...events].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(event=><div className="done" key={event.id}><i>✓</i><div><strong>{event.label}</strong><small>{event.createdBy} · {formatDateTime(event.createdAt)}</small></div></div>)}</div>{ticket.workSummary&&<div className="close-reason"><strong>סיכום עבודה</strong><span>{ticket.workSummary}</span></div>}{ticket.partsUsed?.length?<div className="close-reason"><strong>חלקים שהוחלפו</strong><span>{ticket.partsUsed.join(", ")}</span></div>:null}{ticket.closeReason&&<div className="close-reason"><strong>סיבת סגירה</strong><span>{ticket.closeReason}</span></div>}<footer>{canEdit&&<button onClick={onEdit}>עריכת הקריאה</button>}<button className="primary" onClick={onClose}>סגירה</button></footer></div></Modal>
}
