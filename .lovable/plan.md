
## Add "Fleet Profitability" page

### 1. Sidebar
- Insert `{ to: "/fleet-profitability", label: "Fleet Profitability", icon: TrendingUp }` in `src/components/app-shell.tsx` `nav[]`, after `Logbook & HOS`.
- Update `src/hooks/use-allowed-modules.ts`: add `/fleet-profitability` to the `fleet_owner` / `accountant` / `dispatcher` module lists (super_admin already bypasses). Keep hidden from `driver`.

### 2. Route
- New `src/routes/_authenticated/fleet-profitability.tsx`.
- Page-level controls: date-range selector (defaults to current month; presets: This month, Last month, YTD, Custom) + truck filter.
- Tabs: Overview · By Truck · By Load · By Driver · AI Insights.

### 3. Server function
- New `src/lib/fleet-profitability.functions.ts`:
  - `getFleetProfitability({ from, to })` — `requireSupabaseAuth`; resolves the caller's `company_id` via `get_user_company`, then runs five RLS-scoped reads in parallel:
    - `settlements` (delivered) → revenue, miles, by-driver, by-load, by-truck
    - `fuel_purchases` → fuel cost (by truck/driver/load)
    - `maintenance_records` → maintenance cost (by truck)
    - `expenses` excluding Fuel + Maintenance → other expenses
    - `loads` (delivered, joined for load number / customer)
  - Aggregates in JS and returns:
    - `overview`: revenue, fuel, maintenance, driverPay, otherExpenses, netProfit, totalMiles, profitPerMile
    - `byTruck[]`: truckUnit, revenue, expenses, profit, profitPerMile
    - `byLoad[]`: loadNumber, customer, revenue, expenses, netProfit, miles, profitPerMile
    - `byDriver[]`: driverId, driverName, loadsCompleted, revenue, cost, profitContribution
- Cost allocation rule (documented in code): driver-pay = `sum(settlements.net_settlement_usd)`; expenses are allocated to truck/load/driver only when the source row carries that key, otherwise rolled into "unallocated" but still counted in totals.

### 4. UI
- Overview tab: 6 KPI cards (Revenue, Fuel Cost, Maintenance Cost, Driver Pay, Other Expenses, Net Profit) using existing `Card` + design tokens; one stacked bar/line chart (revenue vs expenses) using `recharts` if already installed, otherwise simple CSS bars to avoid adding deps.
- By Truck / By Load / By Driver tabs: sortable tables with the exact columns the user listed. Profit values colored via semantic tokens (`text-primary` for positive, `text-destructive` for negative).
- AI Insights tab: button "Generate insights" → calls a second server function `generateProfitabilityInsights({ from, to })` that posts the aggregated summary to Lovable AI Gateway (`google/gemini-2.5-flash`) with a strict prompt to return 4–6 short bullet insights. Renders the bullets in a list and caches via React Query.

### 5. Verify
- `/fleet-profitability` renders for the super_admin account on Sample Company with empty-state messages where no data exists yet.
- Sidebar item appears between Logbook & HOS and Fleet AI Assistant.
- A driver-only user does not see the link.

### Technical notes
- All reads go through the user-scoped Supabase client; RLS already scopes rows to the user's company, so no `supabaseAdmin` needed.
- Recharts is already in the project if other dashboards use it — check before adding; otherwise plain divs are fine and skip the dep.
- No DB migration required — every needed column already exists on `settlements`, `loads`, `fuel_purchases`, `maintenance_records`, `expenses`, `trip_logs`.
