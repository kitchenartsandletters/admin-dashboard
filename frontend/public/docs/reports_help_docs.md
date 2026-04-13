# Reports Help

## The three reports

**Daily Sales** runs automatically every business day at 10:00 AM ET. It covers sales from the previous business day's 10:00 AM ET through 9:59 AM ET today. On Mondays it covers the full weekend. After holidays it covers all closed days.

**Weekly Maintenance** runs automatically every Friday. It covers three inventory hygiene checks: negative inventory with no pending orders, products published but not in any collection, and out-of-stock products with unfulfilled orders.
NOTE: This is scheduled for deprecation and will be replaced by Weekly Unfulfilled Line Items (Age / Order Date Companion Report).

**LOP Unfulfilled Orders** is on-demand only. It covers all unfulfilled and partially fulfilled shipping orders since the most recent order tagged LOP.

---

## Automated runs

You don't need to do anything for automated reports — they arrive by email each morning. The coverage window is always calculated from the business calendar, so holidays and weekend closures are handled automatically.

---

## Running on demand

Expand "Run on demand" on any report card to trigger a run outside the normal schedule.

**Date range** — choose the start and end dates. The report covers that window exactly.

**Format** — PDF, CSV, or both. Not shown when "View in dashboard" is selected.

**Delivery**
- *Email* — delivered to the configured recipients. You can override the recipient list by entering comma-separated addresses. Leave blank to use the default.
Default recipient list is: letters@, op@, matt@, gil@
- *View in dashboard* — results open immediately in the browser with sortable tables and download buttons.

**Include excluded products** — check this to bypass the exclusions list for this run only. See Exclusions below.

---

## Next report panel

The Daily Sales card shows the next scheduled run date and the window it will cover.

**Editing the window** — click "Edit window" to change the date range for the next automated run only. Useful when you need to cover a wider period, for example after a missed run or an extended holiday weekend. The override applies once and then clears automatically.

The edit window locks one hour before the scheduled run (9:00 AM ET). After that, use an on-demand run instead.

---

## Business Calendar

Found under Reports → Business Calendar in the sidebar.

Shows which days the store is open, closed for holidays, or open as a special Sunday. Click any date to see:
- The store's status for that day
- Which day the next report will run
- The exact time window that report will cover

Admins and editors can add holiday closures (with an optional label like "Clean Out Sale") and mark special open Sundays. Changes take effect immediately and are reflected in automated report windows.

---

## Exclusions

Found under Reports → Exclusions in the sidebar.

Products on this list are filtered out of the daily sales report automatically. This is for internal products — gift certificates, cookbook club items, and similar — that shouldn't appear in operational sales data.

**Adding a product** — enter the Shopify product ID (numeric) or the full product URL. The system looks up the title automatically.

**Removing a product** — click Remove next to any entry.

**Bypassing for a single run** — check "Include excluded products" in the on-demand panel. This only affects that run.

---

## Recent runs

Each report card shows the last three runs. Click any run to see the job detail page: the exact window covered, delivery method, and — for dashboard-delivery runs — the full results with sortable tables, search, and PDF/CSV download.

---

## Access

| Feature | Admin | Editor | User |
|---|---|---|---|
| View report cards | ✓ | ✓ | — |
| Run on demand | ✓ | ✓ | — |
| Edit next report window | ✓ | ✓ | — |
| Edit exclusions | ✓ | ✓ | — |
| Edit business calendar | ✓ | ✓ | — |
| View job results | ✓ | ✓ | — |