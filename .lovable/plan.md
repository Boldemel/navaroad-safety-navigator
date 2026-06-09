## Verification plan

I'll use the preview browser (with your existing session) to confirm each item end-to-end. No code changes unless something fails.

### Checks
1. **Sidebar — Fleet Profitability link**
   - Open `/dashboard`, expand sidebar, confirm "Fleet Profitability" appears between "Logbook & HOS" and "Fleet AI Assistant", and the link routes to `/fleet-profitability`.

2. **Sample Company data flows into profitability**
   - On `/fleet-profitability`, switch range to "YTD" (sample data may predate this month).
   - Confirm KPI cards render numbers (Revenue / Fuel / Maintenance / Driver pay / Other / Net) and at least one of By Truck / By Load / By Driver tabs lists rows tied to the Sample Company.

3. **Fleet AI Assistant can access profitability data**
   - I already inspected `src/lib/ai/fleet-context.server.ts` — the assistant's context builder aggregates loads, fuel, expenses, settlements, maintenance, and trips for the last 90 days (same tables Fleet Profitability uses) and passes them to the model. That is the wiring.
   - To verify at runtime, open `/assistant` and send a question like *"Which truck is the most profitable in the last 90 days?"* Confirm a non-empty answer that references the data.

4. **Company & Team**
   - Open `/company`. Confirm the page renders, the current company is selected, members table loads, and (since you're super_admin) the rename/manage controls are visible.

5. **Platform Admin**
   - Open `/admin/platform`. Confirm the dashboard renders, the Companies tab lists the Sample Company with owner email + member count, and actions (View as / Suspend / Delete) are present.

### If something fails
I'll stop, report the exact failure (screenshot + console/network), then ask for approval before changing code.
