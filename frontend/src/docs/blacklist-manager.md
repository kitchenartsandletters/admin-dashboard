Blacklist Manager Guide

The Blacklist Manager allows staff to suppress the "Request Form" on product pages of items that are no longer relevant for restock. This is especially useful for permanently discontinued titles, one-time sets, or ephemeral imports.

HOW IT WORKS
- Barcodes and Product IDs are matched against Shopify's live catalog.
- If a match is found, it is added to the blacklist table.
- Clicking "Export to Shopify" rewrites the blacklisted barcodes in the live theme.
- That snippet is referenced on product pages to determine whether to show or hide the Request Form.
- The logic is inserted directly into the live theme

STEP-BY-STEP USAGE

1. Navigate to the Blacklist tab in the Admin Dashboard. It is located within the Request Service menu item.
   - 📸 [Insert screenshot of tab UI]

2. In the input box, enter a barcode or Shopify Product ID to search.
   - 📸 [Insert screenshot showing input usage]

3. Preview product details returned by Shopify in a modal before confirming.
   - Product Title
   - Author (SKU field)
   - Handle
   - Product ID
   - Barcode

4. Click “Confirm All” to save the entries to the database after previewing the products.
   - 📸 [Insert screenshot of added row in table]

5. Once your list is built, click “Export to Shopify”.
   - This will:
     - Update blacklisted barcodes in the live theme.

6. You should now see the request form hidden on blacklisted product pages.
   - 📸 [Insert screenshot of suppressed form]

BULK ADDING

If you have multiple barcodes or product IDs to add:
- You can paste multiple barcodes or product IDs separated by commas, spaces, or newlines.
- The system will iterate through them and attempt to add each.
- If a barcode is invalid or does not resolve to a product, it will be skipped.

⚠️ Reminder: “Export to Shopify” must be clicked to publish changes to Shopify.