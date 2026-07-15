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
