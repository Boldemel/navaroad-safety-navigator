export const ROLES = [
  "fleet_owner",
  "fleet_administrator",
  "fleet_manager",
  "dispatcher",
  "safety_manager",
  "maintenance_manager",
  "accountant",
  "driver",
  "operations_manager",
  "recruiter",
  "human_resources",
  "compliance_manager",
  "billing_administrator",
  "customer_service",
  "driver_trainer",
  "shop_technician",
  "readonly_user",
] as const;
export type CompanyRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<CompanyRole, string> = {
  fleet_owner: "Fleet Owner",
  fleet_administrator: "Fleet Administrator",
  fleet_manager: "Fleet Manager",
  dispatcher: "Dispatcher",
  safety_manager: "Safety Manager",
  maintenance_manager: "Maintenance Manager",
  accountant: "Accounting / Payroll",
  driver: "Driver",
  operations_manager: "Operations Manager",
  recruiter: "Recruiter",
  human_resources: "Human Resources",
  compliance_manager: "Compliance Manager",
  billing_administrator: "Billing Administrator",
  customer_service: "Customer Service",
  driver_trainer: "Driver Trainer",
  shop_technician: "Shop Technician",
  readonly_user: "Read Only User",
};

export const PERMISSIONS = [
  "company.manage", "members.manage",
  "loads.manage", "loads.view",
  "routes.manage", "routes.view",
  "inspections.manage", "inspections.view",
  "maintenance.manage", "maintenance.view",
  "documents.manage", "documents.view",
  "fuel.manage", "fuel.view",
  "expenses.manage", "expenses.view",
  "ifta.manage", "ifta.view",
  "hos.manage", "hos.view",
  "drive",
] as const;
export type AppPermission = (typeof PERMISSIONS)[number];

export const ELD_SYSTEMS = [
  "Motive",
  "Samsara",
  "Geotab",
  "Omnitracs",
  "Platform Science",
  "Garmin eLog",
  "Rand McNally",
  "Verizon Connect",
  "KeepTruckin",
  "BigRoad",
  "Other",
] as const;
export type EldSystem = (typeof ELD_SYSTEMS)[number];

/** Extra permission toggles stored as JSON on profiles.permission_flags. Future-ready. */
export const PERMISSION_FLAGS = [
  "loads.create", "loads.edit", "loads.delete", "loads.dispatch",
  "financials.view", "financials.edit", "settlements.approve",
  "drivers.manage", "trucks.manage", "maintenance.manage",
  "users.invite", "users.delete",
  "reports.export", "billing.manage", "companySettings.manage",
  "gps.view", "messages.send", "ai.copilot",
] as const;
export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];

export const PERMISSION_FLAG_LABELS: Record<PermissionFlag, string> = {
  "loads.create": "Can Create Loads",
  "loads.edit": "Can Edit Loads",
  "loads.delete": "Can Delete Loads",
  "loads.dispatch": "Can Dispatch Loads",
  "financials.view": "Can View Financial Reports",
  "financials.edit": "Can Edit Financial Reports",
  "settlements.approve": "Can Approve Settlements",
  "drivers.manage": "Can Manage Drivers",
  "trucks.manage": "Can Manage Trucks",
  "maintenance.manage": "Can Manage Maintenance",
  "users.invite": "Can Invite Users",
  "users.delete": "Can Delete Users",
  "reports.export": "Can Export Reports",
  "billing.manage": "Can Manage Billing",
  "companySettings.manage": "Can Manage Company Settings",
  "gps.view": "Can View GPS",
  "messages.send": "Can Send Messages",
  "ai.copilot": "Can Access AI Copilot",
};

export const ACCOUNT_STATUSES = [
  "active", "inactive", "suspended", "pending", "locked", "password_expired",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  pending: "Pending Invitation",
  locked: "Locked",
  password_expired: "Password Expired",
};

export const FUEL_CARD_PROVIDERS = [
  "Comdata", "EFS", "Fleet One", "TCH", "WEX", "RTS", "Pilot Flying J", "TA/Petro", "Love's", "Other",
] as const;

export const TOLL_ACCOUNT_PROVIDERS = [
  "PrePass", "Bestpass", "E-ZPass", "SunPass", "TxTag", "I-PASS", "Peach Pass", "Other",
] as const;

export const DASH_CAMERA_PROVIDERS = [
  "Samsara", "Motive", "Lytx", "SmartDrive", "Netradyne", "Verizon Connect", "Nauto", "Other",
] as const;

export const EQUIPMENT_TYPES = [
  "Van", "Reefer", "Flatbed", "Step Deck", "Lowboy", "Tanker", "Hopper", "Auto Hauler", "Container", "Power Only", "Box Truck", "Other",
] as const;

export const TRAILER_TYPES = [
  "Dry Van", "Reefer", "Flatbed", "Step Deck", "Double Drop", "Lowboy", "Conestoga",
  "Tanker (Liquid)", "Tanker (Dry Bulk)", "Hopper Bottom", "End Dump", "Belt Trailer",
  "Auto Hauler", "Container Chassis", "Curtain Side", "Other",
] as const;

export const OPERATING_REGIONS = [
  "Local", "Regional", "OTR", "48 States", "US + Canada", "US + Mexico", "North America", "Northeast", "Southeast", "Midwest", "Southwest", "West Coast", "Northwest",
] as const;

/** Username-only logins get a synthesized email so Supabase Auth can store them. */
export const USERNAME_EMAIL_DOMAIN = "drivers.navaroad.local";

export function usernameToSyntheticEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

export type CompanyMember = {
  memberId: string;
  userId: string;
  driverName: string | null;
  email: string | null;
  isOwner: boolean;
  roles: CompanyRole[];
  overrides: { permission: AppPermission; granted: boolean }[];
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  employeeId: string | null;
  driverIdNumber: string | null;
  username: string | null;
  assignedTruck: string | null;
  assignedTrailer: string | null;
  eldSystem: string | null;
  active: boolean;
  mustChangePassword: boolean;
};

export type CompanySummary = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  myRoles: CompanyRole[];
  myMemberId: string;
};
