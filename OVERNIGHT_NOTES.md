# Overnight UX Lab Notes

## Pass 1 — First-run dashboard guidance

### What changed

- Added a conditional **Getting started** card to the Dashboard.
- The card shows progress through four practical setup milestones: departments, products, floor-plan rooms, and the first filed count.
- Each milestone links directly to the relevant workspace area and respects the active user's page permissions.
- Completed milestones are visually distinct, inaccessible destinations are disabled, and the card disappears after the first count is filed.
- Added responsive layouts for tablet and phone widths.

### Why

New managers previously landed on a metrics-heavy Dashboard with no clear next action. The new guidance provides orientation without changing existing metrics or workflows, and it stays out of the way after onboarding is complete.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/reports.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax check for `reports.js`
- Targeted setup-state behavior checks, including archived records
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Consider adding a dismissible contextual tour only after observing first-time users with this lighter guidance.

## Pass 2 — Keyboard-accessible primary navigation

### What changed

- Replaced the ten clickable primary-navigation `div` elements with semantic buttons.
- Added an accessible label to the primary navigation and accessible names that remain available when the sidebar is collapsed.
- Marked decorative navigation icons as hidden from assistive technology.
- Added visible keyboard-focus styling and kept `aria-current` synchronized with the active page.

### Why

The primary navigation previously worked with a pointer but could not be reached or activated reliably from a keyboard. This change makes every destination keyboard-operable and communicates the current page to screen readers without changing routing, permissions, or layout.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/ui.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax check for `ui.js`
- Targeted markup and active-page accessibility-state checks
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Continue auditing interactive table rows and custom dropdowns for equivalent keyboard support in separate, bounded passes.

## Pass 3 — Actionable Counts empty state

### What changed

- Replaced the bare “No counts yet” table message with a clear first-count explanation and a direct **Start first count** action.
- Added a separate informational empty state for the Archived view so it does not suggest creating a new count there.
- Added compact, responsive styling that keeps the prompt readable on phones and desktops.

### Why

The empty Counts page was a dead end for new users. The new state explains what a count establishes and provides the next action in context, reducing the need to interpret the page header or search elsewhere.

### Files affected

- `apps/web/public/legacy/js/inventory.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax check for `inventory.js`
- Targeted active/archived empty-state copy and action checks
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Add similarly purposeful empty states to other workflows only where the current page leaves users without a clear next action.

## Pass 4 — Keyboard-accessible table sorting

### What changed

- Replaced pointer-only sortable headers with semantic sort buttons in Products, Counts, Orders, and Suppliers.
- Added visible keyboard-focus styling without changing the existing table layout.
- Added `aria-sort` state so assistive technology can identify ascending, descending, and unsorted columns.
- Centralized the sortable-header markup in one helper to keep behavior consistent across tables.

### Why

Sorting was attached directly to table-header click events, which excluded keyboard users and did not communicate the active sort direction to screen readers. The same sorting functions now work through accessible controls.

### Files affected

- `apps/web/public/legacy/js/utils.js`
- `apps/web/public/legacy/js/products.js`
- `apps/web/public/legacy/js/inventory.js`
- `apps/web/public/legacy/js/orders.js`
- `apps/web/public/legacy/js/suppliers.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax checks for all affected scripts
- Targeted generated-header semantics and sort-state checks
- Static check that pointer-only sortable headers were removed from all four tables
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Audit modal tab controls separately; several still use clickable non-button elements.

## Pass 5 — Accessible count-preview controls

### What changed

- Replaced the clickable `div` controls in the saved-count preview with semantic toggle buttons.
- Labelled the switcher as a count-preview control group.
- Added announced selected state for Merged Total, Not Counted, and each room view.
- Added a visible keyboard-focus treatment while preserving the existing tab-like appearance.

### Why

The saved-count preview could switch views only through pointer interaction. Keyboard and assistive-technology users can now reach every view and understand which one is selected without changing the preview workflow.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/inventory.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax check for `inventory.js`
- Targeted control-group, semantic-button, selected-state, and focus-style checks
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- The Reports page has a separate pointer-only tab switcher that can be addressed independently.

