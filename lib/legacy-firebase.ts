"use client";

import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getAuth } from "firebase/auth";
import { get, getDatabase, ref } from "firebase/database";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { parseLegacyWorkspace } from "./legacy-migration";
import type { SalesWorkspace } from "./platform-types";

const leadsConfig = {
  apiKey: "AIzaSyC0X0AUzZre1XzD5InW6ljUFHRsd6883H8",
  authDomain: "mister-bean.firebaseapp.com",
  databaseURL:
    "https://mister-bean-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mister-bean",
  storageBucket: "mister-bean.firebasestorage.app",
  messagingSenderId: "361606591654",
  appId: "1:361606591654:web:5c38de493432c8acd0b067",
};

const quotesConfig = {
  apiKey: "AIzaSyAQtBPnAfDJnN4ewYu6C7mseWfhRp3S1_c",
  authDomain: "mister-bean-quotes.firebaseapp.com",
  projectId: "mister-bean-quotes",
  storageBucket: "mister-bean-quotes.firebasestorage.app",
  messagingSenderId: "182356242822",
  appId: "1:182356242822:web:0ee286d0496f20dc62bc07",
};

function secondaryApp(name: string, config: FirebaseOptions): FirebaseApp {
  return getApps().some((app) => app.name === name)
    ? getApp(name)
    : initializeApp(config, name);
}

export type LegacyCredentials = {
  email: string;
  leadsPassword: string;
  quotesPassword: string;
};

export type LegacyMigrationSnapshot = {
  workspace: SalesWorkspace;
  rawLeads: unknown;
  rawQuotes: Record<string, unknown>;
  fetchedAt: string;
};

async function authenticate(app: FirebaseApp, email: string, password: string) {
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  await signInWithEmailAndPassword(auth, email.trim(), password);
  return auth;
}

export async function fetchLegacyWorkspace({
  email,
  leadsPassword,
  quotesPassword,
}: LegacyCredentials): Promise<LegacyMigrationSnapshot> {
  const leadsApp = secondaryApp("legacy-leads-migration", leadsConfig);
  const quotesApp = secondaryApp("legacy-quotes-migration", quotesConfig);
  const [leadsAuth, quotesAuth] = await Promise.all([
    authenticate(leadsApp, email, leadsPassword),
    authenticate(quotesApp, email, quotesPassword),
  ]);

  try {
    const [leadsSnapshot, quotesSnapshot] = await Promise.all([
      get(ref(getDatabase(leadsApp), "leads")),
      getDocs(collection(getFirestore(quotesApp), "quotes")),
    ]);
    const rawLeads = leadsSnapshot.val() || [];
    const rawQuotes = Object.fromEntries(
      quotesSnapshot.docs.map((quote) => [
        quote.id,
        { id: quote.id, ...quote.data() },
      ]),
    );
    return {
      workspace: parseLegacyWorkspace(rawLeads, rawQuotes),
      rawLeads,
      rawQuotes,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await Promise.allSettled([signOut(leadsAuth), signOut(quotesAuth)]);
  }
}
