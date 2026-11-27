import type { Ctx } from "@/lib/types";
import { ForbiddenError } from "@/lib/db/errors";

export function assertWritable(ctx: Ctx): void {
  if (ctx.isLocked) throw new ForbiddenError("This dataset is locked and read-only.");
}

export function requireHead(ctx: Ctx): void {
  if (ctx.role !== "head") throw new ForbiddenError("Head access only.");
}

export function requireMember(ctx: Ctx): string {
  if (ctx.role !== "coordinator" || !ctx.memberId) throw new ForbiddenError("Coordinator session required.");
  return ctx.memberId;
}

/** Coordinators are always scoped to themselves; the head may pass an owner or null for everyone. */
export function scopeOwner(ctx: Ctx, requested?: string | null): string | null {
  if (ctx.role === "coordinator") {
    if (!ctx.memberId) throw new ForbiddenError("No coordinator selected.");
    return ctx.memberId;
  }
  return requested ?? null;
}