## Pass 6 — Accessible Reports view switcher

### What changed

- Replaced the three clickable `div` controls on Reports with semantic toggle buttons.
- Labelled the controls as the Report view group.
- Kept `aria-pressed` synchronized when switching among Usage, Inventory Value, and Order History.
- Reused the focus styling introduced for count-preview controls.

### Why

The Reports page switcher could only be operated with a pointer and did not announce the current view. It is now keyboard-operable and exposes selected state without changing report rendering or calculations.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/reports.js`

### Checks run

- JavaScript syntax check for `reports.js`
- Targeted report-button state and panel-switching behavior test
- Static check for a labelled group containing all three toggle buttons
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Reports usage-table sorting remains a separate candidate for the shared accessible sortable-header helper.

## Pass 7 — Accessible Usage report sorting

### What changed

- Replaced the Usage report's four pointer-only sortable headers with the shared semantic sort-button renderer.
- Added announced ascending, descending, and unsorted state through the existing `aria-sort` pattern.
- Refreshes the rendered header after each report sort so visual and assistive states remain synchronized.

### Why

The Usage report was the last primary data table whose sorting required a mouse. It now behaves consistently with Products, Counts, Orders, and Suppliers without changing report filtering or calculations.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/reports.js`
- `apps/web/public/legacy/js/ui.js`
- `apps/web/public/legacy/js/utils.js`

### Checks run

- JavaScript syntax checks for all affected scripts
- Targeted report-header rendering and direction-refresh behavior test
- Static check that pointer-only report sort headers were removed
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review empty filter-result states in catalog pages for clear recovery actions.

## Pass 8 — Contextual Products empty states

### What changed

- Replaced the generic “No products found” message with three contextual states.
- Filtered results now explain that filters are hiding products and offer **Clear filters**.
- Departments containing only archived products now offer **View archived products**.
- Truly empty departments now explain what product records contain and offer the department-specific add action.
- Reused the responsive empty-state styling established on Counts.

### Why

The same generic message previously appeared whether products were hidden, archived, or absent. The new states identify the cause and provide one direct recovery action, reducing accidental duplicate entry and filter confusion.

### Files affected

- `apps/web/public/legacy/js/products.js`

### Checks run

- JavaScript syntax check for `products.js`
- Targeted filter-reset and archived-view recovery behavior test
- Static checks for all three contextual empty states
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Apply contextual recovery only to other pages where multiple empty causes are currently indistinguishable.

## Pass 9 — Contextual Suppliers empty states

### What changed

- Replaced the generic “No suppliers found” message with three contextual states.
- Search or status mismatches now offer **Clear filters**.
- Archived-only supplier lists now offer **View archived suppliers**.
- A genuinely empty supplier list explains the information a supplier record holds and offers **Add Supplier**.
- Reused the existing responsive empty-state presentation.

### Why

Users could not tell whether suppliers were absent or merely hidden, which could lead to duplicate entries. The new state explains the cause and provides one safe recovery action.

### Files affected

- `apps/web/public/legacy/js/suppliers.js`

### Checks run

- JavaScript syntax check for `suppliers.js`
- Targeted filter-reset and archived-view recovery behavior test
- Static checks for all three contextual supplier states
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review the Orders empty state separately; it currently lacks a direct first-order action.

## Pass 10 — Actionable Orders empty state

### What changed

- Replaced the bare “No orders yet” row with a first-order explanation.
- Added a direct **Create first order** action that opens the existing manual order workflow.
- Reused the responsive empty-state presentation already established across the workspace.

### Why

The empty Orders page did not explain what would be recorded or provide a next step inside the table. New users now get enough context to begin, while scan and voice entry remain available in the unchanged page header.

### Files affected

- `apps/web/public/legacy/js/orders.js`

### Checks run

- JavaScript syntax check for `orders.js`
- Targeted empty-state render, column span, copy, and action test
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review page-level headings and descriptions for department-neutral language now that the workspace supports Bar, Kitchen, and other teams.

## Pass 11 — Department-neutral workspace descriptions

