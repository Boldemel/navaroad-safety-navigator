/**
 * FleetOS in-app Help content.
 *
 * Keyed by module id from `module-registry.ts`. Each entry describes what
 * the module does, when to use it, and a short list of how-to steps.
 *
 * Rendered by:
 *  - `/help` (searchable help center)
 *  - Contextual `<HelpDrawer/>` opened from the "?" button in the app shell
 *
 * Add a new entry whenever you add a module. Keep copy short and
 * task-oriented — this is not marketing copy.
 */

import { FLEETOS_MODULES, type ModuleCategory } from "@/lib/fleetos/module-registry";

export type HelpArticle = {
  /** Matches FleetOSModule.id */
  moduleId: string;
  title: string;
  summary: string;
  /** Ordered how-to steps or tips. */
  steps: { title: string; body: string }[];
  /** Optional related module ids for cross-linking. */
  related?: string[];
  /** Topic tags for filtering (e.g. "getting-started", "billing"). */
  tags?: HelpTopic[];
  /** Inherited from the module registry — module category. */
  category?: ModuleCategory;
};

/** Curated topic tags shown in the topic filter dropdown. */
export const HELP_TOPICS = [
  "getting-started",
  "assign-a-load",
  "trip-timeline",
  "ai-copilot",
  "hos-compliance",
  "documents-expiry",
  "ifta-taxes",
  "fuel-mpg",
  "maintenance-pm",
  "profitability",
  "reports-exports",
  "billing-plans",
  "team-roles",
  "voice-alerts",
] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

/**
 * Curated topic tags per module. Keeps the article definitions below
 * uncluttered; edit here to re-tag an article without touching content.
 */
const TAGS_BY_MODULE: Record<string, HelpTopic[]> = {
  dashboard: ["getting-started"],
  dispatch: ["assign-a-load", "trip-timeline", "ai-copilot"],
  loads: ["assign-a-load", "trip-timeline"],
  route_analysis: ["getting-started"],
  parking: ["getting-started"],
  alerts: ["voice-alerts"],
  hos: ["hos-compliance"],
  inspections: ["hos-compliance", "maintenance-pm"],
  documents: ["documents-expiry"],
  hazard_reports: ["getting-started"],
  fuel: ["fuel-mpg", "ifta-taxes"],
  expenses: ["profitability"],
  ifta: ["ifta-taxes", "reports-exports"],
  fleet_profitability: ["profitability", "reports-exports"],
  trucks: ["maintenance-pm"],
  maintenance: ["maintenance-pm"],
  driver_performance: ["profitability"],
  reports: ["reports-exports"],
  assistant: ["ai-copilot", "voice-alerts"],
  billing: ["billing-plans"],
  company: ["team-roles"],
  profile: ["voice-alerts"],
};



