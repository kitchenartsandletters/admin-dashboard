This guide shows you how to add and maintain “Damaged” editions of books in Shopify so they:
	- stay easy to find and manage internally,
	- never compete with the main (undamaged) product in search,
	- automatically publish/unpublish with inventory changes,
	- and automatically point search engines to the main product (canonical).

You don’t need to edit code, metafields, or databases. Just follow the naming and inventory steps below.

⸻

HOW IT WORKS
	- “Damaged” handle rule: Every damaged product must end with -damaged (example: test-book-title-damaged).
	- This is the only convention DBS relies on. Please keep it consistent.
	- Automatic canonical link: When you create/update a damaged product, DBS writes a canonical handle to the product metafield for SEO, pointing back to the main product. You don’t need to touch this.
	- Publishing & redirects:
	- If any damaged variant has stock > 0 → the damaged product is published and no redirect is created.
	- If all damaged variants reach stock 0 → the damaged product is unpublished and DBS creates a redirect from /products/{handle}-damaged to /products/{canonical-handle}.
	- No manual redirects needed: Please don’t create redirects between the damaged and main product. DBS will handle it based on stock.
	- No database work: You never need to update external tables or tools. It’s all driven by Shopify and inventory.

⸻

Before you start: naming & condition rules
	- Title format: Use the original book title and append “: Damaged”
	- Example: Test Book Title: Damaged
	- Handle format (required): Original handle + -damaged
	- Example: test-book-title → test-book-title-damaged
	- Condition options (the variants):
	- Light Damage
	- Moderate Damage
	- Heavy Damage
These are the exact phrases our system recognizes and uses for reporting. Use them as the option values under an option named Condition.
	- Prices & notes:
	- Set a fair markdown (e.g., 15–40% off) appropriate to the condition.
	- Add a short note in the product description that the book is damaged and still readable.

⸻

STEP-BY-STEP USAGE
One-at-a-time: creating a single damaged book (fast path)
1.	Find the main product in Shopify Admin (Products).
2.	Click “Duplicate”, then edit the duplicate:
	- Title: Append : Damaged (e.g., Test Book Title: Damaged).
	- Handle: Append -damaged (e.g., test-book-title-damaged).
3.	Set up variants for condition
	- Add an option named Condition.
	- Create the three variants: Light Damage, Moderate Damage, Heavy Damage.
	- (If you only have one or two conditions on hand, you can keep just those, but stick to the exact names.)
4.	Inventory
	- Turn Track quantity ON.
	- Set quantities for each condition (the variant inventory).
	- Ensure the correct Location is set (your default store location is fine).
5.	Pricing
	- Set each condition’s price.
	- Optional: Add compare-at pricing to show savings.
6.	Media & description
	- You can reuse the main product photos.
	- Add a short condition note (e.g., “Corners scuffed; interior clean”).
7.	Save
	- If at least one variant has quantity > 0, DBS will keep the product published and handle SEO automatically.
	- If all variants are 0, DBS will unpublish and redirect to the main product.

That’s it—DBS will take care of canonical tags and any redirects later.

⸻

Bulk method (for the initial DBS catalog)

If you need to create many damaged products at once, use this bulk workflow.

1. Make a copy of our DBS Bulk Sheet (template structure)

Columns to include:
	- canonical_handle (required) – the handle of the main product (e.g., test-book-title).
	- damaged_handle (optional) – if left blank, we’ll compute it as {canonical_handle}-damaged.
	- title (optional) – if left blank, we’ll compute it as {Main Product Title}: Damaged.
	- vendor (optional)
	- product_type / category (optional)
	- condition_set – which variants to include (e.g., Light,Moderate,Heavy or Light,Heavy).
	- price_light / price_moderate / price_heavy – price per condition.
	- qty_light / qty_moderate / qty_heavy – starting inventory per condition.
	- published – TRUE or FALSE. (If all qty are 0, DBS will unpublish anyway.)

Tip: Keep one row per damaged product you want to create.

2. Generate a Shopify CSV from the sheet
	- Use a simple script/add-on or copy-paste formulas to output Shopify’s Product CSV format.