### What changed

- Updated the app-page description to describe multi-department hospitality inventory.
- Changed the Dashboard subtitle from Bar-only inventory to inventory across departments.
- Changed the initial Products helper to describe products, packaging, and suppliers by department.
- Preserved the Keg Bar product name and all department-specific labels and behavior.

### Why

The workspace already supports Bar, Kitchen, Office Supply, and custom departments, but several prominent descriptions still implied that only Bar inventory belonged in the app. The revised copy matches the current information architecture and reduces uncertainty for non-Bar managers.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted department-neutral copy and brand-preservation checks
- Static checks that the stale Bar-only descriptions were removed
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review mobile navigation discoverability now that all ten destinations appear in a horizontally scrolling bottom bar.

## Pass 12 — Discoverable mobile navigation overflow

### What changed

- Added subtle left and right edge cues when additional bottom-navigation destinations exist off-screen.
- Updates the cues as the user scrolls and removes them at the corresponding ends.
- Automatically brings the active destination into view when navigating on a phone.
- Keeps the desktop sidebar behavior and styling unchanged.

### Why

The phone layout contains ten destinations in a horizontally scrolling bottom bar, but there was no indication that more options existed beyond the viewport. The active page could also remain off-screen after programmatic navigation. The new cues make the navigation model discoverable without restructuring it.

### Files affected

- `apps/web/public/legacy/js/ui.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax check for `ui.js`
- Targeted left/right overflow-cue and active-item reveal behavior test
- Desktop reset behavior check
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Audit form labels and dialog titles for clear relationships with their controls.

## Pass 13 — Accessible count dialogs and filters

### What changed

- Identified both the New Count room selector and File Inventory Count as modal dialogs.
- Connected each dialog to its visible title and gave each close button a descriptive accessible name.
- Explicitly connected labels to count date, label, search, category, subcategory, show, and sort controls.
- Expanded the abbreviated “Sub” label to “Subcategory.”

### Why

The controls had visible labels, but assistive technology could not reliably determine which label belonged to which input or what each modal represented. The count workflow now exposes the same structure that sighted users already see.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted checks for both dialog-title relationships and close-button names
- Explicit label/control relationship checks for all nine count fields and filters
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Audit the Add/Edit Product dialog's field and group relationships separately.

## Pass 14 — Accessible Product editor

### What changed

- Identified the Add/Edit Product surface as a modal dialog and connected it to its dynamic title.
- Added a descriptive accessible name to the Product editor close button.
- Explicitly connected all twelve visible field labels to their inputs and selects.
- Exposed the department checkbox area as a labelled control group.

### Why

The Product editor presented clear visual labels, but assistive technology could not reliably associate them with the corresponding controls. This pass exposes the existing form structure without changing product data, validation, or saving.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted Product dialog title and close-control checks
- Explicit label/control checks for all twelve Product fields
- Department selector group relationship check
- Static verification of one header close and one footer cancel action
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review other high-use editors one workflow at a time rather than applying broad markup changes.

## Pass 15 — Accessible Supplier editor

### What changed

- Identified the Add/Edit Supplier surface as a modal dialog and connected it to its dynamic title.
- Added a descriptive accessible name to the Supplier editor close button.
- Explicitly connected all ten visible field labels to their inputs and textarea.
- Exposed the linked-products checkbox area as a labelled control group.

### Why

The Supplier editor had clear visual labels but did not expose their relationships to assistive technology. This pass makes the existing form understandable without changing supplier data, product links, or saving.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted Supplier dialog title and close-control checks
- Explicit label/control checks for all ten Supplier fields
- Linked-products selector group relationship check
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Audit the New/Edit Order dialog separately because its invoice grid contains many dynamic controls.

## Pass 16 — Accessible Order editor and line items

### What changed

- Identified the New/Edit Invoice surface as a modal dialog and connected it to its dynamic title.
- Added a descriptive accessible name to the Order editor close button.
- Explicitly connected all twelve static invoice labels to their controls.
- Labelled every dynamic line-item input, the line-item group, and each remove action.
- Made validation messages and invoice-total updates announce politely when they change.

### Why

The invoice header and dynamic item grid relied heavily on visual position and placeholders. Assistive-technology users can now understand and operate the same fields without changing order calculations, validation, product matching, or saving.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/orders.js`

