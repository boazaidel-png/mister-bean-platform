"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Customer, CustomerDeal } from "@/lib/platform-types";
import { addMonths, dealCashflow, dealMonth, monthsBetween, type CashflowMonth, type DealInput } from "@/lib/deal-economics";
import { subscribeToCustomerDeal } from "@/lib/firebase-platform";

/**
 * Money screens: when money comes in and goes out (cashflow) for one customer
 * and for the whole business, and which customers the business earns on.
 * Amounts are before VAT, like the profitability.
 */

const shekels = (value: number) => `${value < 0 ? "−" : ""}₪${Math.round(Math.abs(value)).toLocaleString("he-IL")}`;
const monthTitle = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
};
const shortMonth = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { month: "short", year: "2-digit" }).format(new Date(year, value - 1, 1));
};

const OUT_COLUMNS: Array<[keyof CashflowMonth, string]> = [["beans", "פולים"], ["equipment", "ציוד"], ["financing", "החזר מימון"], ["operating", "תפעול"], ["extra", "הוצאות נוספות"]];

/** A switch between the two ways to look at the money. */
export function MoneyToggle({ value, onChange }: { value: "cash" | "profit"; onChange: (value: "cash" | "profit") => void }) {
  return <div className="money-toggle" role="tablist" aria-label="תצוגה">
    <button role="tab" aria-selected={value === "profit"} className={value === "profit" ? "active" : ""} onClick={() => onChange("profit")}>רווחיות</button>
    <button role="tab" aria-selected={value === "cash"} className={value === "cash" ? "active" : ""} onClick={() => onChange("cash")}>תזרים</button>
  </div>;
}

/** One customer's cashflow over the whole deal, with the months its last payments fall in. */
export function CustomerCashflow({ input }: { input: DealInput }) {
  const toMonth = addMonths(input.startMonth, input.contractMonths - 1 + 3);
  const rows = useMemo(() => dealCashflow(input, input.startMonth, toMonth), [input, toMonth]);
  const outColumns = OUT_COLUMNS.filter(([key]) => rows.some((row) => row[key] as number));
  const hasLoan = rows.some((row) => row.loanIn);
  const lowest = rows.reduce((min, row) => Math.min(min, row.cumulative), 0);
  return <section className="panel cashflow">
    <div className="panel-head"><div><h3>תזרים הלקוח</h3><p>מתי הכסף נכנס ויוצא, לפי תנאי התשלום של הלקוח ושל הספקים · ללא מע״מ</p></div>
      {lowest < 0 && <div className="cashflow-note">החשיפה הגבוהה: {shekels(lowest)}</div>}</div>
    <CashTable rows={rows} today={input.today} outColumns={outColumns} hasLoan={hasLoan} />
  </section>;
}

function CashTable({ rows, today, outColumns, hasLoan, detail }: { rows: CashflowMonth[]; today: string; outColumns: Array<[keyof CashflowMonth, string]>; hasLoan: boolean; detail?: (row: CashflowMonth) => React.ReactNode }) {
  const [open, setOpen] = useState("");
  return <div className="table-wrap"><table className="cashflow-table">
    <thead><tr><th>חודש</th><th>נכנס מלקוחות</th>{hasLoan && <th>מימון שהתקבל</th>}{outColumns.map(([key, label]) => <th key={key}>{label}</th>)}<th>נטו</th><th>מצטבר</th></tr></thead>
    <tbody>{rows.map((row) => <Fragment key={row.month}>
      <tr className={`${row.month === today ? "current" : ""} ${row.past ? "past" : ""} ${detail ? "clickable" : ""}`} onClick={detail ? () => setOpen(open === row.month ? "" : row.month) : undefined}>
        <td><strong>{shortMonth(row.month)}</strong>{row.month === today && <small> · החודש</small>}</td>
        <td>{row.fromCustomer ? shekels(row.fromCustomer) : "—"}</td>
        {hasLoan && <td>{row.loanIn ? shekels(row.loanIn) : "—"}</td>}
        {outColumns.map(([key]) => <td key={key}>{row[key] ? shekels(-(row[key] as number)) : "—"}</td>)}
        <td className={row.net < 0 ? "negative-text" : "positive-text"}><strong>{shekels(row.net)}</strong></td>
        <td className={row.cumulative < 0 ? "negative-text" : ""}>{shekels(row.cumulative)}</td>
      </tr>
      {detail && open === row.month && <tr className="cashflow-detail"><td colSpan={4 + (hasLoan ? 1 : 0) + outColumns.length}>{detail(row)}</td></tr>}
    </Fragment>)}</tbody>
  </table>
    <p className="deal-note">חודשים שעברו: מה שסופק בפועל. מהחודש הנוכחי: צפוי.{detail ? " לחיצה על חודש מפרטת לפי לקוח." : ""}</p>
  </div>;
}

