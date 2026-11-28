import { errorMessage } from "@/lib/db/errors";
import { getSourceScorecard, type ScoreLine, type SourceScorecard } from "@/lib/db/queries/head-a-scorecard";
import { MIN_SCORE_N } from "@/lib/model/peerfest";
import type { Ctx } from "@/lib/types";
import { Card, EmptyBox, ErrorBox } from "./KpiCards";

const pct = (x: number | null): string => (x === null ? "-" : `${Math.round(x * 1000) / 10}%`);

function Table({ title, lines, empty }: { title: string; lines: ScoreLine[]; empty: string }) {
  if (lines.length === 0) return <EmptyBox message={empty} />;
  return (
    <div className="overflow-x-auto rounded-[16px] border border-border">
      <table className="w-full min-w-[680px] text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-3 py-3 text-left font-medium">{title}</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">n outreached</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Response</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Proposal</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Sign</th>
            <th scope="col" className="px-3 py-3 text-left font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-b border-border/60">
              <th scope="row" className="px-3 py-2 text-left font-normal">{l.label}</th>
              <td className="px-3 py-2 text-right tabular-nums">{l.score.n}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(l.score.responseRate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(l.score.proposalRate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(l.score.signRate)}</td>
              <td className="px-3 py-2 text-xs">
                {l.score.insufficient ? (
                  <span className="inline-flex items-center gap-1 text-approx"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />insufficient data (n under {MIN_SCORE_N})</span>
                ) : (
                  <span className="text-success">enough data</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function SourceScorecardSection({ ctx }: { ctx: Ctx }) {
  let s: SourceScorecard;
  try {
    s = await getSourceScorecard(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <Card title="Source scorecard">
      <p className="mb-3 text-xs text-muted">Response = responded / outreached, proposal = reached Prospective / responded, sign = converted / proposals.</p>
      <div className="space-y-4">
        <Table title="By source channel" lines={s.byChannel} empty="No companies yet." />
        <Table title="By signal tag" lines={s.bySignal} empty="No company has a signal tag yet. Tags are set in Lead intake." />
      </div>
    </Card>
  );
}