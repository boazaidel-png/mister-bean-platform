"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, Copy, Download, FileDown, Maximize2, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import type { Customer, TastingBlend, TastingResponse, TastingSession, TastingSessionBlend } from "@/lib/platform-types";
import { backdropDismiss } from "@/lib/backdrop-dismiss";
import {
  blendRatioLabel,
  chosenTastingBlend,
  clampPercent,
  DEFAULT_TASTING_BLENDS,
  MAX_TASTING_BLENDS,
  summarizeTasting,
  type TastingSummary,
  TASTING_HIGH_LABEL,
  TASTING_LOW_LABEL,
} from "@/lib/tasting-engine";
import {
  createTastingId,
  deleteTastingSession,
  saveTastingBlend,
  saveTastingSession,
  setTastingSessionStatus,
  subscribeToTastingBlends,
  subscribeToTastingResponses,
  subscribeToTastingSessions,
  tastingPublicUrl,
} from "@/lib/tasting-store";

type Props = {
  customers: Customer[];
  /** When set, the workspace shows only this customer's tastings (customer card tab). */
  customer?: Customer;
  readOnly: boolean;
  actor: string;
  onToast: (message: string) => void;
};

const formatDate = (value: string) => value ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date(value)) : "";
const formatAverage = (value: number) => value ? value.toFixed(1) : "—";
const errorText = (error: unknown) => error instanceof Error && error.message.includes("permission") ? "אין הרשאה לפעולה. ייתכן שחוקי Firebase עדיין לא עודכנו." : "הפעולה לא הצליחה. נסו שוב.";

function useTastingData(onError: (message: string) => void) {
  const [blends, setBlends] = useState<TastingBlend[]>([]);
  const [sessions, setSessions] = useState<TastingSession[]>([]);
  const [responses, setResponses] = useState<Map<string, TastingResponse[]>>(new Map());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const fail = (error: Error) => { setReady(true); onError(errorText(error)); };
    const stopBlends = subscribeToTastingBlends(setBlends, fail);
    const stopSessions = subscribeToTastingSessions((next) => { setSessions(next); setReady(true); }, fail);
    const stopResponses = subscribeToTastingResponses(setResponses, fail);
    return () => { stopBlends(); stopSessions(); stopResponses(); };
    // Subscriptions are set up once; onError only reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { blends, sessions, responses, ready };
}

