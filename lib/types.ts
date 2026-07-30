export const ROLES = [
  "DEAL_TEAM",
  "OPS",
  "LEGAL",
  "MD_PUBLIC",
  "MD_PRIVATE",
  "COO",
  "CEO",
  "ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  DEAL_TEAM: "Deal Team",
  OPS: "Ops",
  LEGAL: "Legal",
  MD_PUBLIC: "MD — Publics",
  MD_PRIVATE: "MD — Privates",
  COO: "COO",
  CEO: "CEO",
  ADMIN: "Admin",
};

export const MARKET_TYPES = ["PUBLIC", "PRIVATE"] as const;
export type MarketType = (typeof MARKET_TYPES)[number];

export const STAGES = [
  "PIPELINE",
  "ONE_PAGER",
  "FIVE_PAGER",
  "ODD_LEGAL",
  "PROPOSAL",
  "APPROVALS",
  "APPROVED",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  PIPELINE: "Pipeline",
  ONE_PAGER: "One-Pager",
  FIVE_PAGER: "Five-Pager",
  ODD_LEGAL: "ODD & Legal",
  PROPOSAL: "Investment Proposal",
  APPROVALS: "Approvals",
  APPROVED: "Approved",
};

export const DEAL_STATUSES = ["ACTIVE", "ON_HOLD", "PASSED", "APPROVED"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  PASSED: "Passed",
  APPROVED: "Approved",
};

export const DOC_KINDS = [
  "PITCH_DECK",
  "ONE_PAGER",
  "FIVE_PAGER",
  "DDQ",
  "ODD_REPORT",
  "LPA",
  "SUB_DOCS",
  "PROPOSAL",
  "OTHER",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  PITCH_DECK: "Pitch Deck",
  ONE_PAGER: "One-Pager",
  FIVE_PAGER: "Five-Pager",
  DDQ: "DDQ",
  ODD_REPORT: "ODD Report",
  LPA: "LPA",
  SUB_DOCS: "Sub Docs",
  PROPOSAL: "Investment Proposal",
  OTHER: "Other",
};

export const APPROVAL_STEPS = ["MD", "LEGAL", "COO", "CEO"] as const;
export type ApprovalStep = (typeof APPROVAL_STEPS)[number];

export const APPROVAL_STEP_LABELS: Record<ApprovalStep, string> = {
  MD: "MD — Investment",
  LEGAL: "Legal — Docs",
  COO: "COO",
  CEO: "CEO",
};

export function stageIndex(stage: string): number {
  return STAGES.indexOf(stage as Stage);
}

export function hasRole(user: { roles: { role: string }[] }, ...roles: Role[]): boolean {
  return user.roles.some((r) => roles.includes(r.role as Role));
}

export function isAdmin(user: { roles: { role: string }[] }): boolean {
  return hasRole(user, "ADMIN");
}

/** Roles allowed to create/edit deals and move them through stages. */
export function canManageDeals(user: { roles: { role: string }[] }): boolean {
  return hasRole(user, "DEAL_TEAM", "MD_PUBLIC", "MD_PRIVATE", "ADMIN");
}
