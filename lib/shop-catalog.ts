import type { ShopItem } from "./platform-types";

export const DEFAULT_SHOP_DISCOUNT = 10;
export const SHOP_UNIT = "1 ק״ג";

type CatalogItem = Omit<ShopItem, "unit" | "price">;

/**
 * Every coffee in the DAdA online store (dadashop.co.il, categories "תערובות קפה"
 * and "פולי קפה חד זני"), with its store price per kilo including VAT, as of
 * October 2026. Descriptions are DAdA's own words, from dadacafe.co.il or,
 * where the coffee is not there, from its page in the store. Taste tags, body
 * and acidity appear only for coffees on DAdA's printed 2026 blend menu. Automatic machines are offered
 * only blends up to the House Blend level, plus decaf; single origins suit an espresso
 * machine as well as moka and filter. A new employee sale starts from
 * this list at the store price less the discount; prices can be changed per sale.
 */
export const DADA_SHOP_CATALOG: CatalogItem[] = [
  {
    id: "stradivari", name: "Stradivari", code: "ST", color: "#b5793a", group: "תערובות", listPrice: 170,
    arabicaPercent: 100, body: 5, acidity: 4, tags: ["פירותי", "קרמי", "חלק", "עשיר"], methods: ["espresso", "filter"],
    description: "תערובת הקפה המשובחת ביותר שלנו. Stradivari מורכבת משניים עשר זני ערביקה שונים (100%), המעניקים לתערובת מגוון רב של טעמים, עומק ומורכבות. זו תערובת בעלת חמיצות גבוהה, מתיקות בינונית ומרירות נמוכה, עשירה ובעלת גוף מלא וסיומת פירותית. התערובת משתלבת בצורה מושלמת עם חלב בקפוצ׳ינו והאספרסו שלה קרמי וחלק.",
  },
  {
    id: "house-blend", name: "House Blend", code: "HB", color: "#6b4532", group: "תערובות", listPrice: 140,
    arabicaPercent: 90, body: 4, acidity: 2, tags: ["מאוזן", "חלק", "עשיר"], methods: ["auto", "espresso"],
    description: "תערובת המורכבת מ-7 זני ערביקה שמהווים 90% מהתערובת, וזן אחד של רובוסטה שמשלים את 10% הנותרים. הקפה מגיע ממרכז אמריקה, אפריקה ואסיה. זו התערובת הקלאסית והפופולרית ביותר שלנו המוגשת בבתי קפה רבים. היא מאופיינת בחומציות בינונית, מתיקות בינונית ומרירות עדינה. התערובת מפיקה אספרסו חלק ועשיר בטעמים, היא מצוינת לאספרסו ומוצלחת במיוחד כקפוצ׳ינו.",
  },
  {
    id: "house-blend-plus", name: "House Blend+", code: "HB+", color: "#b8474a", group: "תערובות", listPrice: 140, badge: "הכי פופולרי",
    arabicaPercent: 90, body: 5, acidity: 1, tags: ["עמוק", "מריר", "מתקתק"], methods: ["auto", "espresso", "moka"],
    description: "תערובת קפה זו זהה בהרכבה לתערובת הבית שלנו, אך הקלייה שלה היא קלייה עמוקה יותר, המפיקה טעמים שונים לחלוטין מאותה תערובת בדיוק. התערובת מאופיינת בטעמים מרירים ומתקתקים יותר, עם חומציות נמוכה. תערובת זו מצטיינת באספרסו ובמקינטה, אך מתאימה גם לקפוצ׳ינו.",
  },
  {
    id: "domo-milano", name: "Domo Milano", code: "DM", color: "#2f5a4a", group: "תערובות", listPrice: 150,
    arabicaPercent: 100, body: 4, acidity: 4, tags: ["פירותי", "קרמי", "ארומטי"], methods: ["espresso", "filter"],
    description: "תערובת חדשה המורכבת מ-100% ערביקה, המכילה שלושה זנים Speciality Coffee מאפריקה ואמריקה. התערובת מאופיינת בחמיצות בינונית-גבוהה, מרירות נמוכה, ומתיקות מרומזת. תערובת בקלייה Light-Medium, עשירה מאוד בטעמי פירות, בעלת קרמה עשירה. מעולה לקפוצ׳ינו, פילטר, ואספרסו לחובבי הדור ה-3.",
  },
  {
    id: "toscanini", name: "Toscanini", code: "TO", color: "#2f6b96", group: "תערובות", listPrice: 150, badge: "מצוין!",
    arabicaPercent: 100, body: 4, acidity: 3, tags: ["מאוזן", "מתקתק", "נקי"], methods: ["espresso"],
    description: "תערובת המורכבת משמונה זני ערביקה (100%) שונים ואיכותיים במיוחד. כמו ביתר התערובות שלנו, זו גם תערובת בינלאומית ובה כל זן של קפה מגיע ממדינה אחרת. התערובת מאופיינת בחמיצות בינונית, מתיקות בינונית ומרירות בינונית, מה שהופך אותה לתערובת מאוזנת מאוד. התערובת מתאימה במיוחד לאספרסו, וגם משתלבת טוב עם חלב, בקפוצ׳ינו.",
  },
  {
    id: "breakfast-club", name: "מועדון ארוחת הבוקר", code: "BC", color: "#8a4a35", group: "תערובות", listPrice: 120,
    arabicaPercent: 100, body: 4, acidity: 2, tags: ["עשיר", "חזק", "רך"], methods: ["turkish", "filter"],
    description: "תערובת המורכבת מארבעה זנים של ערביקה (100%) והיא מומלצת מאוד לקפה שחור. התערובת בעלת טעם עשיר מאוד – בדיוק ההפך ממה שאנחנו מצפים לקבל מהקפה השחור הקלאסי.",
  },
  {
    id: "dx-plus", name: "DX+", code: "DX+", color: "#c0392b", group: "תערובות", listPrice: 120, badge: "מומלץ",
    arabicaPercent: 70, body: 5, acidity: 2, tags: ["שוקולדי", "מתוק", "קרמי"], methods: ["auto", "espresso", "moka"],
    description: "תערובת קפה המורכבת מארבעה זני ערביקה (70%) ושלושה זני רובוסטה (30%). זו תערובת חדשה יחסית, שצוברת פופולריות במהירות רבה מאוד בקרב לקוחותינו. בדומה לשאר התערובות שלנו, גם היא מורכבת מזני קפה מכל רחבי העולם. התערובת מאופיינת בחומציות נמוכה, מתיקות גבוהה ומרירות בינונית. תערובת שוקולדית עם קרמה גבוהה ועשירה, המתאימה לאספרסו, מקינטה וקפוצ׳ינו.",
  },
  {
    id: "amber", name: "Amber", code: "AM", color: "#8a7a2e", group: "תערובות", listPrice: 120,
    arabicaPercent: 70, body: 4, acidity: 3, tags: ["נוכח", "מריר", "מתקתק"], methods: ["auto", "espresso", "moka"],
    description: "תערובת המורכבת מארבעה זני ערביקה שמרכיבים 70% מהתערובת ושני זני רובוסטה שמרכיבים את שאר ה-30%. בתערובת זו הפולים מגיעים מכל רחבי העולם, מאסיה, מרכז אמריקה ואפריקה. התערובת מאופיינת בחומציות בינונית, מתיקות עדינה ומרירות גבוהה. תערובת זו מתאימה במידה שווה גם לקפוצ׳ינו וגם לאספרסו.",
  },
  {
    id: "organic", name: "Organic", code: "OR", color: "#5f7f3a", group: "תערובות", listPrice: 150,
    arabicaPercent: 92, methods: ["espresso", "turkish"],
    description: "תערובת הקפה האורגני שלנו, המורכבת משישה זני ערביקה (92%) וזן אחד של רובוסטה (8%), כולם ממטעים שנבחרו בקפידה. פולי הקפה נקלים בקלייה בינונית-כהה לקבלת תערובת בעלת חמיצות בינונית. התערובת מפיקה אספרסו עשיר בטעמים, ״עגול״ ומאוזן מאוד. מתאימה לאספרסו, קפוצ׳ינו וקפה שחור.",
  },
  {
    id: "decaf", name: "נטול קפאין", code: "DE", color: "#7d7a74", group: "תערובות", listPrice: 170,
    arabicaPercent: 100, methods: ["auto", "espresso", "turkish", "moka", "filter"],
    description: "תערובת קפה 100% ערביקה. הקפה עבר שטיפה במים בתהליך הידוע כ-Swiss Wash, להוצאת הקפאין מהקפה ללא שימוש בכימיקלים.",
  },
  {
    id: "sultan", name: "סולטן", code: "SU", color: "#5a3a2a", group: "תערובות", listPrice: 110,
    arabicaPercent: 50, methods: ["turkish"],
    description: "תערובת לקפה שחור, מאופיינת בטעם דומיננטי לאוהבי הקפה החזק. התערובת מורכבת מ-50% ערביקה ו-50% רובוסטה.",
  },
  {
    id: "emerald", name: "Emerald", code: "EM", color: "#2f7a5a", group: "תערובות", listPrice: 110,
    arabicaPercent: 50, methods: ["auto", "espresso", "turkish"],
    description: "תערובת המורכבת מ-3 זני ערביקה שמרכיבים 50% מהתערובת ושני זני רובוסטה שמרכיבים את ה-50% הנותרים. בתערובת זו הפולים מגיעים מכל רחבי העולם, מאסיה, מרכז אמריקה ואפריקה. התערובת מאופיינת בחומציות נמוכה, מתיקות בינונית ומרירות גבוהה. תערובת זו מתאימה לאוהבי האספרסו. מתאימה למכונות אספרסו ידניות ואוטומטיות.",
  },
  {
    id: "costa-rica-tarrazu", name: "Costa Rica Tarrazu", code: "CR", color: "#3f7f5a", group: "חד זני", listPrice: 120,
    arabicaPercent: 100, body: 4, acidity: 3, tags: ["ארומטי", "מתוק", "חמיצות עדינה"], methods: ["espresso", "moka", "filter"],
    description: "חד זני, 100% ערביקה קוסטה ריקה טרזו. מאופיין בגוף עשיר, ארומה גבוהה, מתיקות עדינה וחמיצות בינונית. קלייה מלאה. מתאים לאספרסו ולשילוב עם חלב, כחד זני או כבסיס לתערובת. מתאים גם למגוון שיטות החליטה מהדור ה-3.",
  },
  {
    id: "ethiopia-sidamo-natural", name: "Ethiopia Sidamo Natural", code: "ETH", color: "#2f6b96", group: "חד זני", listPrice: 150,
    arabicaPercent: 100, body: 4, acidity: 4, tags: ["פירות יבשים", "שוקולד חלב", "ארומטי"], methods: ["espresso", "moka", "filter"],
    description: "סידמו נטורל הוא הבחירה האולטימטיבית שלנו עבור אוהבי קפה האספרסו ובכלל – המותיר טעמים עשירים לאחר הלגימה. קפה זה מפיק מניפה רחבה של ניחוחות וארומות, אשר העיקריות ביניהן פירות יבשים ושוקולד חלב.",
  },
  {
    id: "brazil-cerrado", name: "Brazil Cerrado", code: "BR", color: "#a08a3a", group: "חד זני", listPrice: 110,
    arabicaPercent: 100, body: 4, acidity: 2, tags: ["מתקתק", "אגוזי", "קרמי"], methods: ["espresso", "moka", "filter"],
    description: "חד זני, 100% ברזיל סרדו. מאופיין במתיקות. קלייה בהירה – שמוציאה ממנו את מירב הטעמים. מתאים לאספרסו, לשילוב עם חלב, ולמגוון שיטות החליטה מהדור ה-3.",
  },
  {
    id: "ethiopia-sidamo", name: "Ethiopia Sidamo", code: "ES", color: "#4a7aa6", group: "חד זני", listPrice: 120,
    arabicaPercent: 100, methods: ["espresso", "moka", "filter"],
    description: "חד זני, 100% ערביקה אתיופיה סידמו. מאופיין בחמיצות עדינה ומתיקות שוקולדית. קלייה בינונית. מתאים לאספרסו, לשילוב עם חלב כחד זני או כבסיס לתערובת, ומתאים גם למגוון שיטות החליטה מהדור ה-3.",
  },
  {
    id: "guatemala-antigua", name: "Guatemala Antigua", code: "GU", color: "#4f8a8a", group: "חד זני", listPrice: 120,
    arabicaPercent: 100, methods: ["espresso", "moka", "filter"],
    description: "חד זני, 100% ערביקה גואטמלה אנטיגואה. מאופיין בחמיצות עדינה, מתיקות קלה ופירותיות. קלייה בינונית – בינונית פלוס. מתאים לאספרסו ולשילוב עם חלב, כחד זני או כבסיס לתערובת. מתאים גם למגוון שיטות החליטה מהדור ה-3.",
  },
  {
    id: "colombia-supremo", name: "Colombia Supremo", code: "CO", color: "#b08a2a", group: "חד זני", listPrice: 110,
    arabicaPercent: 100, methods: ["espresso", "moka", "filter"],
    description: "חד זני, 100% ערביקה קולומביה סופרימו. מאופיין בחמיצות. קלייה בינונית. מתאים לאספרסו, לשילוב עם חלב כחד זני או כבסיס לתערובת, ומתאים גם למגוון שיטות החליטה מהדור ה-3.",
  },
  {
    id: "sumatra-mandheling", name: "Sumatra Mandheling", code: "SM", color: "#6b4a2a", group: "חד זני", listPrice: 140,
    arabicaPercent: 100, methods: ["espresso", "moka", "filter"],
    description: "קפה 100% ערביקה, הגדל באי האינדונזי סומטרה, קפה בעל טעמים אדמתיים וארומה צמחית הייחודית לאזור. קפה מנדלינג ידוע בטעם מלא, כבד וסירופי. בעל חומציות נמוכה יחסית לערביקה ומתיקות מעודנת. שילוב המחמיא מאוד לאספרסו ולקפוצ׳ינו כאחד, לחובבי קפה מושבעים.",
  },
  {
    id: "ethiopia-yirgacheffe", name: "Ethiopia Yirgacheffe", code: "YI", color: "#7a5a9a", group: "חד זני", listPrice: 130,
    arabicaPercent: 100, methods: ["espresso", "moka", "filter"],
    description: "קפה 100% ערביקה. מאופיין בטעמים המזכירים תה ופירות יער. בעל חמיצות ברמה בינונית-גבוהה, מתיקות בינונית ומרירות נמוכה. מתאים לאספרסו, קפוצ׳ינו ופילטר.",
  },
  {
    id: "rwanda", name: "Rwanda", code: "RW", color: "#9a3a5a", group: "חד זני", listPrice: 150,
    arabicaPercent: 100, methods: ["espresso", "moka", "filter"],
    description: "קפה חד-זני, 100% ערביקה, המאופיין בשילוב שווה בין טעמי פירות אדומים ופירות יער, בעל חמיצות בינונית+ ומתיקות מרומזת. קלייה Medium, מחמיאה ומפיקה את מירב הטעמים. מומלץ לאספרסו ולקפוצ׳ינו כאחד, ולחליטת קולד ברו.",
  },
  {
    id: "kappi-royal", name: "Kappi Royal", code: "KR", color: "#8a5a2a", group: "חד זני", listPrice: 110,
    arabicaPercent: 0, methods: ["espresso", "turkish", "moka", "filter"],
    description: "קאפי רויאל הוא בין הרובוסטות האיכותיות ביותר בהודו, והוא נחשב ל-Specialty Coffee. קאפי רויאל אינו מר כמו שמצופה בדרך כלל מרובוסטה.",
  },
];

/** A price after a percentage discount, rounded to whole shekels. */
export function discountedPrice(listPrice: number, discountPercent: number) {
  const percent = Math.min(100, Math.max(0, discountPercent || 0));
  return Math.round(listPrice * (1 - percent / 100));
}

/** The store catalog priced for employees: the store price less the discount, 1 kg bags. */
export function shopCatalogItems(discountPercent = DEFAULT_SHOP_DISCOUNT): ShopItem[] {
  return DADA_SHOP_CATALOG.map((item) => ({ ...item, unit: SHOP_UNIT, price: discountedPrice(item.listPrice, discountPercent) }));
}
