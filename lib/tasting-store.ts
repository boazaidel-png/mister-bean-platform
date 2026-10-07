"use client";

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase-client";
import type { TastingBlend, TastingResponse, TastingSession } from "./platform-types";
import { cleanTastingRatings, MAX_TASTING_COMMENT } from "./tasting-engine";

// Kept apart from firebase-platform.ts so the public tasting page does not
// pull in the authentication and account code.

export function createTastingId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function tastingPublicUrl(sessionId: string) {
  return `${window.location.origin}/mister-bean-platform/tasting/?s=${encodeURIComponent(sessionId)}`;
}

export function subscribeToTastingBlends(onBlends: (blends: TastingBlend[]) => void, onError: (error: Error) => void): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    query(collection(db, "tastingBlends")),
    (snapshot) => onBlends(snapshot.docs.map((item) => item.data() as TastingBlend).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"))),
    onError,
  );
}

export async function saveTastingBlend(blend: TastingBlend) {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "tastingBlends", blend.id), blend);
}

export function subscribeToTastingSessions(onSessions: (sessions: TastingSession[]) => void, onError: (error: Error) => void): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    query(collection(db, "tastingSessions")),
    (snapshot) => onSessions(snapshot.docs.map((item) => item.data() as TastingSession).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    onError,
  );
}

/** All responses of all sessions, for administrators. Grouped by session id. */
export function subscribeToTastingResponses(onResponses: (responses: Map<string, TastingResponse[]>) => void, onError: (error: Error) => void): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    query(collectionGroup(db, "tastingResponses")),
    (snapshot) => {
      const grouped = new Map<string, TastingResponse[]>();
      for (const item of snapshot.docs) {
        const response = item.data() as TastingResponse;
        const sessionId = item.ref.parent.parent?.id || response.sessionId;
        grouped.set(sessionId, [...(grouped.get(sessionId) || []), response]);
      }
      onResponses(grouped);
    },
    onError,
  );
}

export async function saveTastingSession(session: TastingSession) {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "tastingSessions", session.id), session);
}

export async function setTastingSessionStatus(sessionId: string, status: TastingSession["status"]) {
  const { db } = getFirebaseServices();
  const now = new Date().toISOString();
  await updateDoc(doc(db, "tastingSessions", sessionId), status === "closed"
    ? { status, updatedAt: now, closedAt: now }
    : { status, updatedAt: now });
}

export async function deleteTastingSession(sessionId: string) {
  const { db } = getFirebaseServices();
  const responses = await getDocs(collection(db, "tastingSessions", sessionId, "tastingResponses"));
  // A batch holds up to 500 writes; delete responses in chunks, the session last.
  const refs = responses.docs.map((item) => item.ref);
  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, "tastingSessions", sessionId));
  await batch.commit();
}

/** Public: the tasting page reads only the one session it was opened for. */
export function subscribeToPublicTastingSession(
  sessionId: string,
  onSession: (session: TastingSession | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, "tastingSessions", sessionId),
    (snapshot) => onSession(snapshot.exists() ? (snapshot.data() as TastingSession) : null),
    onError,
  );
}

export async function submitTastingResponse(session: TastingSession, ratings: Record<string, number>, favoriteBlendId: string, comment: string) {
  const { db } = getFirebaseServices();
  const id = createTastingId("response");
  const response: TastingResponse = {
    id,
    sessionId: session.id,
    ratings: cleanTastingRatings(session.blends, ratings),
    favoriteBlendId: session.blends.some((blend) => blend.id === favoriteBlendId) ? favoriteBlendId : "",
    comment: comment.trim().slice(0, MAX_TASTING_COMMENT),
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, "tastingSessions", session.id, "tastingResponses", id), response);
}