### Checks run

- JavaScript syntax check for `orders.js`
- Order dialog title and close-control checks
- Explicit label/control checks for all twelve invoice fields
- Dynamic line-item input, group, remove-action, validation, and total-announcement checks
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review upload drop zones for keyboard operation; several currently depend on click handlers attached to non-focusable containers.

## Pass 17 — Keyboard-accessible upload zones

### What changed

- Made the order-scan, usage-report, and inventory-template upload zones keyboard focusable.
- Added clear accessible names for each upload purpose.
- Added shared Enter and Space activation that opens the existing file picker.
- Added visible focus treatments while preserving mouse click and drag-and-drop behavior.

### Why

All three upload zones were clickable non-focusable containers. Keyboard users can now discover and activate the same upload workflows without changing file handling or import logic.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/ui.js`
- `apps/web/public/legacy/css/styles.css`

### Checks run

- JavaScript syntax check for `ui.js`
- Targeted Enter, Space, and ignored-key activation behavior test
- Static role, focusability, accessible-name, and file-target checks for all three zones
- Visible focus-style checks
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Audit modal close buttons for descriptive names in the remaining upload and detail dialogs.

## Pass 18 — Accessible upload dialogs and status updates

### What changed

- Identified the order-scan, usage-report, and inventory-template surfaces as modal dialogs.
- Connected each upload dialog to its visible title and gave each close button a descriptive name.
- Connected the order-scan date and reference labels to their inputs.
- Made processing and result status updates announce politely in all three workflows.

### Why

The upload zones became keyboard accessible in Pass 17, but the surrounding dialogs still lacked structural names and their processing updates were silent. This completes the upload interaction without changing parsing, review, or import behavior.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted dialog/title and close-control checks for all three upload workflows
- Order-scan label/control relationship checks
- Live status-announcement checks for all three workflows
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Audit saved-record detail dialogs separately; several use dynamic titles or dynamic body content.

## Pass 19 — Accessible saved-count preview

### What changed

- Identified the saved-count preview as a modal dialog and connected it to the dynamic count title.
- Added a descriptive accessible name to the preview close button.
- Added a clear name to the count-items table.
- Made total changes announce politely when switching among merged, missing, and room views.

### Why

The preview's dynamic title and controls were visually clear, but assistive technology could not identify the modal or its icon-only close action. View changes also updated the total silently. The record-view workflow is now exposed without changing count data or editing.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted saved-count dialog/title and close-control checks
- Item-table accessible-name and total-announcement checks
- Dynamic title uniqueness check within the modal
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review the Live Inventory product detail next; it uses dynamic body content without a stable dialog label.

## Pass 20 — Accessible Live Inventory detail

### What changed

- Identified the Live Inventory product detail as a modal dialog.
- Gave the dynamically rendered product heading a stable ID and connected the dialog to it.
- Added a descriptive accessible name to the detail close button.

### Why

The product name was already the clear visible heading, but the surrounding modal did not expose it as its title. Assistive technology can now identify the record being viewed without changing live-inventory calculations or display content.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/inventory.js`

### Checks run

- JavaScript syntax check for `inventory.js`
- Targeted dialog/title and close-control checks
- Dynamic title rendering and uniqueness checks
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review the Product and Supplier saved-record detail dialogs, both of which also render titles inside dynamic bodies.

## Pass 21 — Accessible Product detail

### What changed

- Identified the shared Product and Drink detail surface as a modal dialog.
- Connected both dynamically rendered record headings to the dialog with one stable title ID.
- Added a descriptive accessible name to the icon-only close button.
- Escaped the dynamic inventory-product name when rendering the dialog title.

### Why

