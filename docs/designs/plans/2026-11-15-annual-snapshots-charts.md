# Plan: annual view, snapshot entry and charts (spec 2026-11-15-annual-snapshots-charts)

1. Snapshot form logic, `app.addSnapshot`, Activity form, e2e (done).
2. `annual.ts` over `monthView` with In Annual accounts + tests.
3. `balances.ts` from the Balances tab formulas (template/build-template.gs) + tests.
4. `charts.ts` (scales, donut arcs) and `chartData.ts` (series per chart) + tests.
5. SVG components (`BarChart`, `AreaChart`, `Donut`), `YearScreen`, Month/Year switch, Month charts; e2e.
6. Docs (month-rules Annual and Balances, corner-cases), CHANGELOG.
