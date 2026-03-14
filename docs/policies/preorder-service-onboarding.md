We are ready to begin onboarding the preorder-service into the admin dashboard architecture.

Assume you know our broader platform patterns, including Railway + Supabase modules and the service/table UI rubric used by the other modules, but assume you know nothing about preorder-service itself beyond what is described here.

Your job is to help design and scaffold the admin-dashboard integration surface for preorder-service in a way that is faithful to the actual backend architecture and current production-ready state.

Important constraint: do not invent backend capabilities that are not explicitly described below. The dashboard should expose only what is truly ready for UI-level production, while leaving room for future phases.

1. High-level role of preorder-service

preorder-service is the system that transforms raw Shopify and inventory events into structured preorder intelligence.

It is not the webhook ingest layer. It is the classification + state-machine + derived-reporting layer.

At a high level, preorder-service currently owns:
	•	structural preorder classification
	•	anomaly detection
	•	effective publication date resolution
	•	inventory arrival tracking
	•	pub-date history tracking
	•	append-only preorder commitment ledger
	•	lifecycle snapshot freezing
	•	lifecycle derivation
	•	weekly release reporting prototype

It does not currently own:
	•	Shopify writes
	•	Slack notifications
	•	GitHub issue creation
	•	sales channel publish/unpublish actions
	•	arbitrary dashboard-side override magic beyond what already exists in backend tables/endpoints

The dashboard module should therefore present preorder-service as a read-heavy operational intelligence module with limited explicit actions.

2. Upstream/downstream system boundary

This is critical and must be reflected in the UI language.

webhook-gateway responsibilities
	•	receives Shopify webhooks
	•	validates HMAC
	•	logs raw facts into preorder.tracking

preorder-service responsibilities
	•	reads from tracking-derived state
	•	classifies products
	•	persists derived state to Supabase
	•	tracks preorder lifecycle and reporting readiness

The dashboard should not blur these boundaries. It should not imply that preorder-service directly receives Shopify webhooks or mutates Shopify.

3. Current backend state that is ready for dashboard use

These backend tables/views/services exist or are considered stable enough to support dashboard integration:

Core persistent tables
	•	preorder.product_status
	•	preorder.inventory_arrival
	•	preorder.pubdate_history
	•	preorder.commitment_ledger
	•	preorder.lifecycle_snapshot
	•	preorder.product_overrides
	•	preorder.release_state
	•	preorder.release_runs
	•	preorder.replay_cursor
	•	preorder.tracking (authoritative event log, but not something the first dashboard surface should expose directly except perhaps in deeper diagnostics)

Important derived views
	•	preorder.vw_arrival_timing
	•	preorder.vw_lifecycle_state
	•	preorder.vw_candidate_release_base

Important workers / services
	•	build_commitment_ledger.py
	•	lifecycle_snapshotter.py
	•	weekly release engine prototype

API layer already present
	•	reclassification API endpoints exist and are admin-protected
	•	deterministic orchestration exists for classification + persistence
	•	classification + persistence flow is stable

4. Canonical preorder logic the dashboard must respect

The dashboard must display preorder state according to the backend’s canonical rules, not reinterpret them in the UI.

Structural preorder identity

A product is structurally preorder-eligible only when:
	•	it has the 'preorder' tag
	•	and it is in the preorder collection

Tag/collection misalignment is an anomaly.

Effective publication date resolution order
	1.	override_date
	2.	custom.pub_date
	3.	exactly one valid legacy date tag
	4.	otherwise null

The dashboard should show the resolved effective pub date and ideally indicate whether it came from override / Shopify pub date / legacy fallback when that becomes available, but it should not attempt to compute this on the client.

Structural classification statuses

These are the canonical product states:
	•	active_preorder
	•	early_stock_arrival
	•	historical_preorder
	•	anomaly_*
	•	not_a_preorder_product

The dashboard should treat these as authoritative labels coming from backend persistence.

Arrival timing

Derived categories:
	•	no_arrival
	•	early_arrival
	•	on_time_arrival
	•	late_arrival

This is orthogonal to structural classification.

Lifecycle

Current lifecycle derivation exists and is snapshot-based. The term backordered currently appears in vw_lifecycle_state, but backend notes already identify that as misleading and likely subject to future renaming. The dashboard should therefore avoid overcommitting to polished business language around lifecycle states if the backend naming is still transitional.

5. What is production-ready for first UI exposure

The first preorder dashboard module should focus on the pieces that are ready for stable UI consumption.

Ready to display
	1.	Product classification status
	2.	Effective pub date
	3.	Arrival timing
	4.	First positive inventory arrival timestamp
	5.	Lifecycle snapshot facts
	6.	Current ledger-derived operational quantities, where already persisted or straightforward to query
	7.	Anomaly state and anomaly type
	8.	Release reporting readiness / release-state information
	9.	Reclassification actions
	10.	Weekly release candidate review surface