export const HELP_ARTICLES: HelpArticle[] = [
  {
    moduleId: "dashboard",
    title: "Dashboard",
    summary: "Your role-aware home. KPIs, active alerts, and quick jump-off to the modules you use most.",
    steps: [
      { title: "Read the KPI row", body: "Top cards show today's headline numbers — active loads, HOS status, open alerts, and revenue." },
      { title: "Use quick actions", body: "Tap any KPI card or shortcut to jump straight into that module." },
    ],
  },
  {
    moduleId: "dispatch",
    title: "Dispatch",
    summary: "Airline-ops-style dispatcher workspace. Assign drivers, trucks, and loads and track each trip through its milestones.",
    steps: [
      { title: "Scan the ops overview", body: "Top KPIs show active loads, unassigned loads, available drivers/trucks, and deliveries due today." },
      { title: "Assign a load", body: "Open an unassigned load, pick a driver and truck, and confirm. The load moves into 'Assigned' on the trip timeline." },
      { title: "Move the trip forward", body: "Update status as the driver progresses: Accepted → Driving to Pickup → Loaded → In Transit → Delivered → Completed." },
      { title: "Ask the AI panel", body: "Try prompts like 'Find the best load for Truck 105' or 'Assign the closest driver' — the assistant sees a live snapshot of your fleet." },
    ],
    related: ["loads", "trucks", "assistant"],
  },
  {
    moduleId: "loads",
    title: "Loads",
    summary: "Create, edit, and track loads. History lives on the Loads → History tab.",
    steps: [
      { title: "Create a load", body: "Enter shipper, consignee, rate, miles, pickup/delivery times, and BOL number." },
      { title: "Assign from Dispatch", body: "Assignments happen on the Dispatch screen so you can see driver and truck availability at the same time." },
      { title: "Review history", body: "Completed loads move to Loads → History with full timeline and revenue captured." },
    ],
    related: ["dispatch"],
  },
  {
    moduleId: "route_analysis",
    title: "Route Analysis & Hazards",
    summary: "AI-graded route safety with live hazards, weather, and truck stops along your path.",
    steps: [
      { title: "Enter origin and destination", body: "The map shows the recommended truck-legal route with hazard markers." },
      { title: "Read the safety score", body: "Higher is safer. Tap hazards for reporter trust, severity, and photos." },
    ],
    related: ["parking", "alerts"],
  },
  {
    moduleId: "parking",
    title: "Truck Parking",
    summary: "Find nearby truck stops and rest areas with amenities and availability signals.",
    steps: [
      { title: "Search near a location", body: "Use current location or type an address to see nearby parking." },
      { title: "Save favorites", body: "Star locations you use often to see them first next time." },
    ],
  },
  {
    moduleId: "alerts",
    title: "Alerts",
    summary: "One inbox for proximity, weather, and compliance alerts across the fleet.",
    steps: [
      { title: "Triage by severity", body: "High-severity items are pinned at the top; acknowledge to clear." },
    ],
  },
  {
    moduleId: "hos",
    title: "Hours of Service",
    summary: "Live HOS clocks with violation prevention warnings.",
    steps: [
      { title: "Check remaining hours", body: "The HOS gauge shows drive, shift, and cycle time remaining." },
      { title: "Change duty status", body: "Switch between On Duty / Driving / Off Duty / Sleeper Berth. All changes are logged." },
    ],
    related: ["inspections", "documents"],
  },
  {
    moduleId: "inspections",
    title: "Inspections",
    summary: "DVIRs, roadside inspections, and defect tracking.",
    steps: [
      { title: "Start a pre-trip DVIR", body: "Walk through the checklist; note defects with photos." },
      { title: "Log a roadside inspection", body: "Enter agency, level, and outcome. Defects flow into Maintenance." },
    ],
    related: ["maintenance"],
  },
  {
    moduleId: "documents",
    title: "Documents",
    summary: "Central vault for driver, truck, and company documents with expiry alerts.",
    steps: [
      { title: "Upload with expiry", body: "Always set an expiry date — you'll get an alert 60 days before it lapses." },
    ],
  },
  {
    moduleId: "hazard_reports",
    title: "Hazard Reports",
    summary: "Report road hazards to the driver community. Verified reports boost your trust score.",
    steps: [
      { title: "Report a hazard", body: "Add location, type, severity, and a photo if possible." },
    ],
  },
  {
    moduleId: "fuel",
    title: "Fuel Log",
    summary: "Record fuel purchases with state, gallons, and price. Feeds IFTA and profitability automatically.",
    steps: [
      { title: "Log a fill-up", body: "Enter the pump receipt fields — state auto-detects from location where possible." },
    ],
    related: ["ifta", "fleet_profitability"],
  },
  {
    moduleId: "expenses",
    title: "Expenses",
    summary: "Trip and truck expenses with receipt photos and categories.",
    steps: [
      { title: "Attach a receipt", body: "Photos are stored securely and linked to the expense and trip." },
    ],
  },
  {
    moduleId: "ifta",
    title: "IFTA",
    summary: "Quarterly mileage-by-state and tax calculations, ready to file.",
    steps: [
      { title: "Pick a quarter", body: "Review miles per state and tax owed. Export as CSV or PDF." },
    ],
    related: ["fuel"],
  },
  {
    moduleId: "fleet_profitability",
    title: "Fleet Profitability",
    summary: "Revenue per mile, cost per mile, and per-truck / per-driver margins.",
    steps: [
      { title: "Pick a date range", body: "See which trucks and drivers are most and least profitable." },
    ],
  },
  {
    moduleId: "trucks",
    title: "Trucks",
    summary: "Truck registry, assignments, and per-truck history.",
    steps: [
      { title: "Add a truck", body: "Enter unit number, VIN, plate, and current driver." },
    ],
    related: ["maintenance"],
  },
  {
    moduleId: "maintenance",
    title: "Maintenance",
    summary: "PM schedules, work orders, and repair history per truck.",
    steps: [
      { title: "Create a work order", body: "Pick the truck, describe the work, and set a due date or mileage." },
    ],
  },
  {
    moduleId: "driver_performance",
    title: "Driver Performance",
    summary: "Scorecards with safety, on-time, and profitability trends.",
    steps: [
      { title: "Compare drivers", body: "Sort by score to find coaching opportunities." },
    ],
  },
  {
    moduleId: "reports",
    title: "Reports",
    summary: "Cross-module reports and CSV/PDF exports.",
    steps: [
      { title: "Pick a report", body: "Choose a template, set the date range, and export." },
    ],
  },
  {
    moduleId: "assistant",
    title: "AI Assistant",
    summary: "Your conversational FleetOS copilot. Ask about routes, HOS, profit, compliance — text or voice.",
    steps: [
      { title: "Ask anything", body: "Try 'Summarize my active loads' or 'Which trucks are due for service?'" },
      { title: "Use voice", body: "Tap the mic to dictate and toggle voice replies on/off." },
    ],
  },
  {
    moduleId: "billing",
    title: "Billing",
    summary: "Manage your subscription, payment method, and invoices.",
    steps: [
      { title: "Upgrade or downgrade", body: "Changes take effect immediately; billing prorates." },
    ],
  },
  {
    moduleId: "company",
    title: "Company & Team",
    summary: "Company profile, team members, and role assignments.",
    steps: [
      { title: "Invite a teammate", body: "Send an invite by email and assign a role." },
    ],
  },
  {
    moduleId: "profile",
    title: "Profile",
    summary: "Your personal profile, notification preferences, and voice settings.",
    steps: [
      { title: "Tune voice guidance", body: "Pick a voice, rate, and which alerts should speak." },
    ],
  },
];