/** The cash in the account at the end of each month of the year, as bars around zero. */
function BankStrip({ rows, balance, opening, today, selected, onSelect }: { rows: CashflowMonth[]; balance: (month: string) => number; opening: number; today: string; selected: string; onSelect: (month: string) => void }) {
  const values = rows.map((row) => balance(row.month));
  const closing = values[values.length - 1] || 0;
  const lowest = Math.min(...values);
  const scale = Math.max(1, ...values.map(Math.abs));
  const hasBelow = values.some((value) => value < 0);
  return <section className="bank" aria-label="הקופה המצטברת">
    <div className="bank-head">
      <h4>הקופה המצטברת</h4>
      <span>תחילת השנה <b>{shekels(opening)}</b></span>
      <span>סוף השנה <b className={closing < 0 ? "negative-text" : "positive-text"}>{shekels(closing)}</b></span>
      {lowest < 0 && <span>הנמוכה <b className="negative-text">{shekels(lowest)}</b></span>}
    </div>
    <div className={`bank-bars ${hasBelow ? "with-below" : ""}`}>
      {rows.map((row, index) => {
        const value = values[index];
        const height = Math.max(2, Math.round(Math.abs(value) / scale * 100));
        return <button key={row.month} className={`${row.month === selected ? "active" : ""} ${row.month === today ? "current" : ""} ${row.past ? "past" : ""}`} onClick={() => onSelect(row.month)} title={`${monthTitle(row.month)}: ${shekels(value)}`}>
          <span className="bank-value">{shekels(value)}</span>
          <span className="bank-track"><i className={value < 0 ? "below" : "above"} style={{ height: `${height}%` }} /></span>
          <small>{shortMonth(row.month)}</small>
        </button>;
      })}
    </div>
    <p className="deal-note">הדמיה של חשבון הבנק: מצטבר מהחודש הראשון של הפעילות, מתחיל מ־0. אפשר להוסיף את היתרה האמיתית בחשבון כנקודת התחלה.</p>
  </section>;
}

const IN_LINES: Array<[keyof CashflowMonth, string]> = [["fromCustomer", "מלקוחות"], ["loanIn", "מימון שהתקבל"]];

/**
 * A year of cashflow: the year's totals, a tile per month (its net, in and
 * out), and the chosen month in detail, by kind and, when given, by customer.
 */
function YearCashflow({ year, onYear, rows, today, breakdown, balance, opening }: {
  year: number; onYear: (year: number) => void; rows: CashflowMonth[]; today: string; breakdown?: (row: CashflowMonth) => React.ReactNode;
  /** The account's balance at the end of each month, and at the start of the year: a simulation of the bank account. */
  balance?: (month: string) => number; opening?: number;
}) {
  const inYear = today.startsWith(`${year}-`);
  const [chosen, setChosen] = useState("");
  const selected = rows.find((row) => row.month === chosen) || rows.find((row) => row.month === (inYear ? today : "")) || rows.find((row) => row.totalIn || row.totalOut) || rows[0];
  const sum = (key: keyof CashflowMonth) => rows.reduce((total, row) => total + (row[key] as number), 0);
  const lowest = rows.reduce((min, row) => Math.min(min, row.cumulative), 0);
  const lines = (list: Array<[keyof CashflowMonth, string]>, sign: 1 | -1) => list.filter(([key]) => selected[key] as number).map(([key, label]) => <div key={key}><span>{label}</span><b>{shekels(sign * (selected[key] as number))}</b></div>);
  return <div className="year-cash">
    <div className="year-cash-head">
      <div className="ob-month" role="group" aria-label="בחירת שנה"><button aria-label="שנה קודמת" onClick={() => { onYear(year - 1); setChosen(""); }}>›</button><strong>{year}</strong><button aria-label="שנה הבאה" onClick={() => { onYear(year + 1); setChosen(""); }}>‹</button></div>
      <div className="year-cash-totals">
        <span>נכנס <b>{shekels(sum("totalIn"))}</b></span><span>יוצא <b>{shekels(sum("totalOut"))}</b></span>
        <span>נטו לשנה <b className={sum("net") < 0 ? "negative-text" : "positive-text"}>{shekels(sum("net"))}</b></span>
        {lowest < 0 && <span>הנקודה הנמוכה <b className="negative-text">{shekels(lowest)}</b></span>}
      </div>
    </div>
    {balance && <BankStrip rows={rows} balance={balance} opening={opening || 0} today={today} selected={selected.month} onSelect={setChosen} />}
    <div className="year-cash-grid">
      {rows.map((row) => <button key={row.month} className={`${row.month === selected.month ? "active" : ""} ${row.month === today ? "current" : ""} ${row.past ? "past" : ""}`} onClick={() => setChosen(row.month)}>
        <small>{shortMonth(row.month)}{row.month === today ? " · החודש" : ""}</small>
        <strong className={row.net < 0 ? "negative-text" : row.net > 0 ? "positive-text" : ""}>{row.totalIn || row.totalOut ? shekels(row.net) : "—"}</strong>
        <span>{row.totalIn || row.totalOut ? `נכנס ${shekels(row.totalIn)} · יוצא ${shekels(row.totalOut)}` : "אין תנועות"}</span>
      </button>)}
    </div>
    <div className="year-cash-detail">
      <h4>{monthTitle(selected.month)} <small>{selected.past ? "בפועל" : "צפוי"} · {balance ? `בקופה בסוף החודש ${shekels(balance(selected.month))}` : `מצטבר מתחילת השנה ${shekels(selected.cumulative)}`}</small></h4>
      {selected.totalIn || selected.totalOut ? <div className="year-cash-columns">
        <div className="deal-extra-costs"><h4>נכנס</h4>{lines(IN_LINES, 1)}<div className="year-cash-total"><span>סה״כ</span><b>{shekels(selected.totalIn)}</b></div></div>
        <div className="deal-extra-costs"><h4>יוצא</h4>{lines(OUT_COLUMNS, -1)}<div className="year-cash-total"><span>סה״כ</span><b>{shekels(-selected.totalOut)}</b></div></div>
      </div> : <p className="deal-note">אין תנועות בחודש הזה.</p>}
      {breakdown?.(selected)}
    </div>
    <p className="deal-note">חודשים שעברו: מה שסופק בפועל. מהחודש הנוכחי: צפוי. לחיצה על חודש מציגה את הפירוט שלו.</p>
  </div>;
}

