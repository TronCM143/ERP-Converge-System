# Converge ERP — Business Processes

Every end-to-end flow the system runs, and where each rule is enforced in code.
Written from the source on 2026-09-08; file references are the authority if this
document and the code ever disagree.

**Read this as a map of enforcement points, not a wish list.** Where a rule is
enforced only in the UI, or not at all, it says so explicitly.

---

## 1. The four roles

Roles come from the JWT and are checked with `[Authorize(Roles = …)]` on every
controller. There are four.

| Role | Owns | Cannot |
|---|---|---|
| `quotation` | Clients, CRM board, quotations, products, invoices | Decide approvals; admin settings |
| `engineer` | Approval decisions up to the engineer ceiling | Create or edit quotations; purchasing |
| `purchasing` | Purchase requests, BOMs, purchase orders, suppliers | Anything sales-side |
| `admin` | Everything, plus settings, user accounts, Google OAuth | — |

One inversion is deliberate and load-bearing, documented at the top of
`Controllers/QuotationController.cs`: the **class-level** `[Authorize]` must
carry the *widest* set any action allows, because ASP.NET combines controller
and action attributes with **AND**. An action can only narrow the class gate,
never widen it. Leaving `"quotation,admin"` on the class made the engineer's 403
on the PDF endpoint unfixable at the action level — the class rejected the
request before the action was consulted.

---

## 2. Sales pipeline (CRM)

### 2.1 The stages

`ClientStage` in `Models/Entities/Client.cs`:

```
Leads(0) → Quote(1) → Proposal(2) → Won(3)
                                    Pending(4)   Lost(5)
```

`Pending` and `Lost` are numbered 4 and 5 rather than slotted in between,
because the value is persisted as an int — renumbering would silently re-stage
every client already in the database. **Board order is a frontend concern**
(`STAGES` in `CrmDashboardPage.tsx`), and there `Pending` does sit between
Proposal and Won.

`Lost` was missing from the enum for a period while the board already had a Lost
column. The reorder endpoint answered `Unknown stage 'Lost'` with a 400, the
card snapped back, nothing persisted, and no quotation was ever rejected — which
is why the won/lost chart could not move.

### 2.2 Moving a card

Dragging a card calls `POST /api/clients/reorder` →
`ClientService.ReorderClientsAsync` → `PrepareStageChangeAsync`.

Entering `Won` or `Lost` is detected as a transition (`EnteredWon` /
`EnteredLost`), not a state — so the Won email and the won-deal sheet fire once,
on the crossing, rather than on every save while the card sits there.

### 2.3 The Proposal gate

**This is the one hard gate in the CRM.** Moving a card into `Proposal` runs
`QuoteApprovalService.EvaluateClientAsync` and throws
`ApprovalRequiredException` unless the quotation clears it.

The gate reads the client's **newest** quotation — the same "current
opportunity" the card shows — and decides:

| Condition | Result |
|---|---|
| No quotation at all | **Passes.** Approval cannot be what blocks the move |
| `GrandTotal` < threshold | **Passes.** Small quotes need no sign-off |
| `ApprovalState = Approved` | **Passes** |
| `ApprovalState = Pending` | Blocked — `awaiting-approval` |
| `ApprovalState = Rejected` | Blocked — `rejected`, revise and resubmit |
| `ApprovalState = NotRequired` but over threshold | Blocked — `approval-required` |

The exception carries the whole `ApprovalGate` (which quotation, which reason,
what amount) rather than a bare refusal, because the board needs that to offer
**"Send for Approval"** in place of an error.

**`skipApproval` is a real bypass.** `ReorderClientsAsync` accepts it and passes
it to `PrepareStageChangeAsync`, which skips the throw entirely. It is reachable
from the API by any caller with the `quotation` role.

---

## 3. Quotation lifecycle

### 3.1 Two independent axes

This is the single most important thing to understand about quotations, and it
is spelled out in `Models/Entities/QuoteApproval.cs`:

- **`QuotationStatus`** — `Draft → Sent → Approved / Rejected`. This means
  **the deal was won or lost**. It drives `TotalSales`, the won-vs-lost chart,
  and the CRM's Won/Lost columns.
- **`QuotationApprovalState`** — `NotRequired / Pending / Approved / Rejected`.
  This means **where internal engineer sign-off stands**.

They are deliberately *not* the same field. Folding approval into
`QuotationStatus` would mean an engineer approving a quote **books revenue**.

`ApprovalState` is denormalised onto `Quotation` from the newest `QuoteApproval`
row, written in the same transaction. The CRM board renders every client's card
and needs the state without a per-card query, and the stage gate reads it on
every drag.

### 3.2 Numbering

`QTN-{year}-{0000}`, the sequence restarting each calendar year —
`QuotationService.GetNextQuotationNumberAsync()`.