Minimum Shopify CSV needs per damaged product:
	- Handle → {damaged_handle}
	- Title → {title}
	- Option1 Name → Condition
	- One row per variant (Light / Moderate / Heavy) with:
	- Option1 Value → Light Damage / Moderate Damage / Heavy Damage
	- Variant Price → from your price columns
	- Variant Inventory Qty → from your qty columns
	- Published → TRUE/FALSE (optional)
	- (Include any other fields you normally use, like Vendor, Tags, etc.)

Example (abbreviated):

Handle,Title,Option1 Name,Option1 Value,Variant Price,Variant Inventory Qty,Published
test-book-title-damaged,Test Book Title: Damaged,Condition,Light Damage,19.99,3,TRUE
test-book-title-damaged,Test Book Title: Damaged,Condition,Moderate Damage,17.99,2,TRUE
test-book-title-damaged,Test Book Title: Damaged,Condition,Heavy Damage,14.99,0,TRUE

3. Import the CSV into Shopify
	- Shopify Admin → Products → Import.
	- Review the sample import to ensure the option name/values look right (Condition → Light/Moderate/Heavy Damage).
	- Complete the import.

4. After import
	- DBS will automatically set canonical references and manage publish/redirect behavior based on inventory.

⸻

Daily operations

Adding new damaged copies
	- Edit the damaged product’s variants and increase the quantity for the matching condition(s).
	- DBS sees the stock and ensures the product is published (and removes any existing redirect).

Selling out of a condition
	- If other conditions still have stock, the product stays published.
	- Once all conditions hit 0, DBS unpublishes the product and adds a redirect from the damaged handle to the main handle.

Price changes
	- Just edit the variant price(s). No extra steps needed.

⸻

Do’s & Don’ts

Do
	- Always end damaged product handles with -damaged.
	- Use exact condition names: Light Damage, Moderate Damage, Heavy Damage.
	- Track quantity and keep Location consistent.
	- Duplicate from the main product when that’s fastest (then rename and set the handle).

Don’t
	- Don’t create redirects from damaged → main; DBS handles that automatically.
	- Don’t change a damaged product’s handle to something without -damaged. That breaks detection.
	- Don’t edit metafields; DBS writes the canonical for you.

⸻

How to check your work (quick QA)
	- Open the damaged product in Admin:
	- Title & Handle follow rules? (…: Damaged / …-damaged)
	- Condition option present, values correctly named?
	- Inventory set per condition?
	- Live Store: If any stock > 0, the page should be visible. If all 0, the page should redirect to the main product.
	- Optional: check the product’s metafields (bottom of the product page) for custom · canonical_handle.

⸻

Troubleshooting
	- Damaged page still showing when everything is 0:
Wait a minute and refresh—DBS runs on inventory webhooks. If it persists, make sure all condition variants are truly at 0 and there isn’t an extra variant with stock.
	- Damaged SKU not recognized as “damaged”:
Confirm the handle ends with -damaged.
	- Main product handle doesn’t match the “stripped” name (e.g., canonical is test-book-title-test-cookbook):
That’s okay. DBS uses multiple methods to resolve the correct canonical. You don’t need to do anything.
	- Staff accidentally made a redirect from damaged → damaged (same path):
Delete that redirect; DBS will set the correct one when the product sells out.

⸻

Definitions (quick reference)
	- Canonical: The main product page that search engines should index.
	- Damaged product: A separate product whose handle ends in -damaged, with variants for condition.
	- Condition variants: Light Damage / Moderate Damage / Heavy Damage.
	- Redirect: When all damaged variants are out of stock, users hitting the damaged URL are sent to the main product.

⸻

Bulk checklist (printable)
	- I have the canonical handle of each main product.
	- I set each damaged handle to {canonical}-damaged.
	- I used Condition with values Light/Moderate/Heavy Damage (only the ones I need).
	- I set Track quantity and correct Location.
	- I set prices and starting quantities per condition.
	- I imported the CSV and spot-checked one or two products in the store.