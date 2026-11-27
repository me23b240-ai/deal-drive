import type { DemoRole } from "@/lib/session";
import type { StatusCode } from "@/lib/domain/status";

export type { Holiday } from "@/lib/domain/bizdays";

export type EventInfo = {
  id: string;
  name: string;
  is_seed: boolean;
  starts_at: string | null;
  ends_at: string | null;
  as_of: string | null;
  weekly_target_default: number;
  model_assumptions: Record<string, unknown>;
};

export type Ctx = {
  eventId: string;
  event: EventInfo;
  role: DemoRole;
  memberId: string | null;
  isCloser: boolean;
  todayIst: string;
  isLocked: boolean;
};

export type TeamMember = {
  id: string;
  source_id: string | null;
  name: string;
  role: "member" | "manager";
  is_closer: boolean;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type NeedsUpdateRow = {
  brand_id: string;
  event_id: string;
  company: string;
  owner_id: string | null;
  crm_status: StatusCode;
  last_touch: string;
  next_follow_up: string | null;
  approx_amount_inr: number | null;
  days_threshold: number;
  idle_bdays: number;
  reason: "idle" | "follow_up_due";
};

export type WeeklyProgressRow = {
  event_id: string;
  owner_id: string | null;
  week_start: string;
  outreached: number;
  responded: number;
  prospective_now: number;
  converted_now: number;
  rejected_now: number;
  ghosting_now: number;
  didnt_pick_now: number;
};

export type CoordSummaryRow = {
  event_id: string;
  owner_id: string | null;
  total_outreached: number;
  total_responded: number;
  prospective: number;
  converted: number;
  rejected: number;
  ghosting: number;
  queued: number;
  approx_amt_inr: number;
  final_amt_inr: number;
  last_active_at: string | null;
};

export type ChannelFunnelRow = {
  event_id: string;
  channel: string;
  companies: number;
  outreached: number;
  responded: number;
  prospective_or_better: number;
  prospective_now: number;
  converted: number;
  rejected: number;
  ghosting: number;
  prospective_inr: number;
  signed_inr: number;
};

export type InitiativeFunnelRow = {
  event_id: string;
  initiative_id: string;
  companies: number;
  queued: number;
  outreached: number;
  responded: number;
  prospective_or_better: number;
  converted: number;
  signed_inr: number;
};

export type WarmthFunnelRow = {
  event_id: string;
  warmth: "warm" | "other";
  companies: number;
  queued: number;
  outreached: number;
  responded: number;
  prospective_or_better: number;
  converted: number;
};

export type DealDeskRow = {
  deal_id: string;
  event_id: string;
  brand_id: string;
  company: string;
  owner_id: string | null;
  stage: "prospecting" | "proposal_sent" | "negotiating";
  proposed_inr: number;
  next_follow_up: string | null;
  last_touch: string;
  idle_bdays: number;
  nudges: number;
};

export type CashSummaryRow = {
  event_id: string;
  owner_id: string | null;
  channel: string;
  pre_fest_scheduled_inr: number;
  pre_fest_collected_inr: number;
  pre_fest_pending_inr: number;
  post_fest_scheduled_inr: number;
  post_fest_collected_inr: number;
};

export type StaleRule = { state_key: string; days_threshold: number };

export type TeamGoal = {
  scenario: "base" | "stretch";
  signed_value_goal_inr: number | null;
  cash_collected_goal_inr: number | null;
  version_label: string | null;
};

export type WeeklyStrip = {
  weekStart: string;
  weekEnd: string;
  target: number;
  label: string;
  source: "row" | "default";
  outreached: number;
  responded: number;
  responseRate: number | null;
  businessDaysLeft: number;
  remaining: number;
  requiredPerDay: number | null;
};

export type TeamWeekSummary = {
  weekStart: string;
  outreached: number;
  responded: number;
  target: number;
  members: { memberId: string; name: string; target: number; outreached: number; responded: number }[];
};