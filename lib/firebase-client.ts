import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
let persistentDb: Firestore | null = null;
let appCheckStarted = false;

// App Check proves requests come from this site, not from a script holding
// the public API key. It turns on once the reCAPTCHA Enterprise site key is
// set in the build; enforcement is switched on separately in the console.
const appCheckSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export function getFirebaseServices() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured for this environment.");
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (appCheckSiteKey && !appCheckStarted && typeof window !== "undefined") {
    appCheckStarted = true;
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  if (!persistentDb) {
    try {
      persistentDb = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      persistentDb = getFirestore(app);
    }
  }

  return {
    app,
    auth: getAuth(app),
    db: persistentDb,
  };
}
