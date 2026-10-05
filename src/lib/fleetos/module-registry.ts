/**
 * FleetOS Module Registry
 * -----------------------
 * Single source of truth for every product module in the FleetOS codebase.
 * Modules are the licensing + navigation unit shared by web, Android, and iOS.
 *
 * A module declares:
 *  - `id`           stable machine key used in DB (plan_feature_access.feature_key)
 *  - `category`     high-level grouping used to build the navigation
 *  - `featureKey`   the entitlement checked against the company subscription
 *  - `roles`        default role allowlist (empty = allow all roles with the entitlement)
 *  - `routes`       web routes this module owns (Rork clients mirror by `id`)
 *  - `automation`   which AI automation levels the module supports (L1/L2/L3)
 *
 * DO NOT hardcode module lists in individual routes, nav components, or role
 * hooks. Import from here so a new module lights up in nav, entitlements, and
 * AI automation with one edit.
 */

import type { CompanyRole } from "@/lib/company.shared";

export const MODULE_CATEGORIES = [
  "operations",
  "safety_compliance",
  "financial",
  "fleet_maintenance",
  "driver_tools",
  "intelligence",
  "admin",
] as const;
export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export const AUTOMATION_LEVELS = ["L1_recommend", "L2_approve", "L3_auto"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export type FleetOSModule = {
  /** Stable machine key. Must match `plan_feature_access.feature_key`. */
  id: string;
  /** Human label shown in nav / admin. */
  label: string;
  /** Short description for admin + plan catalog UIs. */
  description: string;
  category: ModuleCategory;
  /** Entitlement key gated by the subscription plan. Defaults to `id`. */
  featureKey: string;
  /** Default roles that can access this module. Empty = any role with entitlement. */
  roles: CompanyRole[];
  /** Web routes owned by this module. First route is the module's home. */
  routes: string[];
  /** Automation levels the shared AI engine supports for this module. */
  automation: AutomationLevel[];
  /** Icon key (lucide-react/lucide-react-native compatible). */
  icon: string;
  /** Always visible regardless of subscription (billing, profile, company). */
  alwaysAvailable?: boolean;
  /** Hidden from nav but still routable (e.g. sub-pages). */
  hiddenFromNav?: boolean;
};

const FULL_ACCESS_ROLES: CompanyRole[] = [
  "fleet_owner",
  "fleet_manager",
  "dispatcher",
];

/**
 * The registry. Order = default nav order within a category.
 * Adding a module here + a matching row in `plan_feature_access` is the only
 * step required to ship it across all clients.
 */
export const FLEETOS_MODULES: readonly FleetOSModule[] = [
  // -------- Operations --------
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Role-aware home with KPIs, alerts, and quick actions.",
    category: "operations",
    featureKey: "dashboard",
    roles: [],
    routes: ["/home", "/dashboard"],
    automation: ["L1_recommend"],
    icon: "LayoutDashboard",
    alwaysAvailable: true,
  },
  {
    id: "loads",
    label: "Loads",
    description: "Active loads, dispatch, and load history.",
    category: "operations",
    featureKey: "loads",
    roles: [...FULL_ACCESS_ROLES, "driver"],
    routes: ["/loads", "/loads/history"],
    automation: ["L1_recommend", "L2_approve", "L3_auto"],
    icon: "Package",
  },
  {
    id: "dispatch",
    label: "Dispatch",
    description:
      "Airline-ops-style dispatcher workspace: assign drivers, trucks, and loads with AI recommendations and a live trip timeline.",
    category: "operations",
    featureKey: "dispatch",
    roles: [...FULL_ACCESS_ROLES, "dispatcher"],
    routes: ["/dispatch"],
    automation: ["L1_recommend", "L2_approve", "L3_auto"],
    icon: "Radio",
  },
  {
    id: "route_analysis",
    label: "Route Analysis",
    description: "AI route safety, hazards, weather, and truck stops.",
    category: "operations",
    featureKey: "route_analysis",
    roles: [...FULL_ACCESS_ROLES, "driver", "safety_manager"],
    routes: ["/hazard-map"],
    automation: ["L1_recommend", "L2_approve"],
    icon: "Map",
  },
  {
    id: "parking",
    label: "Truck Parking",
    description: "Find and reserve truck parking.",
    category: "operations",
    featureKey: "parking",
    roles: [...FULL_ACCESS_ROLES, "driver"],
    routes: ["/parking"],
    automation: ["L1_recommend"],
    icon: "ParkingCircle",
  },
  {
    id: "alerts",
    label: "Alerts",
    description: "Proximity, weather, and compliance alerts.",
    category: "operations",
    featureKey: "alerts",
    roles: [],
    routes: ["/alerts"],
    automation: ["L1_recommend", "L3_auto"],
    icon: "Bell",
  },

  // -------- Safety & Compliance --------
  {
    id: "hos",
    label: "Hours of Service",
    description: "HOS clocks, duty status, and violation prevention.",
    category: "safety_compliance",
    featureKey: "hos",
    roles: [...FULL_ACCESS_ROLES, "driver", "safety_manager"],
    routes: ["/hos", "/logbook"],
    automation: ["L1_recommend", "L2_approve"],
    icon: "Clock",
  },
  {
    id: "inspections",
    label: "Inspections",
    description: "DVIR, roadside inspections, and defect tracking.",
    category: "safety_compliance",
    featureKey: "inspections",
    roles: [...FULL_ACCESS_ROLES, "driver", "safety_manager", "maintenance_manager"],
    routes: ["/inspections"],
    automation: ["L1_recommend", "L2_approve"],
    icon: "ClipboardCheck",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Driver, truck, and company document vault with expiry alerts.",
    category: "safety_compliance",
    featureKey: "documents",
    roles: [...FULL_ACCESS_ROLES, "driver", "safety_manager"],
    routes: ["/documents"],
    automation: ["L1_recommend", "L3_auto"],
    icon: "FileText",
  },
  {
    id: "hazard_reports",
    label: "Hazard Reports",
    description: "Community-verified road hazard reporting.",
    category: "safety_compliance",
    featureKey: "hazard_reports",
    roles: [...FULL_ACCESS_ROLES, "driver", "safety_manager"],
    routes: ["/report"],
    automation: ["L1_recommend"],
    icon: "AlertTriangle",
  },

  // -------- Financial --------
  {
    id: "fuel",
    label: "Fuel Log",
    description: "Fuel purchases, MPG, and IFTA-ready records.",
    category: "financial",
    featureKey: "fuel",
    roles: [...FULL_ACCESS_ROLES, "driver", "accountant"],
    routes: ["/fuel"],
    automation: ["L1_recommend"],
    icon: "Fuel",
  },
  {
    id: "expenses",
    label: "Expenses",
    description: "Trip expenses, receipts, and categorization.",
    category: "financial",
    featureKey: "expenses",
    roles: [...FULL_ACCESS_ROLES, "driver", "accountant"],
    routes: ["/expenses"],
    automation: ["L1_recommend", "L2_approve"],
    icon: "Receipt",
  },
  {
    id: "ifta",
    label: "IFTA",
    description: "Quarterly IFTA mileage and tax reporting.",
    category: "financial",
    featureKey: "ifta",
    roles: [...FULL_ACCESS_ROLES, "accountant"],
    routes: ["/ifta"],
    automation: ["L1_recommend", "L3_auto"],
    icon: "Calculator",
  },
  {
    id: "settlements",
    label: "Settlements",
    description: "Driver pay, deductions, and settlement statements.",
    category: "financial",
    featureKey: "settlements",
    roles: [...FULL_ACCESS_ROLES, "accountant"],
    routes: ["/reports"],
    automation: ["L1_recommend", "L2_approve"],
    icon: "Wallet",
    hiddenFromNav: true,
  },
  {
    id: "fleet_profitability",
    label: "Fleet Profitability",
    description: "Revenue per mile, cost per mile, and margin analysis.",
    category: "financial",
    featureKey: "fleet_profitability",
    roles: [...FULL_ACCESS_ROLES, "accountant"],
    routes: ["/fleet-profitability"],
    automation: ["L1_recommend"],
    icon: "TrendingUp",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Subscription, invoices, and payment method.",
    category: "financial",
    featureKey: "billing",
    roles: ["fleet_owner"],
    routes: ["/billing"],
    automation: [],
    icon: "CreditCard",
    alwaysAvailable: true,
  },

  // -------- Fleet & Maintenance --------
  {
    id: "trucks",
    label: "Trucks",
    description: "Truck registry, assignments, and telematics.",
    category: "fleet_maintenance",
    featureKey: "trucks",
    roles: [...FULL_ACCESS_ROLES, "maintenance_manager"],
    routes: ["/trucks"],
    automation: ["L1_recommend"],
    icon: "Truck",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "PM schedules, work orders, and repair history.",
    category: "fleet_maintenance",
    featureKey: "maintenance",
    roles: [...FULL_ACCESS_ROLES, "maintenance_manager"],
    routes: ["/maintenance"],
    automation: ["L1_recommend", "L2_approve", "L3_auto"],
    icon: "Wrench",
  },

  // -------- Driver Tools --------
  {
    id: "driver_performance",
    label: "Driver Performance",
    description: "Scorecards, coaching, and safety trends.",
    category: "driver_tools",
    featureKey: "driver_performance",
    roles: [...FULL_ACCESS_ROLES, "safety_manager"],
    routes: ["/driver-performance"],
    automation: ["L1_recommend"],
    icon: "Gauge",
  },

  // -------- Intelligence --------
  {
    id: "assistant",
    label: "AI Assistant",
    description: "Conversational FleetOS copilot (text + voice).",
    category: "intelligence",
    featureKey: "assistant",
    roles: [],
    routes: ["/assistant"],
    automation: ["L1_recommend", "L2_approve", "L3_auto"],
    icon: "Sparkles",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Cross-module reporting and exports.",
    category: "intelligence",
    featureKey: "reports",
    roles: [...FULL_ACCESS_ROLES, "safety_manager", "accountant"],
    routes: ["/reports"],
    automation: ["L1_recommend"],
    icon: "BarChart3",
  },

  // -------- Admin --------
  {
    id: "company",
    label: "Company",
    description: "Company profile, members, and roles.",
    category: "admin",
    featureKey: "company",
    roles: [],
    routes: ["/company"],
    automation: [],
    icon: "Building2",
    alwaysAvailable: true,
  },
  {
    id: "profile",
    label: "Profile",
    description: "User profile and preferences.",
    category: "admin",
    featureKey: "profile",
    roles: [],
    routes: ["/profile"],
    automation: [],
    icon: "User",
    alwaysAvailable: true,
  },
  {
    id: "help",
    label: "Help",
    description: "In-app how-to guides for every FleetOS module.",
    category: "admin",
    featureKey: "help",
    roles: [],
    routes: ["/help"],
    automation: [],
    icon: "HelpCircle",
    alwaysAvailable: true,
  },
  {
    id: "platform_admin",
    label: "Platform Admin",
    description: "Super-admin console across all companies.",
    category: "admin",
    featureKey: "platform_admin",
    roles: [],
    routes: ["/admin/platform", "/admin/users", "/admin/moderation", "/admin/error-logs"],
    automation: [],
    icon: "ShieldAlert",
    hiddenFromNav: true,
  },
] as const;

