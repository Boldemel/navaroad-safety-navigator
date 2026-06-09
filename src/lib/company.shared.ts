export const ROLES = [
  "fleet_owner",
  "fleet_manager",
  "dispatcher",
  "safety_manager",
  "maintenance_manager",
  "accountant",
  "driver",
] as const;
export type CompanyRole = (typeof ROLES)[number];

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
  "KeepTruckin",
  "Rand McNally",
  "Omnitracs",
  "Verizon Connect",
  "Other",
] as const;
export type EldSystem = (typeof ELD_SYSTEMS)[number];

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