The editor previews the next number in its header via
`GET /api/quotations/next-number`, and `CreateQuotationAsync` calls **the same
method**. Two copies of that rule would eventually disagree, and the place it
would surface is a header showing one number and the saved record holding
another.

It is a **preview, not a reservation**: no lock, no sequence burned. Two people
starting at once see the same string; the second to save gets the next one.

> Ordering is done on the *string*, which works only because the sequence is
> zero-padded to fixed width. If the padding ever changes this must become a
> numeric comparison, or the year's 10th quotation starts reissuing numbers.

### 3.3 Line snapshots

`QuotationMaterialItem` copies `Sku`, `Brand`, `ImageUrl`, `DatasheetUrl`,
`Manufacturer` and `UnitCost` from the product **at the moment the line is
written**. A catalog edit next month must not rewrite a quotation already sent
to a client, and a product later deactivated must not blank an old quote's PDF.

`UnitCost` is snapshotted for the same reason on the money side: a supplier
price rise next quarter must not retroactively turn an approved quote into a
loss-maker in the reports.

### 3.4 Validity

`ValidUntil` is **stamped at creation** from the Settings validity period, not
computed from `CreatedAt` on read. The admin may change the period tomorrow; a
quote already in a client's inbox keeps the deadline it was sent with.

### 3.5 Autosave

The editor persists a draft ~1.5s after typing stops, but only once there is
**a client AND at least one catalog-matched line** — exactly what the create
endpoint requires. Saving sooner would litter the list with empty drafts every
time someone opened the form and changed their mind.

### 3.6 AI generation

`POST /api/quotations/generate` → `GroqQuotationGenerationService`. A
prompt-to-quotation feature that matches free text against the product catalog.
The generated result is a **draft the user edits**, not a committed record.

---

## 4. Approval workflow

### 4.1 Two money bands, two different powers

| Setting | Key | Default | Effect |
|---|---|---|---|
| Approval threshold | `quote.approval.threshold` | ₱100,000 | Below this, **no approval needed at all** |
| Engineer ceiling | `quote.approval.engineerCeiling` | 0 (disabled) | Above this, **only an admin may approve** |

So a quotation can sit in one of three bands: under the threshold (moves
freely), between threshold and ceiling (engineer may decide), above the ceiling
(admin only).

### 4.2 Submitting

`QuoteApprovalService.SubmitAsync` creates a `QuoteApproval` row and stamps
`AmountAtSubmission` — a snapshot, kept **because the quotation stays editable**.
The dashboard has to show what was actually submitted, not what the quote says
today.

Rejected work is resubmitted as a **new row**, never by reopening the old one.
The set of rows for a quotation therefore *is* its approval history, which is
why there is no separate history table.

### 4.3 Deciding

`DecideAsync` enforces, in order:

1. The request must still be `Pending` — a decided request cannot be re-decided.
2. A rejection **requires a reason**.
3. Amount-band routing: if approving, and a ceiling is set, and
   `AmountAtSubmission` exceeds it, and the decider is not an admin → refused.

Rule 3 lives in the service, not the controller, so the dashboard, the bulk
endpoint and the one-tap email link are all bound by the same check.

**Rejection stays open to the engineer at any amount.** Sending work back is
never the risky direction, and blocking it would leave the request rotting while
sales waits for an answer.

### 4.4 One-tap approval links

Approval emails carry a signed link. The signing key lives in the settings table
(`ApprovalLinkSecret`), not `appsettings.json`, so it survives a redeploy and
never sits in source control. It is deliberately **excluded from the settings
API whitelist** — anyone who can read it can approve anything.

### 4.5 Escalation

`ApprovalEscalationWorker` (a `BackgroundService`) waits 2 minutes after
startup, then sweeps **hourly**, calling `EscalateStalePendingAsync`.

Escalation is **a second notification, not a reassignment** — the request stays
with the same approvers, who simply get chased. `EscalatedAt` is stamped so each
request is chased **once**, not every hour forever.

---

## 5. Quotation → Purchasing

`SendToPurchasingAsync` is the bridge, and it refuses three ways: the quotation
must exist, must not already have a `PurchaseRequestId`, and must have at least
one material item.

```
Quotation ──SendToPurchasing──► PurchaseRequest ──► BillOfMaterial ──► PurchaseOrder
   │                                  │                   │                  │
   └─ Status := Sent                  └─ source:          └─ Status:         └─ prices pulled
      PurchaseRequestId set              "Quotation"         "Processing"       BACK from the
                                                                                originating quote
```

Note the last arrow: `PurchaseOrderService.CreateFromBomAsync` matches BOM items
**back to the originating quotation** to carry unit price and tax. Purchasing
pricing is derived from what sales quoted, not re-entered.

Labor items do **not** cross this bridge — only `MaterialItems`. Labor is not
something purchasing buys.

### 5.1 BOM item statuses

Rows carry `Pending` / `Ready` / `Cancelled` (plus in-flight `Ordered` /
`Received`). Only `Ready` and `Cancelled` are tinted on the table —
`bomRowTintCls` in `purchasing/purchasingShared.tsx` — because colouring every
state leaves nothing for the eye to catch on.