export function TastingWorkspace({ customers, customer, readOnly, actor, onToast }: Props) {
  const { blends, sessions, responses, ready } = useTastingData(onToast);
  const [tab, setTab] = useState<"sessions" | "catalog">("sessions");
  const [openSessionId, setOpenSessionId] = useState("");
  const [creating, setCreating] = useState(false);
  const visibleSessions = customer ? sessions.filter((session) => session.accountId === customer.id) : sessions;
  const openSession = visibleSessions.find((session) => session.id === openSessionId);
  const activeBlends = blends.filter((blend) => blend.active);
  const guard = () => { if (readOnly) { onToast("מצב התצוגה הוא לקריאה בלבד"); return false; } return true; };

  if (openSession) {
    return <TastingSessionDetail
      session={openSession}
      responses={responses.get(openSession.id) || []}
      catalog={activeBlends}
      showCustomer={!customer}
      guard={guard}
      onToast={onToast}
      onBack={() => setOpenSessionId("")}
    />;
  }

  return (
    <div className="tasting-admin">
      <div className="section-title">
        <div>
          <h2>{customer ? "טעימות קפה" : "טעימות קפה ללקוחות"}</h2>
          <p>{customer ? `סקרי הטעימות שנערכו אצל ${customer.name}` : "יוצרים טעימה, מציגים QR לטועמים ומקבלים דירוג בלנדים בזמן אמת."}</p>
        </div>
        <button className="primary" onClick={() => { if (guard()) setCreating(true); }}><Plus size={16} /> טעימה חדשה</button>
      </div>

      {!customer && <div className="tabs">
        <button className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}>טעימות</button>
        <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>קטלוג בלנדים</button>
      </div>}

      {tab === "catalog" && !customer
        ? <BlendCatalog blends={blends} guard={guard} onToast={onToast} />
        : !ready
          ? <div className="workspace-loading"><i /><span>טוען טעימות…</span></div>
          : visibleSessions.length
            ? <div className="tasting-session-list">{visibleSessions.map((session) => {
                const summary = summarizeTasting(session.blends, responses.get(session.id) || []);
                const leader = summary.results[0]?.votes ? summary.results[0] : null;
                return <button key={session.id} onClick={() => setOpenSessionId(session.id)}>
                  <div>
                    <strong>{session.title}</strong>
                    <small>{!customer && `${session.customerName} · `}{formatDate(session.createdAt)}</small>
                  </div>
                  <span className={`badge ${session.status === "open" ? "green" : "gray"}`}>{session.status === "open" ? "פתוחה למילוי" : "הסתיימה"}</span>
                  <span>{summary.participants} משתתפים</span>
                  <span className="tasting-leader">{leader ? <>מוביל: <bdi>{leader.blend.name}</bdi> ({formatAverage(leader.average)})</> : "עדיין אין דירוגים"}</span>
                  <b>פתיחה ←</b>
                </button>;
              })}</div>
            : <div className="panel inline-empty">{customer ? "עדיין לא נערכו טעימות אצל הלקוח." : "עדיין לא נוצרו טעימות."}</div>}

      {creating && <NewTastingModal
        customers={customers}
        fixedCustomer={customer}
        catalog={activeBlends}
        actor={actor}
        onClose={() => setCreating(false)}
        onGoToCatalog={customer ? undefined : () => { setCreating(false); setTab("catalog"); }}
        onCreated={(session) => { setCreating(false); setOpenSessionId(session.id); onToast("הטעימה נוצרה. אפשר להציג את קוד ה-QR לטועמים."); }}
        onError={(error) => onToast(errorText(error))}
      />}
    </div>
  );
}

