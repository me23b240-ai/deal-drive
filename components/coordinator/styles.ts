export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const CARD = "rounded-[16px] border border-border bg-card";
export const BTN = `inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const BTN_PRIMARY = `inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const INPUT = `min-h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
export const LABEL = "mb-1 block text-xs font-medium text-muted";