Both detail entry points displayed a clear record name, but the shared modal did not expose that heading as its accessible title. The inventory-product path also inserted its title without the escaping already used by the drink path. The modal is now consistently identifiable and safer without changing product data or actions.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/products.js`

### Checks run

- JavaScript syntax check for `products.js`
- Targeted shared-dialog semantics and close-control checks
- Dynamic title checks for both Product and Drink rendering paths
- Product-title escaping check
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review the Supplier saved-record detail dialog next; it also renders its title inside a dynamic body.

## Pass 22 — Accessible Supplier detail

### What changed

- Identified the Supplier saved-record detail as a modal dialog.
- Connected the dynamically rendered supplier heading to the dialog with a stable title ID.
- Added a descriptive accessible name to the icon-only close button.

### Why

The supplier name was already the clear visible heading, but the surrounding modal did not expose it as its title. Assistive technology can now identify which supplier record is open without changing supplier data, linking, or actions.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/suppliers.js`

### Checks run

- JavaScript syntax check for `suppliers.js`
- Targeted dialog/title and close-control checks
- Dynamic title rendering and uniqueness checks
- Supplier-title escaping check
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Continue the saved-record audit with the Order detail surfaces, which use dynamic headings and icon-only controls.

## Pass 23 — Accessible Invoice detail

### What changed

- Identified the saved Invoice and Refund/Credit detail surface as a modal dialog.
- Connected its dynamically rendered record heading to the dialog with a stable title ID.
- Added a descriptive accessible name to the icon-only close button.
- Added a concise accessible name to the invoice-items table.

### Why

The invoice type and number were already visually prominent, but the modal did not expose that heading as its title and its item table had no concise purpose label. The saved-order review workflow is now easier to identify and navigate without changing order calculations, data, or actions.

### Files affected

- `apps/web/public/legacy/index.html`
- `apps/web/public/legacy/js/orders.js`

### Checks run

- JavaScript syntax check for `orders.js`
- Targeted invoice-detail dialog/title and close-control checks
- Dynamic title uniqueness check
- Invoice-items table accessible-name check
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review the saved Order Scan viewer separately; it has a dynamic title but is not yet exposed as a dialog.

## Pass 24 — Accessible Order Scan viewer

### What changed

- Identified the saved Order Scan viewer as a modal dialog.
- Connected the viewer to its existing dynamic scan title.
- Added a descriptive accessible name to the icon-only close button.

### Why

The viewer already updates its visible heading with the invoice number, but the surrounding modal did not expose that heading as its title. Assistive technology can now identify which scan is open without changing scan storage, display, or download behavior.

### Files affected

- `apps/web/public/legacy/index.html`

### Checks run

- Targeted scan-viewer dialog/title and close-control checks
- Dynamic invoice-number title connection check
- Title uniqueness check
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Continue the saved-record audit with the Usage Log detail modal and its dynamic report title.

## Pass 25 — Full hospitality workspace visual redesign

### What changed

- Rebuilt the shared visual system around a warmer hospitality-operations palette with richer light and dark themes.
- Redesigned the desktop navigation into a clearer premium rail with stronger active-page orientation, icon treatments, profile presentation, and collapse behavior.
- Turned page headers into consistent workspace command surfaces with clearer hierarchy and action placement.
- Upgraded cards, dashboard metrics, onboarding, tables, filters, form controls, buttons, menus, segmented controls, badges, and selection states.
- Refined Products and Settings with more intentional side panels and active-state styling.
- Reworked modal presentation with stronger hierarchy, softer overlays, improved close controls, and clearer action footers.
- Rebuilt the compact layout with a translucent bottom navigation bar, full-width page actions, denser metric cards, and phone-safe onboarding steps.

### Why

The preceding passes substantially improved usability and accessibility, but intentionally made only small visual changes. This pass delivers the requested visible transformation across the entire product while preserving the existing DOM, event handlers, workflows, and data behavior.

### Files affected

- `apps/web/public/legacy/css/styles.css`

### Checks run

- Desktop visual render at 1440 × 1000
- Compact visual render at 500 × 844
- Responsive onboarding overflow inspection and correction
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

All checks passed.

### Follow-up

- Review the redesigned workflows interactively and adjust visual preferences based on product-owner feedback before merging.
