import { PIPELINE_STEPS, pipelineStep } from "@/lib/domain/pipeline";
import { CARD } from "./styles";
import type { CompanyDetail } from "./types";

export function PipelineStepper({ detail }: { detail: CompanyDetail }) {
  const p = detail.pipeline;
  const step = pipelineStep({
    crmStatus: detail.crmStatus,
    dealStage: p?.dealStage ?? detail.deal?.stage ?? null,
    itemCount: p?.itemCount ?? 0,
    paymentTerms: p?.paymentTerms ?? null,
    termsStatus: p?.termsStatus ?? null,
  });
  const hasDeal = Boolean(detail.deal);
  return (
    <section className={`${CARD} p-4`} aria-label="Pipeline">
      <h3 className="mb-3 text-sm font-semibold">Pipeline</h3>
      <ol className="flex flex-col gap-1.5">
        {PIPELINE_STEPS.map((label, i) => {
          const done = i < step || (i === 7 && step === 7);
          const current = i === step && step !== 7;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className={`flex items-center gap-2 text-sm ${done ? "text-foreground" : current ? "text-accent" : "text-muted"}`}>
              <span aria-hidden className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${done ? "border-success bg-success/20" : current ? "border-accent" : "border-border"}`}>
                {done ? "\u2713" : i + 1}
              </span>
              {label}
              {current ? <span className="text-xs text-muted">(you are here)</span> : null}
            </li>
          );
        })}
      </ol>
      {hasDeal ? (
        <p className="mt-3 flex gap-3 text-xs">
          <a className="text-accent underline" href={`/coordinator/slab/${detail.id}`}>
            Slab builder
          </a>
          <a className="text-accent underline" href={`/coordinator/mou/${detail.id}`}>
            MoU
          </a>
        </p>
      ) : null}
    </section>
  );
}