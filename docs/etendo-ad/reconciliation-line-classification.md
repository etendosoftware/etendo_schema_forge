# Reconciliation line classification — how a statement line lands in each filter

How a pending `FIN_BankStatementLine` is classified into the left-panel filters of the
Conciliación tab (**Pendiente**, **Sugerido**, **Por regla**, **Diferencias**, **Conciliadas**),
what the standard matching algorithm's three flags actually change, and why **Diferencias** is
unreachable under the configuration currently shipped to every client.

This is general Etendo behaviour (Core's `StandardMatchingAlgorithm` plus our classifier), not
specific to any one window or feature.

## 1. The classification chain

`AutoMatchSupport.classifyPendingLine(account, line, rules, dateTolDays, amtTolPct)` decides the
state, and it is a strict first-match cascade:

| Order | Condition | State | Spanish label |
|---|---|---|---|
| 1 | standard algorithm returns **STRONG** | `suggested` | Sugerido |
| 2 | a 1:N signal group sums to the line amount within tolerance | `suggested` | Sugerido |
| 3 | standard algorithm returned **any** non-null level (i.e. **WEAK**) | `difference` | Diferencias |
| 4 | a user-defined match rule matches description / reference / partner | `byRule` | Por regla |
| 5 | nothing above | `pending` | Pendiente |

**Diferencias is step 3, and step 3 is only reachable when the algorithm returns WEAK.** That is
the whole subject of this document.

### What Diferencias does NOT mean

The label reads like "the amounts don't add up", and that is the wrong intuition. Every query the
standard algorithm runs filters on `(ft.depositAmount - ft.paymentAmount) = :amount` — an **exact**
equality, with no tolerance whatsoever. A line whose amount differs from every candidate
transaction by one cent produces *no* match at all and lands in **Pendiente**, never in
Diferencias.

`difference` means **an approximate match** — the engine found a transaction for the exact amount,
but only by relaxing one of the *identifying* criteria (reference, business partner, date). It is
a confidence level, not an amount discrepancy.

The partially-reconciled remainder handled by the "post the difference to an accounting concept"
action (ETP-4796) is a different concept again, and lives on the `Parcial` tag rather than this
filter — see `docs/generated-custom-windows/financial-account.md`.

### The date window gate

Before any level is returned, `AutoMatchSupport.standardMatchLevel` discards the match when the
line and transaction dates are more than `DEFAULT_DATE_TOL_DAYS` (**3**) apart. So a STRONG match
from Core can still be downgraded to `pending` by our classifier. A `null` date on either side
passes the window.

## 2. The standard matching algorithm

`org.openbravo.advpaymentmngt.algorithm.StandardMatchingAlgorithm.match()` reads three boolean
flags off the account's `FIN_MATCHING_ALGORITHM` row:

| Column | AD field | Effect |
|---|---|---|
| `MATCHREFERENCE` | Coincidir referencia | passes `line.referenceNo` to the strict query; when `N`, passes `""` |
| `MATCHTRANSACTIONDATE` | Coincidir fecha | passes `line.transactionDate` to the strict query; when `N`, passes `null` |
| `MATCHBPNAME` | Coincidir nombre tercero | switches to the DAO overload that also constrains the payment's business-partner name |

The algorithm runs in two passes:

```
Pass A (STRONG) — getMatchingFinancialTransaction(account, date?, reference?, amount [, bpName])
Pass B (WEAK)   — getMatchingFinancialTransaction(account, date?, amount)
```

Pass B is the fallback: it keeps the amount (and the date, if `MATCHTRANSACTIONDATE = Y`) but
**always drops the reference and the business-partner name**. WEAK therefore means: *"I could not
find it with the identifying data, but I found exactly one candidate for this amount."*

There is also an earlier GL-item branch (§4) that can return WEAK independently of these flags.

## 3. Why Diferencias is unreachable today

Every client ships with all three flags set to `N`:

```xml
<!-- modules/com.etendoerp.go/referencedata/sampledata/GOClient/FIN_MATCHING_ALGORITHM.xml -->
<NAME><![CDATA[Algoritmo Estándar]]></NAME>
<MATCHBPNAME><![CDATA[N]]></MATCHBPNAME>
<MATCHREFERENCE><![CDATA[N]]></MATCHREFERENCE>
<MATCHTRANSACTIONDATE><![CDATA[N]]></MATCHTRANSACTIONDATE>
```

With that configuration, substitute the arguments into both passes:

- **Pass A** → `date = null`, `reference = ""`, no BP constraint. `MatchTransactionDao` skips the
  date filter when the date is `null` and skips the reference filter when the reference is `""`.
  The surviving `where` is: same account, `reconciliation is null`, `processed = true`,
  `status <> 'RPPC'`, and the exact amount.
- **Pass B** → same account, `reconciliation is null`, `processed = true`, `status <> 'RPPC'`, and
  the exact amount.

**The two queries are identical.** Pass B can therefore never find a row that Pass A did not
already find, and Pass A returning a row means STRONG. WEAK is unreachable, so step 3 of the
cascade never fires and the **Diferencias filter always counts 0**.

This is configuration, not a defect. Nothing in the code is broken; the filter simply has no
reachable input until an administrator enables a flag.

### Which flag actually opens it

Not all three are equivalent, and this is the non-obvious part:

| Flag turned on | Does Diferencias become reachable? | Why |
|---|---|---|
| `MATCHREFERENCE = Y` | **Yes** | Pass A gains a reference/document-number filter; Pass B does not. A payment whose reference does not match the bank's, but whose amount does, now falls through to WEAK. |
| `MATCHBPNAME = Y` | **Yes** | Pass A switches to the overload that constrains `finPayment.businessPartner.name`; Pass B drops it. Note this overload constrains the BP name *unconditionally* — when the statement line has no partner name it requires the transaction's to be `null`, which makes Pass A considerably stricter. |
| `MATCHTRANSACTIONDATE = Y` | **No** (on its own) | Pass A gains a date filter, but Pass B applies the **same** date filter. The two queries stay identical, so WEAK remains unreachable. |

So enabling date matching alone changes which lines are *suggested* — it narrows Pass A — without
ever producing a Diferencias line. Only reference or business-partner matching creates the
asymmetry between the two passes that WEAK depends on.

### Recommendation

`MATCHREFERENCE = Y` is the useful one: bank references genuinely differ from the payment
reference recorded in Etendo, which is exactly the "same amount, different identifier" case the
WEAK level was designed to flag for human review.

`MATCHTRANSACTIONDATE = N` should stay as it is. Bank value dates routinely differ from the
Etendo transaction date by a day or two, and our own 3-day window
(`DEFAULT_DATE_TOL_DAYS`) already handles that tolerance far better than an exact-date SQL
equality would.

Changing either flag changes the classification of **existing** lines the next time the tab is
opened — the state is computed on read, not stored — so measure the impact on a real account
before enabling it in production.

## 4. The GL-item branch

One path can return WEAK regardless of the three flags. When the statement line itself carries a
GL item (`line.getGLItem() != null`), the algorithm first looks for a transaction with the same GL
item and amount:

- exact date window (`ft.transactionDate <= line.transactionDate`) → **STRONG**
- retry with no date restriction, and it finds something → **WEAK**

In practice imported statement lines do not carry a GL item — it is set manually, or by a rule
that assigns one — so this branch is dormant for the ordinary import flow. It is the only reason
the Diferencias filter is *theoretically* reachable today, not a case worth relying on.

## 5. Where this lives in code

| Concern | Location |
|---|---|
| Level constants (`AU` / `AP` / `NO` / `MA`) | `FIN_MatchedTransaction` (Core) — `STRONG` / `WEAK` / `NOMATCH` / `MANUALMATCH` |
| Two-pass algorithm | `modules_core/org.openbravo.advpaymentmngt/.../algorithm/StandardMatchingAlgorithm.java` |
| The queries behind each pass | `modules_core/org.openbravo.advpaymentmngt/.../dao/MatchTransactionDao.java` |
| Flag storage | `FIN_MATCHING_ALGORITHM` table, per financial account |
| Our classifier + date window | `AutoMatchSupport.classifyPendingLine` / `standardMatchLevel` (com.etendoerp.go) |
| Filter chips and badges | `ReconciliationSplitPanel.jsx` — `STATUS_CODES`, `STATUS_LABEL_KEYS` |