// Enrich each article with its module category and curated topic tags so
// callers can filter without a second lookup.
const MODULE_CATEGORY_BY_ID = new Map(FLEETOS_MODULES.map((m) => [m.id, m.category]));
for (const a of HELP_ARTICLES) {
  a.category = MODULE_CATEGORY_BY_ID.get(a.moduleId);
  a.tags = TAGS_BY_MODULE[a.moduleId] ?? [];
}

const BY_MODULE = new Map(HELP_ARTICLES.map((a) => [a.moduleId, a]));

export function getHelpArticle(moduleId: string): HelpArticle | undefined {
  return BY_MODULE.get(moduleId);
}

export type HelpSearchOptions = {
  query?: string;
  category?: ModuleCategory | "all";
  topic?: HelpTopic | "all";
};

export type HelpSearchResult = {
  article: HelpArticle;
  score: number;
  /** Which step indexes matched the query, for inline highlighting. */
  matchedStepIndexes: number[];
};

/**
 * Scored, filterable help search.
 *
 * Score weights:
 *   title match         100 (exact word) / 60 (substring)
 *   summary match       25
 *   step title match    15 per matching step
 *   step body match      6 per matching step
 *   tag match           10
 *
 * With no query, results are sorted alphabetically by title.
 */
export function searchHelp(options: HelpSearchOptions = {}): HelpSearchResult[] {
  const { query = "", category = "all", topic = "all" } = options;
  const q = query.trim().toLowerCase();

  const pool = HELP_ARTICLES.filter((a) => {
    if (category !== "all" && a.category !== category) return false;
    if (topic !== "all" && !(a.tags ?? []).includes(topic)) return false;
    return true;
  });

  if (!q) {
    return pool
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((article) => ({ article, score: 0, matchedStepIndexes: [] }));
  }

  const wordRe = new RegExp(`\\b${escapeRegExp(q)}\\b`, "i");

  const results: HelpSearchResult[] = [];
  for (const article of pool) {
    let score = 0;
    const matchedStepIndexes: number[] = [];

    if (wordRe.test(article.title)) score += 100;
    else if (article.title.toLowerCase().includes(q)) score += 60;

    if (article.summary.toLowerCase().includes(q)) score += 25;

    article.steps.forEach((s, i) => {
      const inTitle = s.title.toLowerCase().includes(q);
      const inBody = s.body.toLowerCase().includes(q);
      if (inTitle) score += 15;
      if (inBody) score += 6;
      if (inTitle || inBody) matchedStepIndexes.push(i);
    });

    if ((article.tags ?? []).some((t) => t.includes(q))) score += 10;

    if (score > 0) results.push({ article, score, matchedStepIndexes });
  }

  return results.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