function NewTastingModal({ customers, fixedCustomer, catalog, actor, onClose, onCreated, onError, onGoToCatalog }: {
  customers: Customer[];
  fixedCustomer?: Customer;
  catalog: TastingBlend[];
  actor: string;
  onClose: () => void;
  onCreated: (session: TastingSession) => void;
  onError: (error: unknown) => void;
  onGoToCatalog?: () => void;
}) {
  const [accountId, setAccountId] = useState(fixedCustomer?.id || "");
  const [title, setTitle] = useState(`טעימת קפה ${formatDate(new Date().toISOString())}`);
  const [selected, setSelected] = useState<string[]>(() => catalog.map((blend) => blend.id));
  const [saving, setSaving] = useState(false);
  const customer = fixedCustomer || customers.find((item) => item.id === accountId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customer || !selected.length || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const session: TastingSession = {
      id: createTastingId("tasting"),
      accountId: customer.id,
      customerName: customer.name,
      title: title.trim() || "טעימת קפה",
      status: "open",
      blends: catalog.filter((blend) => selected.includes(blend.id)).map(({ id, name, arabicaPercent, profile }) => ({ id, name, arabicaPercent, profile })),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
    };
    try {
      await saveTastingSession(session);
      onCreated(session);
    } catch (error) {
      onError(error);
      setSaving(false);
    }
  };

  return <TastingModal title="טעימה חדשה" onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        {!fixedCustomer && <label className="full">לקוח
          <select required value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">בחירת לקוח…</option>
            {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <label className="full">שם הטעימה<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
      </div>
      <h3 className="tasting-modal-subtitle">בלנדים בטעימה</h3>
      {catalog.length
        ? <div className="tasting-pick-list">{catalog.map((blend) => (
            <label key={blend.id}>
              <input type="checkbox" checked={selected.includes(blend.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, blend.id] : current.filter((id) => id !== blend.id))} />
              <span><bdi>{blend.name}</bdi><small>{blendRatioLabel(blend.arabicaPercent)}</small></span>
            </label>
          ))}</div>
        : <div className="inline-empty">אין עדיין בלנדים בקטלוג. {onGoToCatalog ? <button type="button" className="text-btn" onClick={onGoToCatalog}>למעבר לקטלוג הבלנדים</button> : "אפשר להוסיף אותם במסך הטעימות הראשי, בלשונית קטלוג הבלנדים."}</div>}
      <footer>
        <button type="button" onClick={onClose}>ביטול</button>
        <button className="primary" disabled={!customer || !selected.length || saving}>{saving ? "יוצר…" : "יצירת טעימה"}</button>
      </footer>
    </form>
  </TastingModal>;
}

function TastingSessionDetail({ session, responses, catalog, showCustomer, guard, onToast, onBack }: {
  session: TastingSession;
  responses: TastingResponse[];
  catalog: TastingBlend[];
  showCustomer: boolean;
  guard: () => boolean;
  onToast: (message: string) => void;
  onBack: () => void;
}) {
  const summary = useMemo(() => summarizeTasting(session.blends, responses), [session.blends, responses]);
  const [qr, setQr] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [report, setReport] = useState(false);
  const [editingBlend, setEditingBlend] = useState<TastingSessionBlend | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const url = tastingPublicUrl(session.id);
  const open = session.status === "open";
  const favoriteResults = summary.results.filter((result) => result.favorites).sort((a, b) => b.favorites - a.favorites);
  const hellYesLeader = [...summary.results].sort((a, b) => b.hellYes - a.hellYes)[0];

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 720, margin: 2, color: { dark: "#2e2723", light: "#ffffff" } }).then((data) => { if (active) setQr(data); });
    return () => { active = false; };
  }, [url]);

  const run = async (action: () => Promise<void>, done: string) => {
    if (!guard() || busy) return;
    setBusy(true);
    try { await action(); onToast(done); } catch (error) { onToast(errorText(error)); } finally { setBusy(false); }
  };
  const updateBlends = (blends: TastingSessionBlend[], done: string) =>
    run(() => saveTastingSession({ ...session, blends, updatedAt: new Date().toISOString() }), done);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); onToast("הקישור הועתק"); } catch { onToast("לא ניתן להעתיק. אפשר לסמן את הקישור ולהעתיק ידנית."); }
  };
  const downloadQr = () => {
    if (!qr) return;
    const link = document.createElement("a");
    link.href = qr;
    link.download = `qr-${session.customerName}-${session.createdAt.slice(0, 10)}.png`;
    link.click();
  };
  const remove = () => {
    if (!window.confirm(`למחוק את "${session.title}" ואת כל ${responses.length} התשובות שלה? לא ניתן לשחזר.`)) return;
    void run(async () => { await deleteTastingSession(session.id); onBack(); }, "הטעימה נמחקה");
  };
  const unusedCatalog = catalog.filter((blend) => !session.blends.some((item) => item.id === blend.id));

  return (
    <div className="tasting-admin">
      <button className="text-btn tasting-back" onClick={onBack}><ArrowRight size={15} /> חזרה לרשימת הטעימות</button>
      <div className="customer-header tasting-detail-head">
        <div>
          <div className="header-line"><h2>{session.title}</h2><span className={`badge ${open ? "green" : "gray"}`}>{open ? "פתוחה למילוי" : "הסתיימה"}</span></div>
          <p>{showCustomer && `${session.customerName} · `}נוצרה {formatDate(session.createdAt)}{session.closedAt && ` · הסתיימה ${formatDate(session.closedAt)}`}</p>
        </div>
        <div className="title-actions">
          <button onClick={() => setReport(true)}><BarChart3 size={16} /> סיכום גרפי</button>
          {open
            ? <button className="primary" disabled={busy} onClick={() => void run(() => setTastingSessionStatus(session.id, "closed"), "הטעימה הסתיימה. הסקר כבר לא מקבל תשובות.")}>סיום טעימה</button>
            : <button disabled={busy} onClick={() => void run(() => setTastingSessionStatus(session.id, "open"), "הטעימה נפתחה מחדש")}>פתיחה מחדש</button>}
          <button className="row-action danger" disabled={busy} onClick={remove} aria-label="מחיקת הטעימה"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="kpi-grid tasting-kpis">
        <div className="kpi"><span>משתתפים</span><strong>{summary.participants}</strong><small>{open ? "מתעדכן בזמן אמת" : "סה״כ בטעימה"}</small></div>
        <div className="kpi"><span>מוביל בדירוג</span><strong><bdi>{summary.results[0]?.votes ? summary.results[0].blend.name : "—"}</bdi></strong><small>{summary.results[0]?.votes ? `ממוצע ${formatAverage(summary.results[0].average)} מתוך 5` : "ממתין לדירוגים"}</small></div>
        <div className="kpi"><span>הכי הרבה Hell yes</span><strong><bdi>{hellYesLeader?.hellYes ? hellYesLeader.blend.name : "—"}</bdi></strong><small>{hellYesLeader?.hellYes || 0} הצבעות 5</small></div>
        <div className="kpi"><span>נבחר כמועדף</span><strong><bdi>{summary.topFavoriteBlendId ? session.blends.find((blend) => blend.id === summary.topFavoriteBlendId)?.name : "—"}</bdi></strong><small>{favoriteResults[0]?.favorites || 0} בחירות</small></div>
      </div>

      <div className="tasting-detail-grid">
        <section className="panel tasting-results">
          <div className="panel-head"><div><h3>דירוג הבלנדים</h3><p>לפי ממוצע (1 = {TASTING_LOW_LABEL}, 5 = {TASTING_HIGH_LABEL})</p></div></div>
          {summary.results.map((result, index) => (
            <div className="tasting-result-row" key={result.blend.id}>
              <b className="tasting-rank">{result.votes ? index + 1 : "–"}</b>
              <div className="tasting-result-main">
                <div className="tasting-result-title"><strong><bdi>{result.blend.name}</bdi></strong><span>{formatAverage(result.average)}<small>/5</small></span></div>
                <div className="tasting-distribution" title="פילוח הדירוגים מ-1 עד 5">
                  {result.votes ? result.distribution.map((count, level) => count ? <i key={level} className={`level-${level + 1}`} style={{ flexGrow: count }} title={`${level + 1}: ${count}`} /> : null) : <i className="empty" />}
                </div>
                <small className="tasting-result-meta"><span>{result.votes} מדרגים</span><span><bdi>{result.hellYes} Hell yes</bdi></span><span>{result.favorites} בחרו כמועדף</span></small>
              </div>
            </div>
          ))}
          <div className="tasting-legend">{[1, 2, 3, 4, 5].map((level) => <span key={level}><i className={`level-${level}`} />{level === 1 ? TASTING_LOW_LABEL : level === 5 ? TASTING_HIGH_LABEL : level}</span>)}</div>
          {summary.comments.length > 0 && <div className="tasting-comments">
            <h4>הערות הטועמים</h4>
            {summary.comments.map((comment) => <p key={comment.id}>„{comment.text}”</p>)}
          </div>}
        </section>

        <section className="panel tasting-qr-card">
          <h3>קוד QR לטועמים</h3>
          <p>{open ? "סורקים, מדרגים בטלפון, וזה מופיע כאן מיד." : "הטעימה הסתיימה. הקוד לא יקבל תשובות חדשות."}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          {qr ? <img src={qr} alt="קוד QR לסקר הטעימות" className={open ? "" : "muted"} /> : <div className="tasting-qr-placeholder" />}
          <div className="tasting-link-box"><span dir="ltr">{url}</span></div>
          <div className="tasting-qr-actions">
            <button onClick={() => void copyLink()}><Copy size={15} /> העתקת קישור</button>
            <button onClick={downloadQr} disabled={!qr}><Download size={15} /> הורדת QR</button>
            <button onClick={() => setFullscreen(true)} disabled={!qr}><Maximize2 size={15} /> הצגה במסך מלא</button>
          </div>
        </section>
      </div>

      <section className="panel tasting-session-blends">
        <div className="panel-head">
          <div><h3>בלנדים בטעימה</h3><p>שינוי כאן מתעדכן מיד אצל הטועמים. דירוגים קיימים נשמרים.</p></div>
          {open && session.blends.length < MAX_TASTING_BLENDS && <button onClick={() => { if (guard()) setEditingBlend("new"); }}><Plus size={15} /> הוספת בלנד</button>}
        </div>
        {session.blends.map((blend) => (
          <div className="tasting-blend-row" key={blend.id}>
            <div><strong><bdi>{blend.name}</bdi></strong><small>{blendRatioLabel(blend.arabicaPercent)}</small><p>{blend.profile}</p></div>
            {open && <div className="row-actions">
              <button className="row-action" onClick={() => { if (guard()) setEditingBlend(blend); }} aria-label={`עריכת ${blend.name}`}><Pencil size={14} /></button>
              <button className="row-action danger" disabled={session.blends.length <= 1} onClick={() => {
                const votes = summary.results.find((result) => result.blend.id === blend.id)?.votes || 0;
                if (votes && !window.confirm(`ל-${blend.name} יש כבר ${votes} דירוגים. להסיר אותו מהטעימה? הדירוגים שלו לא יוצגו.`)) return;
                void updateBlends(session.blends.filter((item) => item.id !== blend.id), "הבלנד הוסר מהטעימה");
              }} aria-label={`הסרת ${blend.name}`}><X size={14} /></button>
            </div>}
          </div>
        ))}
      </section>

      {editingBlend && <SessionBlendModal
        blend={editingBlend === "new" ? undefined : editingBlend}
        catalog={unusedCatalog}
        onClose={() => setEditingBlend(null)}
        onSave={(blend) => {
          const exists = session.blends.some((item) => item.id === blend.id);
          setEditingBlend(null);
          void updateBlends(exists ? session.blends.map((item) => item.id === blend.id ? blend : item) : [...session.blends, blend], exists ? "הבלנד עודכן בטעימה" : "הבלנד נוסף לטעימה");
        }}
      />}

      {report && <TastingSummaryReport session={session} summary={summary} onClose={() => setReport(false)} />}

      {fullscreen && <div className="tasting-fullscreen" onClick={() => setFullscreen(false)} role="dialog" aria-label="קוד QR במסך מלא">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src="/mister-bean-platform/brands/dada-logo.png" alt="DAdA Fresh Coffee" className="tasting-fullscreen-logo" />
        <h2>סקר טעימות קפה</h2>
        <p>סרקו את הקוד ודרגו את הבלנדים שטעמתם</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={qr} alt="קוד QR לסקר הטעימות" className="tasting-fullscreen-qr" />
        <small>הקישו בכל מקום כדי לסגור</small>
      </div>}
    </div>
  );
}

