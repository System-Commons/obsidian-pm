## What this PR does

<!-- One paragraph. What problem does it solve and why does it matter? -->

## Linked issue

<!-- Issue number, if there is one -->

## Checklist

- [ ] `pnpm build` passes with zero errors.
- [ ] `pnpm check` and `pnpm test` pass with zero warnings.
- [ ] New modals are created through `ModalFactory`, never instantiated directly.
- [ ] No `element.style.*` assignments; CSS classes only.
- [ ] No dynamic `await import()`; static imports only.
- [ ] Dates use `YYYY-MM-DD` format; UTC operations only (`T00:00:00Z`, `setUTCDate()`).
- [ ] This PR is focused on one logical change. Unrelated cleanup is in a separate PR.