/**
 * The whole business: every customer's money together. Cashflow by month with
 * the customers behind each month, or profit by customer for a month.
 */
export function BusinessFinance({ customers, inputFor, today, onOpenCustomer }: {
  customers: Customer[];
  /** The deal input of a customer, built the same way as on the customer card. */
  inputFor: (customer: Customer, deal: CustomerDeal | null) => DealInput;
  today: string;
  onOpenCustomer: (id: string) => void;
}) {
  const [view, setView] = useState<"cash" | "profit">("cash");
  const [deals, setDeals] = useState<Map<string, CustomerDeal | null>>(new Map());
  const [month, setMonth] = useState(today);
  const ids = customers.map((customer) => customer.id).join("|");
  useEffect(() => {
    const stops = ids.split("|").filter(Boolean).map((id) => subscribeToCustomerDeal(id, (deal) => setDeals((current) => new Map(current).set(id, deal)), () => setDeals((current) => new Map(current).set(id, null))));
    return () => stops.forEach((stop) => stop());
  }, [ids]);
  const ready = customers.every((customer) => deals.has(customer.id));
  const inputs = useMemo(() => ready ? customers.map((customer) => ({ customer, input: inputFor(customer, deals.get(customer.id) || null) })) : [], [ready, customers, deals, inputFor]);

  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const fromMonth = `${year}-01`, toMonth = `${year}-12`;
  // The account starts with the first month any deal started; the year's months are the last twelve.
  const firstMonth = useMemo(() => inputs.reduce((first, { input }) => input.startMonth < first ? input.startMonth : first, fromMonth), [inputs, fromMonth]);
  const perCustomerAll = useMemo(() => inputs.map(({ customer, input }) => ({ customer, rows: dealCashflow(input, firstMonth, toMonth) })), [inputs, firstMonth, toMonth]);
  const perCustomer = useMemo(() => perCustomerAll.map(({ customer, rows }) => ({ customer, rows: rows.slice(-12) })), [perCustomerAll]);
  const bank = useMemo(() => {
    const months = new Map<string, number>();
    let running = 0;
    const span = monthsBetween(firstMonth, toMonth) + 1;
    for (let index = 0; index < span; index += 1) {
      running += perCustomerAll.reduce((sum, item) => sum + item.rows[index].net, 0);
      months.set(addMonths(firstMonth, index), running);
    }
    return months;
  }, [perCustomerAll, firstMonth, toMonth]);
  const total = useMemo(() => {
    const span = monthsBetween(fromMonth, toMonth) + 1;
    const rows = Array.from({ length: span }, (_, index): CashflowMonth => {
      const parts = perCustomer.map((item) => item.rows[index]);
      const sum = (key: keyof CashflowMonth) => parts.reduce((value, row) => value + (row[key] as number), 0);
      const row: CashflowMonth = {
        month: addMonths(fromMonth, index), fromCustomer: sum("fromCustomer"), loanIn: sum("loanIn"), beans: sum("beans"), equipment: sum("equipment"),
        financing: sum("financing"), operating: sum("operating"), extra: sum("extra"), totalIn: sum("totalIn"), totalOut: sum("totalOut"), net: sum("net"),
        cumulative: 0, past: addMonths(fromMonth, index) < today,
      };
      return row;
    });
    // The business's running sum of the monthly net.
    rows.reduce((running, row) => (row.cumulative = running + row.net), 0);
    return rows;
  }, [perCustomer, fromMonth, toMonth, today]);

  const profits = useMemo(() => inputs.map(({ customer, input }) => {
    const data = dealMonth(input, month);
    const actual = month < today;
    return { customer, revenue: actual ? data.totalRevenue.actual : data.totalRevenue.expected, cost: actual ? data.totalCost.actual : data.totalCost.expected, profit: actual ? data.profit.actual : data.profit.expected };
  }).filter((item) => item.revenue || item.cost).sort((left, right) => right.profit - left.profit), [inputs, month, today]);
  const profitTotal = profits.reduce((sum, item) => ({ revenue: sum.revenue + item.revenue, cost: sum.cost + item.cost, profit: sum.profit + item.profit }), { revenue: 0, cost: 0, profit: 0 });


  return <div className="business-finance">
    <div className="section-title"><div><h2>כספים</h2><p>כל הלקוחות יחד · ללא מע״מ</p></div><MoneyToggle value={view} onChange={setView} /></div>
    {!ready ? <div className="workspace-loading"><i /><span>טוען את נתוני הלקוחות…</span></div> : view === "cash" ? <>
      <section className="panel cashflow"><div className="panel-head"><div><h3>תזרים</h3><p>כל הלקוחות יחד, לפי תנאי התשלום של כל לקוח וספק</p></div></div>
        <YearCashflow year={year} onYear={setYear} rows={total} today={today} balance={(month) => bank.get(month) || 0} opening={bank.get(addMonths(fromMonth, -1)) || 0} breakdown={(row) => {
          const index = monthsBetween(fromMonth, row.month);
          const lines = perCustomer.map((item) => ({ customer: item.customer, row: item.rows[index] })).filter((item) => item.row.totalIn || item.row.totalOut).sort((left, right) => right.row.net - left.row.net);
          return lines.length ? <><h4 className="year-cash-sub">לפי לקוח</h4><div className="cashflow-breakdown">{lines.map(({ customer, row: part }) => <button key={customer.id} onClick={() => onOpenCustomer(customer.id)}>
            <strong>{customer.name}</strong><span>נכנס {shekels(part.totalIn)}</span><span>יוצא {shekels(part.totalOut)}</span><b className={part.net < 0 ? "negative-text" : "positive-text"}>{shekels(part.net)}</b>
          </button>)}</div></> : null;
        }} />
      </section>
    </> : <section className="panel">
      <div className="panel-head"><div><h3>רווחיות לפי לקוח</h3><p>{month < today ? "בפועל, לפי מה שסופק" : "צפוי לחודש"}</p></div>
        <div className="ob-month" role="group" aria-label="בחירת חודש"><button aria-label="חודש קודם" onClick={() => setMonth(addMonths(month, -1))}>›</button><strong>{monthTitle(month)}</strong><button aria-label="חודש הבא" onClick={() => setMonth(addMonths(month, 1))}>‹</button>{month !== today && <button className="ob-today" onClick={() => setMonth(today)}>החודש</button>}</div></div>
      {profits.length ? <div className="table-wrap"><table>
        <thead><tr><th>לקוח</th><th>הכנסות</th><th>עלויות</th><th>רווח</th></tr></thead>
        <tbody>{profits.map((item) => <tr key={item.customer.id} className="clickable" onClick={() => onOpenCustomer(item.customer.id)}><td><strong>{item.customer.name}</strong></td><td>{shekels(item.revenue)}</td><td>{shekels(item.cost)}</td><td className={item.profit < 0 ? "negative-text" : "positive-text"}><strong>{shekels(item.profit)}</strong></td></tr>)}</tbody>
        <tfoot><tr><td>סה״כ</td><td>{shekels(profitTotal.revenue)}</td><td>{shekels(profitTotal.cost)}</td><td className={profitTotal.profit < 0 ? "negative-text" : "positive-text"}>{shekels(profitTotal.profit)}</td></tr></tfoot>
      </table></div> : <div className="inline-empty">אין הכנסות או עלויות בחודש הזה.</div>}
    </section>}
  </div>;
}
