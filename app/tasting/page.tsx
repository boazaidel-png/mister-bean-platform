"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isFirebaseConfigured } from "@/lib/firebase-client";
import type { TastingSession } from "@/lib/platform-types";
import { blendRatioLabel, TASTING_HIGH_LABEL, TASTING_LOW_LABEL, TASTING_SCALE } from "@/lib/tasting-engine";
import { submitTastingResponse, subscribeToPublicTastingSession } from "@/lib/tasting-store";

const doneKey = (sessionId: string) => `tasting-done-${sessionId}`;

function readStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
const noSubscription = () => () => undefined;
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode: the thank-you screen just will not be remembered */ }
}

export default function TastingPage() {
  // The page is pre-rendered without a query string; the session id is only known in the browser.
  const search = useSyncExternalStore(noSubscription, () => window.location.search, () => null);
  const sessionId = search === null ? "" : new URLSearchParams(search).get("s")?.trim() || "";
  const answeredBefore = useSyncExternalStore(noSubscription, () => Boolean(sessionId && readStorage(doneKey(sessionId))), () => false);
  const [session, setSession] = useState<TastingSession | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [fillAgain, setFillAgain] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [favorite, setFavorite] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId || !isFirebaseConfigured) return;
    return subscribeToPublicTastingSession(sessionId, setSession, () => setFailed(true));
  }, [sessionId]);

  const stage = search === null
    ? "loading"
    : !sessionId || !isFirebaseConfigured || failed || session === null
      ? "missing"
      : sent || (answeredBefore && !fillAgain)
        ? "sent"
        : session === undefined ? "loading" : "ready";

  const blends = session?.blends || [];
  const answered = blends.filter((blend) => ratings[blend.id]).length;
  const canSend = answered > 0 || Boolean(favorite);

  const send = async () => {
    if (!session || !canSend || sending) return;
    setSending(true);
    setError("");
    try {
      await submitTastingResponse(session, ratings, favorite, comment);
      writeStorage(doneKey(session.id), new Date().toISOString());
      setSent(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(session.status === "closed" ? "הטעימה כבר הסתיימה ולא ניתן לשלוח תשובות." : "השליחה לא הצליחה. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.");
    } finally {
      setSending(false);
    }
  };

  const restart = () => {
    setRatings({});
    setFavorite("");
    setComment("");
    setSent(false);
    setFillAgain(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="tasting-page" dir="rtl">
      <header className="tasting-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, plain image */}
        <img src="/mister-bean-platform/brands/dada-logo.png" alt="DAdA Fresh Coffee" />
        <div>
          <h1>סקר טעימות קפה</h1>
          <p>{session?.title || "דרגו כל בלנד לפי הטעם שלכם"}</p>
        </div>
      </header>

      {stage === "loading" && <div className="tasting-message"><i className="tasting-spinner" /><p>טוען את הסקר…</p></div>}

      {stage === "missing" && <div className="tasting-message"><h2>הסקר לא נמצא</h2><p>כדאי לסרוק שוב את קוד ה-QR או לבקש קישור חדש.</p></div>}

      {stage === "sent" && <div className="tasting-message tasting-thanks">
        <span aria-hidden>☕</span>
        <h2>תודה רבה!</h2>
        <p>הדירוג שלכם נשמר. נשמח לשמוע אם יש עוד טעם שתרצו לנסות.</p>
        {session?.status !== "closed" && <button className="tasting-link" onClick={restart}>מילוי נוסף ממכשיר זה</button>}
      </div>}

      {stage === "ready" && session?.status === "closed" && <div className="tasting-message"><h2>הטעימה הסתיימה</h2><p>תודה שהשתתפתם! הסקר כבר לא מקבל תשובות.</p></div>}

      {stage === "ready" && session?.status === "open" && <div className="tasting-form">
        <p className="tasting-intro">טועמים, ומסמנים לכל בלנד כמה הוא מתאים לכם. אין תשובות נכונות או לא נכונות.</p>

        {blends.map((blend, index) => (
          <section className="tasting-blend" key={blend.id}>
            <div className="tasting-blend-head">
              <b>{index + 1}</b>
              <div>
                <h2><bdi>{blend.name}</bdi></h2>
                <small>{blendRatioLabel(blend.arabicaPercent)}</small>
              </div>
            </div>
            {blend.profile && <p>{blend.profile}</p>}
            <div className="tasting-scale" role="radiogroup" aria-label={`הדירוג שלך ל-${blend.name}`}>
              {TASTING_SCALE.map((level) => (
                <button
                  key={level}
                  role="radio"
                  aria-checked={ratings[blend.id] === level}
                  aria-label={level === 1 ? TASTING_LOW_LABEL : level === 5 ? TASTING_HIGH_LABEL : `${level} מתוך 5`}
                  className={ratings[blend.id] === level ? "selected" : ""}
                  onClick={() => setRatings((current) => ({ ...current, [blend.id]: level }))}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="tasting-scale-labels"><span>{TASTING_LOW_LABEL}</span><span>{TASTING_HIGH_LABEL}</span></div>
          </section>
        ))}

        <section className="tasting-blend tasting-favorite">
          <h2>הבלנד המועדף עליי</h2>
          <p>אפשר להיעזר בדירוגים שנתתם למעלה.</p>
          <div className="tasting-chips">
            {blends.map((blend) => (
              <button key={blend.id} className={favorite === blend.id ? "selected" : ""} onClick={() => setFavorite((current) => (current === blend.id ? "" : blend.id))}>
                <bdi>{blend.name}</bdi>
                {ratings[blend.id] ? <small>{ratings[blend.id]}/5</small> : null}
              </button>
            ))}
          </div>
          <label className="tasting-comment">
            <span>משהו נוסף שתרצו לספר? <small>(לא חובה)</small></span>
            <textarea value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} rows={3} />
          </label>
        </section>

        {error && <div className="tasting-error" role="alert">{error}</div>}
        <button className="tasting-submit" disabled={!canSend || sending} onClick={() => void send()}>
          {sending ? "שולח…" : "שליחת הדירוג"}
        </button>
        {!canSend && <p className="tasting-hint">יש לדרג לפחות בלנד אחד כדי לשלוח.</p>}
      </div>}

      <footer className="tasting-foot">DAdA Fresh Coffee</footer>
    </div>
  );
}
