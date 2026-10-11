# תפעול: גיבויים ואבטחה

## גיבויים אוטומטיים

מוגדרים ב-Firestore עצמו (לא בקוד), במסד `(default)` בפרויקט `misterbean-platform`:

| גיבוי | מתי | נשמר |
|---|---|---|
| יומי | כל יום | 7 ימים |
| שבועי | כל שבת | 14 שבועות |

בנוסף מופעלת **הגנה ממחיקה** על מסד הנתונים.

רשימת הגיבויים:

```bash
firebase firestore:backups:list --project misterbean-platform
```

### שחזור

שחזור יוצר **מסד נתונים חדש** ולא דורס את הקיים. כך אפשר לבדוק אותו ולהעתיק ממנו רק את מה שנמחק:

```bash
firebase firestore:databases:restore --project misterbean-platform \
  --database restored-YYYYMMDD \
  --backup projects/misterbean-platform/locations/me-west1/backups/<BACKUP_ID>
```

כפתור "הורדת גיבוי נתונים" במסך ההרשאות ממשיך לעבוד כגיבוי ידני נוסף.

## יומן פעולות

כל שינוי בהרשאות או בסיסמה של משתמש נרשם באוסף `auditLog`, ומוצג למנהלים במסך "ניהול והרשאות" ← "יומן פעולות". רק פונקציות השרת כותבות ליומן. משתמש שהגישה שלו הוסרה מנותק מיד מכל המכשירים.

## App Check

הקוד מפעיל App Check (reCAPTCHA Enterprise) רק כשמוגדר מפתח האתר `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.

1. ב-Google Cloud Console ← reCAPTCHA יוצרים מפתח **Website** עם הדומיינים `boazaidel-png.github.io` ו-`localhost`.
2. ב-Firebase Console ← App Check רושמים את אפליקציית הווב עם **reCAPTCHA Enterprise** ואותו מפתח.
3. ב-GitHub ← Settings ← Secrets and variables ← Actions ← Variables מוסיפים `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, ומריצים פריסה מחדש.
4. ממתינים כמה ימים ובודקים ב-App Check שכמעט כל הבקשות "verified". **רק אז** מפעילים Enforce ל-Firestore.

אחרי האכיפה, כל בקשה שלא מגיעה מהאתר נחסמת. בוטים שמתחברים דרך דפדפן רגיל ימשיכו לעבוד. דפדפן אוטומטי (headless) עלול להיחסם, ולכן כדאי לוודא שהבוטים מאומתים לפני האכיפה.