Not ready to overpromise in UI
	1.	Full live order-for-order ledger debugging UI
	2.	Fulfillment verification workflows beyond what is explicitly persisted
	3.	Slack/GitHub notification controls
	4.	Shopify mutating actions
	5.	Bulk override experiences unless they map directly to existing backend controls
	6.	A polished operational state machine for every future phase that is only described in notes

6. The dashboard module should likely be split into two parts

Following the rubric of the other modules, we want a service layer component and a table/detail layer, very similar in spirit to how Request Service is structured.

Please assume the preorder module should follow that pattern.

A. Service layer

This should be the outer shell of the module and should include:
	•	page title
	•	summary / quick metrics
	•	filters
	•	search
	•	pagination
	•	export hooks if appropriate
	•	bulk-safe actions only if backend support exists
	•	a table/card area for records
	•	detail sidebar or equivalent record inspection surface

B. Table/detail layer

This should provide:
	•	sortable rows
	•	dense operational visibility
	•	row selection if justified
	•	details sidebar or modal
	•	direct links to Shopify Admin product page
	•	eventual public PDP link if the dashboard architecture already supports handle lookup through existing proxy routes, but do not assume that exists unless it is already normal in admin-dashboard

7. How the preorder module should look and act

We want this module to feel operational, high-signal, and decision-oriented.

Think less “customer service inbox” and more “inventory + release intelligence console.”

Tone of the UI
	•	operational
	•	trustworthy
	•	dense but readable
	•	little decorative language
	•	emphasizes state, dates, exceptions, and required action

Primary user goals

A dashboard user should be able to answer:
	1.	What products are currently active preorders?
	2.	Which titles are early stock arrivals?
	3.	Which titles have anomalies that require attention?
	4.	Which preorder titles are approaching release?
	5.	Which titles are eligible to be counted for reporting?
	6.	Which releases have already been reported?
	7.	If a product changed pub date or inventory state, what is its current derived truth?
	8.	Can I safely trigger reclassification for one or many products?

Secondary user goals
	1.	Inspect lifecycle snapshot state for a product
	2.	Inspect whether a title has first positive inventory
	3.	Understand why a title is in a given classification
	4.	Review release candidates for the target reporting week

8. Recommended first module views

Please use these as the starting architecture for the admin dashboard module.

View 1: Preorder Overview

A default operational table of preorder-relevant products.

Recommended columns:
	•	Product title
	•	Shopify product id
	•	Classification status
	•	Effective pub date
	•	Arrival timing
	•	Lifecycle state
	•	First inventory arrival
	•	Anomaly type
	•	Reporting state / already reported flag
	•	Action column

Recommended filters:
	•	classification status
	•	anomaly only / non-anomaly only
	•	arrival timing
	•	release week
	•	reporting state
	•	search by title / product id / ISBN if available in the dataset

Recommended row action:
	•	open details sidebar

View 2: Release Review / Weekly Reporting Queue

This is important because next week we will need a mechanism to approve preorder releases for reporting.

This view should be centered on the output contract of the weekly release work.

It should not derive release candidates in the client. It should consume backend-derived release readiness.

The UI should be designed around these concepts:
	•	titles explicitly queued for reporting
	•	target Sunday→Saturday reporting week
	•	banked presales
	•	regular weekly sales
	•	combined reporting quantity
	•	reported/unreported state

Even if some of the exact fields are still being finalized, the dashboard architecture should leave space for:
	•	selecting a reporting week
	•	viewing queued titles for that week
	•	reviewing quantities before final reporting action
	•	marking releases as reported only through backend-supported action flow

This should be treated as an approval/review surface, not just a passive table.

View 3: Product Detail Sidebar

When a preorder row is opened, show a detailed operational pane.

Recommended sections:
	1.	Product identity
	•	title
	•	product id
	•	maybe ISBN/vendor if available
	2.	Structural status
	•	classification status
	•	anomaly type
	•	effective pub date
	3.	Inventory / arrival
	•	first positive inventory arrival
	•	arrival timing
	4.	Lifecycle
	•	lifecycle state
	•	presale snapshot totals if available
	•	lifecycle closed timestamp if available
	5.	Reporting
	•	already reported?
	•	release report week if present
	•	released at
	•	csv filename if present
	6.	Actions
	•	reclassify product
	•	possibly inspect product in Shopify Admin

9. Weekly release engine integration guidance

This is the most important forward-looking part of the dashboard work.

We are in the middle of shifting the weekly release engine from a purely local prototype into something admin-driven.

Important design rule

The weekly release engine must not decide on its own which preorder titles are eligible for reporting based only on pub date math.

The authority path should be:

preorder-service / admin workflow
→ explicit release-state / release queue
→ weekly release engine consumes that state
→ reporting CSV generated
→ release rows marked reported

So the dashboard should be designed to support that model.

What we know right now
	•	preorder.release_state exists
	•	preorder.release_runs exists
	•	preorder.vw_candidate_release_base exists
	•	the current weekly engine prototype can generate a CSV successfully
	•	release_state is currently empty
	•	the database layer for release-state architecture is already in place
	•	Sunday→Saturday is the correct reporting week model
	•	presales before official pub date count as presales, even if inventory arrived early

What the dashboard should help enable next

We need an admin-facing mechanism to:
	1.	review upcoming release candidates
	2.	approve / queue them for reporting week
	3.	inspect banked presales + weekly sales context
	4.	finalize reporting state transitions

This suggests the dashboard module should include a release approval surface even if the first implementation is read-only or lightly actionable.

10. Suggested preorder module information architecture

Please design the module around these logical groupings.

Summary cards / top metrics

Potential top cards:
	•	Active Preorders
	•	Early Stock Arrivals
	•	Anomalies
	•	Eligible for Reporting This Week
	•	Already Reported This Week

Only use cards for data that is cheap and already supported by backend queries.

Main table tabs or segmented controls

Potential segments:
	•	Active / Early
	•	Anomalies
	•	Release Queue
	•	Reported
	•	All Preorder-Relevant

This is just a suggested structure. Use only if it fits the admin dashboard’s existing module pattern.

Row-level badges

Use badges for:
	•	classification status
	•	anomaly type
	•	arrival timing
	•	already reported / pending release

These should be visually distinct but not overly colorful or noisy.

11. Actions that are ready for UI production

Only these should be considered safe to expose now.

Reclassify one product

This is ready because reclassification API endpoints already exist.

Batch reclassify

Potentially ready if it maps cleanly to the existing batch reclassify endpoint and the dashboard already has a rubric for safe bulk actions.

Open in Shopify Admin

Ready.

Release-review actions

Design for these, but do not assume all backend mutations already exist unless they do. The UI may need to scaffold the approval flow first, then wire it up once the backend mutation contract is finalized.

12. Actions that should NOT yet be exposed casually

Do not expose any UI that implies:
	•	editing ledger rows
	•	direct manual mutation of lifecycle snapshots
	•	hand-editing arrival records
	•	arbitrary status overrides outside existing backend pathways
	•	direct release-state mutation without explicit backend contract
	•	deleting or rewriting tracking events

The system is event-driven and replayable. The UI should respect that architecture.

13. Data contract hints for the dashboard chat

When thinking about data-fetching strategy, assume the dashboard will likely need endpoints or query adapters that can return a flattened preorder row containing some or all of:
	•	product_id
	•	title
	•	isbn
	•	classification_status
	•	anomaly_type
	•	effective_pub_date
	•	first_positive_inventory_at
	•	arrival_timing
	•	lifecycle_state
	•	presale_commitment_total
	•	released_to_reporting
	•	release_report_week_start
	•	release_report_week_end
	•	released_at
	•	csv_filename

Do not assume all of this is currently available in one endpoint. Part of the admin dashboard work may be defining the adapter/query layer that joins these sources cleanly.

14. What to avoid in the admin dashboard planning

Please avoid these mistakes:
	•	treating preorder-service as a customer support queue
	•	assuming it owns Shopify writes
	•	assuming the weekly release engine should infer release candidates on its own
	•	assuming all historical/diagnostic tables should be front-and-center in the first UI
	•	over-designing UI around lifecycle names that backend notes already flag as transitional
	•	building UI for speculative future phases before we finish release approval + reporting flow

15. What I want from you now

Using the above, help design the preorder-service module for the admin dashboard in the same architectural spirit as the existing modules.

Please provide:
	1.	A recommended module structure
	•	service layer component
	•	table/detail layer component(s)
	•	any release review subcomponents
	2.	A proposed UI behavior spec
	•	what appears on the page
	•	what filters exist
	•	what detail sidebar shows
	•	what actions are safe now
	3.	A proposed data flow contract
	•	what data the admin dashboard needs from preorder-service
	•	what should be fetched together
	•	what should be deferred
	4.	A proposed release approval / weekly reporting surface
	•	focused on what is actually ready
	•	designed so next week we can begin approving preorder releases for reporting
	5.	Suggested component names / file structure
in the style of the existing admin dashboard modules, but without assuming dependencies or styles you cannot verify
	6.	Any clarifying questions only if absolutely necessary, and only where backend ambiguity truly blocks good design

Be thorough, but do not be presumptuous about admin dashboard internals you cannot see. The goal is to onboard preorder-service into the admin dashboard architecture in a disciplined, production-aware way.