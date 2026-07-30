# ארכיטקטורת הפלטפורמה המאוחדת

## מצב קיים

- לידים: `boazaidel-png/mister-bean-`
  - Firebase Authentication
  - Firebase Realtime Database
  - רשומת הנתונים הקיימת: `leads`
- הצעות מחיר: `boazaidel-png/mister-bean-quotes`
  - Firebase Authentication
  - Cloud Firestore
  - רשומת הנתונים הקיימת: `quotes`
- שירות: המודול הנוכחי בפרויקט זה
  - נתוני הדגמה ו-Local Storage בשלב הראשון

## מקור אמת משותף

הישות המרכזית תהיה `CustomerAccount`. כל מודול ישמור `accountId` קבוע:

```text
Lead
  └── accountId
Quote
  └── accountId
Contract
  └── accountId
Site / Machine / Ticket / Order / Task
  └── accountId
```

הליד רשאי להתקיים ללא `accountId` כל עוד לא הומר ללקוח. בעת ההמרה נוצרת
רשומת `CustomerAccount`, והצעות חדשות ושירות עתידי נקשרים אליה.

## שלבי חיבור עתידיים

1. ליצור אוספי Firestore חדשים עבור נתוני השירות בלבד.
2. להוסיף מיפוי בין מזהי הלידים וההצעות הקיימים לבין `accountId`.
3. לשמור על Realtime Database עבור הלידים בזמן תקופת המעבר.
4. להחליף את `BrowserStorageRepository` ב-`FirebasePlatformRepository`.
5. לאחד כניסה, מעטפת ניווט והרשאות.
6. להעביר את מסכי הלידים והצעות המחיר בהדרגה לתוך הפלטפורמה.

## אוספים מתוכננים ב-Firestore

```text
accounts
sites
machines
serviceTickets
coffeeOrders
tasks
contracts
accountLinks
```

`accountLinks` ישמור את הקישור למזהים הישנים עד להשלמת ההעברה.

## עקרונות בטיחות

- אין לבצע שינוי סכימה או כללים בפרויקט Firebase הפעיל לפני גיבוי.
- אין למחוק או להעביר נתוני לידים בזמן הוספת מודול השירות.
- אין להסתמך על שם חברה כמזהה; משתמשים ב-`accountId`.
- הרשאות לקוח נבדקות לפי שיוך משתמש לחשבון ולסניפים מורשים.
