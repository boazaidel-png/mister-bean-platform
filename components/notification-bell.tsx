"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ClipboardList, Headphones, TrendingDown, UserPlus } from "lucide-react";
import { type AppNotification, isUnread, type NotificationReadState } from "@/lib/notifications";

const storageKey = (uid: string) => `mister-bean-notifications:${uid}`;

/** What this person already saw. Kept per browser; a missing or blocked store starts from a week back. */
function loadReadState(uid: string): NotificationReadState {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(uid)) || "null");
    if (saved && typeof saved.since === "string" && Array.isArray(saved.read)) return saved;
  } catch { /* storage unavailable */ }
  return { since: new Date(Date.now() - 7 * 86400000).toISOString(), read: [] };
}

function saveReadState(uid: string, state: NotificationReadState) {
  try { window.localStorage.setItem(storageKey(uid), JSON.stringify(state)); } catch { /* storage unavailable */ }
}

const icons = { order: ClipboardList, "low-order": TrendingDown, ticket: Headphones, access: UserPlus };

const timeAgo = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.round(hours / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
};

export function NotificationBell({ uid, notifications, onOpen, onToast }: {
  uid: string;
  notifications: AppNotification[];
  onOpen: (notification: AppNotification) => void;
  onToast: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NotificationReadState>(() => loadReadState(uid));
  const announced = useRef<Set<string> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((item) => isUnread(item, state));

  // Something new arriving while the system is open gets a toast; what was there on load does not.
  useEffect(() => {
    if (!announced.current) { announced.current = new Set(notifications.map((item) => item.id)); return; }
    const fresh = notifications.filter((item) => !announced.current!.has(item.id) && isUnread(item, state));
    notifications.forEach((item) => announced.current!.add(item.id));
    if (fresh.length) onToast(fresh.length === 1 ? `🔔 ${fresh[0].title}` : `🔔 ${fresh.length} התראות חדשות`);
  }, [notifications, state, onToast]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const update = (next: NotificationReadState) => { setState(next); saveReadState(uid, next); };
  const markRead = (item: AppNotification) => { if (isUnread(item, state)) update({ ...state, read: [...state.read, item.id].slice(-300) }); };
  const markAllRead = () => update({ since: new Date().toISOString(), read: [] });

  return <div className="notification-bell" ref={panelRef}>
    <button className="notification-trigger" onClick={() => setOpen((value) => !value)} aria-label={unread.length ? `${unread.length} התראות שלא נקראו` : "התראות"} aria-expanded={open}>
      <Bell size={19} />
      {unread.length > 0 && <b>{unread.length > 99 ? "99+" : unread.length}</b>}
    </button>
    {open && <div className="notification-panel" role="dialog" aria-label="התראות">
      <header><strong>התראות</strong>{unread.length > 0 && <button onClick={markAllRead}>סימון הכל כנקרא</button>}</header>
      {notifications.length ? <ul>{notifications.slice(0, 40).map((item) => {
        const Icon = icons[item.kind];
        const isNew = isUnread(item, state);
        return <li key={item.id}><button className={`${isNew ? "unread" : ""} kind-${item.kind}`} onClick={() => { markRead(item); setOpen(false); onOpen(item); }}>
          <span className="notification-icon"><Icon size={17} /></span>
          <span className="notification-text"><strong>{item.title}</strong><small>{item.detail}</small></span>
          <time dateTime={item.at}>{timeAgo(item.at)}</time>
        </button></li>;
      })}</ul> : <p className="notification-empty">אין התראות חדשות.</p>}
    </div>}
  </div>;
}