/**
 * A one-page visual summary of a tasting: the chosen blend, every blend's
 * average and number of tasters, the rating breakdown and comments. Rendered
 * at the top of the page so it can be printed or saved as a PDF on its own.
 */
function TastingSummaryReport({ session, summary, onClose }: { session: TastingSession; summary: TastingSummary; onClose: () => void }) {
  const chosen = chosenTastingBlend(summary);
  const rated = summary.results.filter((result) => result.votes > 0);
  const unrated = summary.results.filter((result) => !result.votes);
  const maxFavorites = Math.max(1, ...summary.results.map((result) => result.favorites));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  /** Saves the summary as an A4 PDF file, without the print dialog. */
  const downloadPdf = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const [{ jsPDF }, { drawTastingReport }] = await Promise.all([import("jspdf"), import("./tasting-report-canvas")]);
      const canvas = await drawTastingReport(session, summary, chosen, formatDate);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const ratio = canvas.height / canvas.width;
      const width = Math.min(210, 297 / ratio);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (210 - width) / 2, 0, width, width * ratio);
      const day = new Date().toISOString().slice(0, 10);
      pdf.save(`סיכום טעימה - ${session.customerName} - ${day}.pdf`.replace(/[\\/:*?"<>|]/g, ""));
    } catch {
      setSaveError("השמירה נכשלה. אפשר לנסות שוב או להשתמש בהדפסה ושמירה כ-PDF.");
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    document.body.classList.add("tasting-report-open");
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => { document.body.classList.remove("tasting-report-open"); window.removeEventListener("keydown", close); };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(<div className="tasting-report-overlay" role="dialog" aria-label="סיכום גרפי של הטעימה">
    <div className="tasting-report-toolbar">
      <button onClick={onClose}><X size={16} /> סגירה</button>
      <div>
        <button onClick={() => window.print()}><Printer size={16} /> הדפסה</button>
        <button className="primary" disabled={saving} onClick={() => void downloadPdf()}><FileDown size={16} /> {saving ? "מכין PDF…" : "הורדת PDF"}</button>
      </div>
    </div>
    {saveError && <p className="tasting-report-error" role="alert">{saveError}</p>}
    <article className="tasting-report" dir="rtl">
      <header className="tasting-report-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/mister-bean-platform/brands/dada-logo.png" alt="DAdA Fresh Coffee" />
        <div>
          <small>סיכום סקר טעימות</small>
          <h1><bdi>{session.title}</bdi></h1>
          <p>{session.customerName} · {formatDate(session.createdAt)}{session.status === "open" ? " · הסקר עדיין פתוח" : ""}</p>
        </div>
        <div className="tasting-report-count"><strong>{summary.participants}</strong><span>משתתפים</span></div>
      </header>

      {chosen ? <section className="tasting-report-winner">
        <span className="tasting-report-trophy" aria-hidden="true">🏆</span>
        <div>
          <small>הבלנד הנבחר</small>
          <h2><bdi>{chosen.blend.name}</bdi></h2>
          <p>{chosen.reason === "favorites"
            ? `נבחר כמועדף על ידי ${chosen.favorites} מתוך ${summary.participants} משתתפים`
            : "קיבל את הדירוג הממוצע הגבוה ביותר"}</p>
        </div>
        <dl>
          <div><dt>ממוצע</dt><dd>{formatAverage(chosen.average)}<small>/5</small></dd></div>
          <div><dt>מדרגים</dt><dd>{chosen.votes}</dd></div>
          <div><dt>Hell yes</dt><dd>{chosen.hellYes}</dd></div>
        </dl>
      </section> : <section className="tasting-report-empty">עדיין אין דירוגים בטעימה הזו.</section>}

      {rated.length > 0 && <section className="tasting-report-section">
        <h3>ממוצע הדירוג לכל בלנד</h3>
        <p className="tasting-report-note">סולם 1 ({TASTING_LOW_LABEL}) עד 5 ({TASTING_HIGH_LABEL})</p>
        <div className="tasting-report-bars">
          {rated.map((result, index) => <div className={`tasting-report-bar ${chosen?.blend.id === result.blend.id ? "chosen" : ""}`} key={result.blend.id}>
            <span className="tasting-report-rank">{index + 1}</span>
            <span className="tasting-report-name"><bdi>{result.blend.name}</bdi><small>{result.votes} הצביעו</small></span>
            <span className="tasting-report-track"><i style={{ width: `${(result.average / 5) * 100}%` }} /></span>
            <b>{formatAverage(result.average)}</b>
          </div>)}
        </div>
      </section>}

      {rated.length > 0 && <div className="tasting-report-grid">
        <section className="tasting-report-section">
          <h3>פילוח הדירוגים</h3>
          <div className="tasting-report-dist">
            {rated.map((result) => <div key={result.blend.id}>
              <span><bdi>{result.blend.name}</bdi></span>
              <span className="tasting-distribution">{result.distribution.map((count, level) => count ? <i key={level} className={`level-${level + 1}`} style={{ flexGrow: count }}>{count}</i> : null)}</span>
            </div>)}
          </div>
          <div className="tasting-legend">{[1, 2, 3, 4, 5].map((level) => <span key={level}><i className={`level-${level}`} />{level}</span>)}</div>
        </section>
        <section className="tasting-report-section">
          <h3>נבחר כמועדף</h3>
          <div className="tasting-report-favorites">
            {[...summary.results].sort((a, b) => b.favorites - a.favorites).filter((result) => result.favorites > 0).map((result) => <div key={result.blend.id}>
              <span><bdi>{result.blend.name}</bdi></span>
              <span className="tasting-report-track small"><i style={{ width: `${(result.favorites / maxFavorites) * 100}%` }} /></span>
              <b>{result.favorites}</b>
            </div>)}
            {!summary.results.some((result) => result.favorites) && <p className="tasting-report-note">אף משתתף לא בחר בלנד מועדף.</p>}
          </div>
        </section>
      </div>}

      {unrated.length > 0 && <p className="tasting-report-note">ללא דירוגים: {unrated.map((result) => result.blend.name).join(", ")}</p>}

      {summary.comments.length > 0 && <section className="tasting-report-section tasting-report-comments">
        <h3>מה אמרו הטועמים</h3>
        {summary.comments.map((comment) => <p key={comment.id}>„{comment.text}”</p>)}
      </section>}

      <footer className="tasting-report-foot">הופק ב-{formatDate(new Date().toISOString())} · DAdA Fresh Coffee</footer>
    </article>
  </div>, document.body);
}

function SessionBlendModal({ blend, catalog, onClose, onSave }: { blend?: TastingSessionBlend; catalog: TastingBlend[]; onClose: () => void; onSave: (blend: TastingSessionBlend) => void }) {
  const [draft, setDraft] = useState<TastingSessionBlend>(blend || { id: createTastingId("blend"), name: "", arabicaPercent: 70, profile: "" });
  return <TastingModal title={blend ? `עריכת ${blend.name}` : "הוספת בלנד לטעימה"} onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim(), profile: draft.profile.trim() }); }}>
      {!blend && catalog.length > 0 && <label className="tasting-from-catalog">מהקטלוג
        <select value="" onChange={(event) => { const picked = catalog.find((item) => item.id === event.target.value); if (picked) onSave({ id: picked.id, name: picked.name, arabicaPercent: picked.arabicaPercent, profile: picked.profile }); }}>
          <option value="">בחירת בלנד מהקטלוג…</option>
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {!blend && catalog.length > 0 && <p className="tasting-or">או בלנד חדש לטעימה הזו בלבד:</p>}
      <BlendFields draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={!draft.name.trim()}>שמירה</button></footer>
    </form>
  </TastingModal>;
}

