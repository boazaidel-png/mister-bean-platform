"use client";

import { getFunctions, httpsCallable } from "firebase/functions";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFirebaseServices } from "./firebase-client";

const APP_ROOT = "/";
const TOKEN_KEY = "mb-push-token";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const savedToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
};
const saveToken = (token: string) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode: the server copy is what counts */ }
};

/** Whether this device can get notifications, and whether it does. */
export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  }
  // On iPhone, web notifications work only from the app added to the home screen.
  if (isIos() && !isInstalled()) return "needs-install";
  if (!(await isSupported())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && savedToken() ? "on" : "off";
}

async function deviceToken() {
  const { app } = getFirebaseServices();
  const registration = await navigator.serviceWorker.register(`${APP_ROOT}sw.js`, { scope: APP_ROOT });
  await navigator.serviceWorker.ready;
  return getToken(getMessaging(app), { serviceWorkerRegistration: registration });
}

async function register(token: string) {
  const { app } = getFirebaseServices();
  await httpsCallable(getFunctions(app, "europe-west1"), "registerPushToken")({ token });
  saveToken(token);
}

/** Asks for permission (must follow a tap) and connects this device to the signed-in user. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "push/denied" : "push/dismissed");
  await register(await deviceToken());
}

/**
 * Keeps an enabled device connected to whoever is signed in now: the push
 * address can change, and on a shared device it moves to the new user.
 */
export async function refreshPush() {
  if ((await pushState()) !== "on") return;
  const token = await deviceToken();
  await register(token);
}

/** Stops notifications to this device. Called when turning them off and on sign-out. */
export async function disablePush() {
  const token = savedToken();
  saveToken("");
  if (!token) return;
  const { app } = getFirebaseServices();
  await httpsCallable(getFunctions(app, "europe-west1"), "unregisterPushToken")({ token }).catch(() => undefined);
  if (await isSupported()) await deleteToken(getMessaging(app)).catch(() => undefined);
}
