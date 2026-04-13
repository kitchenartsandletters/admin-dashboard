# Reports — How It Works

I've added a Reports section to the admin dashboard. Here's a quick walkthrough of what it does, how the automation works, and what you can control from the dashboard.

This admin area is only open to admin (me) and editors (you). It is not open to users (everyone else).

---

## What's in Reports

You'll see three report cards:

**Daily Sales Report** — our core operational report. Sales grouped by product, organized into four sections: main sales, backorders, out-of-stock, and preorders. Delivered as CSV + PDF by email. This one runs automatically every business day.

**Weekly Maintenance Report** — inventory hygiene checks: products with negative inventory and no unfulfilled orders, products published to the online store but not in any collection, and out-of-stock products with unfulfilled orders. Runs automatically on Fridays.

**NOTE:** This is scheduled for deprecation and will be replaced by Weekly Unfulfilled Line Items (Age / Order Date Companion Report) -- on demand availability as well as a weekly automated run.

**LOP Unfulfilled Orders** — all unfulfilled and partially fulfilled shipping orders since the most recent order tagged LOP. This one is on-demand only; no automatic schedule.

**FUTURE FEATURES:** A suite of maintenance reports that will help to dislodge stranded orders, flag and notify of inventory issues, and beyond.

---

## What "automated" means

The daily sales report runs every morning at 10:00 AM ET on business days. It arrives in your inbox automatically; you don't need to do anything. The same goes for the weekly maintenance report on Fridays.

The reporting window for the daily report is always:
- **Start:** 10:00 AM ET on the last open business day
- **End:** 9:59 AM ET today (the day the report runs)

So a Monday report automatically covers Saturday and Sunday sales too. If we were closed Friday for a holiday, Saturday's report covers Thursday and Friday. If we're closed on a Saturday and Sunday, Monday's report covers Friday through Sunday.

---

## The Business Calendar

The admin dashboard has a Business Calendar page (under Reports in the sidebar) that shows which days the store is open, closed, or has special hours. This is what the automated reports use to figure out their coverage window.

If you click on any date in the calendar, you'll see:
- Whether the store is open or closed that day
- Which day the next report will run
- Exactly what time window that report will cover

This is useful for planning — for example, clicking on July 4th shows you that the next report runs Monday July 6th and covers July 3rd through July 6th 9:59 AM ET, because July 5th is a Sunday.

Admins can also add holiday closures and special open Sundays directly from the calendar. Changes take effect immediately.

---

## Running a report on demand

Every report card has a "Run on demand" section you can expand. This lets you trigger a report outside the normal schedule. It's useful when:

- You need a report for a specific date range that doesn't match the automated window
- Something went wrong with an automated run and you need to re-run it
- You want to see data in the dashboard rather than wait for an email

When running on demand you can choose:

**Date range** — pick any start and end date. The report will cover that window.

**Format** — PDF, CSV, or both. If you choose "View in dashboard," format selection disappears since you're viewing the data directly.

**Delivery** — Email (sent to the configured recipients, currently letters@, op@, matt@, gil@) or "View in dashboard" (the results open in the browser right away, with sortable tables and download buttons for PDF and CSV).

**Recipients** — when delivering by email, you can override the default recipient list by typing comma-separated addresses in the recipients field. Leave it blank to use the default list.

---

## The "Next report" panel

On the Daily Sales report card you'll see a panel showing the next scheduled run date and the window it will cover. For example, on a Sunday it might show:

> **Next report**
> Monday, April 14
> Window: Apr 13, 2026 10:00 AM ET → Apr 14, 2026 9:59 AM ET

This is the window the automated Monday report will use if nothing is changed.

**Editing the window (admins and editors)** — there's an "Edit window" button that lets you change the date range for the next scheduled run only. This is useful when you need the report to cover a wider period than normal.

A good example: say yesterday was hectic and Monday's staff needs Friday, Saturday, Sunday, and Monday morning's sales in one report. You'd click "Edit window," set the start date to Friday, set the end date to Sunday, and save. The Monday automated report will use that window instead of the default, and the email subject will say "(Extended Window)" so recipients know it covers a broader period. The override is automatically cleared after the report runs.

There's a cutoff — you can't edit the window within one hour of the scheduled run time (so after 9:00 AM ET on the run date). After that, the edit button locks and you'll need to use an on-demand run instead.

---

## Report exclusions

Under Reports → Exclusions in the sidebar, you'll find a list of products that are excluded from the daily sales report by default. These are internal products (like gift certificates and cookbook club items) that we don't want appearing in operational sales data.

When running a report on demand, there's an "Include excluded products" checkbox in the run options panel. Checking it bypasses the exclusions list for that run only; useful if you're auditing sales data and need to see everything.

Admins and editors can add or remove products from the exclusions list at any time. Adding a product requires its Shopify product ID — the system will automatically look up the title from Shopify.

---

## Viewing past runs

Each report card shows the three most recent runs with their status (success, failed, running) and timestamps. Clicking any of them takes you to the job detail page, which shows the exact window covered and, for dashboard-delivery runs, the full sortable results table with download options.

---

Have fun exploring and let me know if issues arrive. Ideas and feedback are always welcome.