"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Mister Bean application error", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="fatal-error" dir="rtl">
      <section>
        <span>!</span>
        <h1>משהו השתבש בטעינת המערכת</h1>
        <p>הנתונים השמורים לא נמחקו. אפשר לנסות לטעון מחדש או לחזור מאוחר יותר.</p>
        <div>
          <button onClick={reset}>ניסיון נוסף</button>
          <button onClick={() => window.location.reload()}>טעינה מחדש</button>
        </div>
      </section>
    </main>
  );
}