---

## 6. Won → Invoiced → Paid

### 6.1 Marking a deal won

`ApproveAsync` requires `Status = Sent` — only a quotation that has been sent to
purchasing can be approved. It then sets `Approved`, moves the client to `Won`
via `PrepareStageChangeAsync`, and if the Won transition actually happened,
emails the deal-won notice **with the quotation PDF attached** and writes the
Google won-deal sheet.

### 6.2 Invoicing

`Quotation → Invoice → Payments` closes a loop that previously stopped at "won":
a deal could be booked into the sales figures with nothing recording that the
client still owed for it.

An invoice is **its own document, not a flag on the quotation**. One quotation
can be invoiced in stages (deposit, then balance); an invoice can be cancelled
and reissued without touching the quotation; and the amounts can legitimately
differ once the work is done. A flag expresses none of that.

`CreateFromQuotationAsync` deliberately does **not** require the quotation to be
Approved. Deposits are invoiced before a deal formally closes, and refusing
would push people to record the money outside the system — the exact failure the
module exists to prevent.

### 6.3 Invoice status is partly derived

| Status | Set how |
|---|---|
| `Draft` | On creation. Freely editable, owed by nobody |
| `Issued` | Explicitly, by `IssueAsync`. **This is when it becomes a receivable** |
| `PartiallyPaid` / `Paid` | **Derived from recorded payments**, never set by hand |
| `Cancelled` | Explicitly, by `CancelAsync` |
| *Overdue* | **Not stored at all** — it is `Issued` + a due date in the past |

Paid states are derived because a status someone can type will eventually
disagree with the money. Overdue is not stored because keeping it true would
need a nightly job.

### 6.4 Payment rules

`RecordPaymentAsync` refuses: zero/negative amounts, payment against a
`Cancelled` invoice, payment against a `Draft` invoice (issue it first), and
**overpayment**.

Overpayment is refused rather than absorbed because it is nearly always a typo —
an extra zero, or the same payment entered twice — and a silently accepted one
turns the receivables total into a number nobody can reconcile.

---

## 7. Inventory

### 7.1 Stock

`StockQuantity` is only ever changed through `ProductService.AdjustStockAsync`,
which writes the matching `InventoryTransaction` row in the same operation, so
the running total and the ledger cannot drift. Pulling out more than is on hand
is refused with the actual figure.

### 7.2 Cost vs price

`Product.Cost` is **nullable on purpose**. An unknown cost is a different fact
from a zero cost, and treating "not filled in yet" as free would report a **100%
margin on every un-costed line** — the most dangerous possible default on a
screen someone approves prices from. A null cost makes the margin unknown, and
the approval dashboard says so.

### 7.3 Automatic product images

`ProductImageWorker` + `ProductImageQueue` resolve a product image in the
background via Google image search. `ImageSearchAttempted` is set once an
attempt has been made **regardless of outcome**, so a product with no findable
image is not re-searched on every click. Only an explicit manual refresh clears
it.

---

## 8. Cross-cutting

### 8.1 Audit

`IAuditService.LogAsync(entity, id, action, actor, oldValue, newValue, detail)`
is called on every state transition — quotation created/updated/approved/
rejected, client stage changed, settings changed, approvals decided. This is
what the quotation editor's **View activity** drawer reads.

### 8.2 Notifications

`NotificationDispatchService` fans out to **email where a user has one, SMS
otherwise** (`M360SmsSender`). Both are no-ops with a logged warning when
unconfigured, so a missing SMS key degrades rather than throws.

### 8.3 Google Drive

Quotation PDFs are mirrored to Drive on create/update/delete. **Reads use the
service account; writes use the connected OAuth account** — the service account
has no storage quota of its own.

### 8.4 Settings

`AppSettings` is a key/value table read **per render, not cached** — an admin who
changes the company address expects the very next PDF to show it, not the one
after a restart.

---

## Known gaps

Recorded honestly, from reading the code:

- **`skipApproval` is an unguarded bypass.** `ReorderClientsAsync` takes it
  straight from the request body. Any caller with the `quotation` role can move
  a card past the Proposal gate by setting it — no separate role check, no audit
  distinction beyond the stage-change entry.
- **The approval gate reads only the newest quotation.** A client with an
  approved recent quote and an older unapproved one passes the gate.
- **`company.terms.url` is an orphaned setting.** Still editable on the admin
  settings page, but nothing reads it since the Terms & Conditions line was
  removed from the quotation PDF.
- **Overdue invoices are computed nowhere.** The status is defined as "Issued
  plus a past due date", but no query or view in the system currently surfaces
  that set.
- **PR item status is a bare string**, not an enum — `Status = "Pending"` in
  `PurchaseRequest.cs` — so typos are possible where quotation statuses are
  type-checked.
