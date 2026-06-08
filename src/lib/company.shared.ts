export const ROLES = [
  "fleet_owner",
  "dispatcher",
  "safety_manager",
  "maintenance_manager",
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

export type CompanyMember = {
  memberId: string;
  userId: string;
  driverName: string | null;
  email: string | null;
  isOwner: boolean;
  roles: CompanyRole[];
  overrides: { permission: AppPermission; granted: boolean }[];
};

export type CompanySummary = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  myRoles: CompanyRole[];
  myMemberId: string;
};