// ---------- Lookups ----------

const BY_ID = new Map<string, FleetOSModule>(FLEETOS_MODULES.map((m) => [m.id, m]));
const BY_ROUTE = new Map<string, FleetOSModule>();
for (const m of FLEETOS_MODULES) for (const r of m.routes) BY_ROUTE.set(r, m);

export function getModule(id: string): FleetOSModule | undefined {
  return BY_ID.get(id);
}

export function getModuleForRoute(pathname: string): FleetOSModule | undefined {
  // exact match, then longest-prefix match
  if (BY_ROUTE.has(pathname)) return BY_ROUTE.get(pathname);
  let best: FleetOSModule | undefined;
  let bestLen = 0;
  for (const [route, mod] of BY_ROUTE) {
    if (pathname.startsWith(route + "/") && route.length > bestLen) {
      best = mod;
      bestLen = route.length;
    }
  }
  return best;
}

export function modulesByCategory(category: ModuleCategory): FleetOSModule[] {
  return FLEETOS_MODULES.filter((m) => m.category === category);
}

/**
 * Compute the set of modules a user can see, given their roles and the
 * company's feature entitlements.
 *
 * @param roles           the user's active roles in the company
 * @param featureEnabled  (featureKey) => boolean, from useSubscription()
 * @param fullAccess      true for fleet_owner / fleet_manager / super_admin
 */
export function resolveVisibleModules(
  roles: Set<CompanyRole>,
  featureEnabled: (featureKey: string) => boolean,
  fullAccess: boolean,
): FleetOSModule[] {
  return FLEETOS_MODULES.filter((m) => {
    if (m.alwaysAvailable) return true;
    if (!featureEnabled(m.featureKey)) return false;
    if (fullAccess) return true;
    if (m.roles.length === 0) return true;
    for (const r of m.roles) if (roles.has(r)) return true;
    return false;
  });
}

/** All route paths owned by the registry (for router-level allowlists). */
export function allRegisteredRoutes(): string[] {
  return [...BY_ROUTE.keys()];
}

/** All entitlement keys the plan catalog must define. */
export function allFeatureKeys(): string[] {
  return Array.from(new Set(FLEETOS_MODULES.map((m) => m.featureKey)));
}
