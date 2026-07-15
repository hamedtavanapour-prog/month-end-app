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