function BlendCatalog({ blends, guard, onToast }: { blends: TastingBlend[]; guard: () => boolean; onToast: (message: string) => void }) {
  const [editing, setEditing] = useState<TastingBlend | null>(null);
  const [seeding, setSeeding] = useState(false);
  const save = async (blend: TastingBlend, message: string) => {
    if (!guard()) return;
    try { await saveTastingBlend({ ...blend, updatedAt: new Date().toISOString() }); onToast(message); } catch (error) { onToast(errorText(error)); }
  };
  const seed = async () => {
    if (!guard() || seeding) return;
    setSeeding(true);
    const now = new Date().toISOString();
    try {
      for (const [index, blend] of DEFAULT_TASTING_BLENDS.entries()) {
        await saveTastingBlend({ ...blend, active: true, sortOrder: index + 1, createdAt: now, updatedAt: now });
      }
      onToast("5 הבלנדים נוספו לקטלוג");
    } catch (error) { onToast(errorText(error)); } finally { setSeeding(false); }
  };
  const newBlend = (): TastingBlend => {
    const now = new Date().toISOString();
    return { id: createTastingId("blend"), name: "", arabicaPercent: 70, profile: "", active: true, sortOrder: (blends.at(-1)?.sortOrder || 0) + 1, createdAt: now, updatedAt: now };
  };

  return <section className="panel tasting-catalog">
    <div className="panel-head">
      <div><h3>קטלוג בלנדים</h3><p>הבלנדים שנבחרים כברירת מחדל בכל טעימה חדשה. שינוי כאן לא משנה טעימות שכבר נוצרו.</p></div>
      <button onClick={() => { if (guard()) setEditing(newBlend()); }}><Plus size={15} /> בלנד חדש</button>
    </div>
    {!blends.length && <div className="inline-empty">
      <p>הקטלוג ריק.</p>
      <button className="primary" disabled={seeding} onClick={() => void seed()}>{seeding ? "מוסיף…" : "הוספת 5 הבלנדים מהסקר המודפס"}</button>
    </div>}
    {blends.map((blend) => (
      <div className={`tasting-blend-row ${blend.active ? "" : "inactive"}`} key={blend.id}>
        <div><strong><bdi>{blend.name}</bdi>{!blend.active && <span className="badge gray">מוסתר</span>}</strong><small>{blendRatioLabel(blend.arabicaPercent)}</small><p>{blend.profile}</p></div>
        <div className="row-actions">
          <button className="row-action" onClick={() => { if (guard()) setEditing(blend); }}><Pencil size={14} /> עריכה</button>
          <button className="row-action" onClick={() => void save({ ...blend, active: !blend.active }, blend.active ? "הבלנד הוסתר מטעימות חדשות" : "הבלנד הוחזר לקטלוג")}>{blend.active ? "הסתרה" : "החזרה"}</button>
        </div>
      </div>
    ))}
    {editing && <TastingModal title={editing.name ? `עריכת ${editing.name}` : "בלנד חדש"} onClose={() => setEditing(null)}>
      <CatalogBlendForm blend={editing} onClose={() => setEditing(null)} onSave={(blend) => { setEditing(null); void save(blend, "הבלנד נשמר בקטלוג"); }} />
    </TastingModal>}
  </section>;
}

function CatalogBlendForm({ blend, onClose, onSave }: { blend: TastingBlend; onClose: () => void; onSave: (blend: TastingBlend) => void }) {
  const [draft, setDraft] = useState(blend);
  return <form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim(), profile: draft.profile.trim() }); }}>
    <BlendFields draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
    <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={!draft.name.trim()}>שמירה</button></footer>
  </form>;
}

function BlendFields({ draft, onChange }: { draft: TastingSessionBlend; onChange: (patch: Partial<TastingSessionBlend>) => void }) {
  return <div className="form-grid">
    <label>שם הבלנד<input required value={draft.name} maxLength={120} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <label>אחוז ערביקה<input type="number" min={0} max={100} value={draft.arabicaPercent} onChange={(event) => onChange({ arabicaPercent: clampPercent(Number(event.target.value)) })} /><small>{blendRatioLabel(draft.arabicaPercent)}</small></label>
    <label className="full">פרופיל טעם<textarea value={draft.profile} maxLength={600} rows={3} onChange={(event) => onChange({ profile: event.target.value })} /></label>
  </div>;
}

function TastingModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  useEffect(() => {
    document.body.classList.add("dialog-open");
    return () => document.body.classList.remove("dialog-open");
  }, []);
  return <div className="modal-backdrop" {...backdropDismiss(onClose)}>
    <div className="modal" role="dialog" aria-label={title}>
      <header><h2>{title}</h2><button onClick={onClose} aria-label="סגירה">×</button></header>
      {children}
    </div>
  </div>;
}
