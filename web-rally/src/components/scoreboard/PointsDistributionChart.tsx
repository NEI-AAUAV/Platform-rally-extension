import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ListingTeam } from "@/client";

interface PointsDistributionChartProps {
  readonly teams: ListingTeam[];
}

const ACCENT = "var(--rally-accent, var(--rally-accent-fallback))";
const ACCENT_SOFT = "var(--rally-accent-soft, var(--rally-accent-soft-fallback))";

/**
 * Horizontal bar chart of team totals — a quick read of the spread of points.
 * Lazy-loaded so recharts stays off the scoreboard's critical path.
 */
export default function PointsDistributionChart({ teams }: PointsDistributionChartProps) {
  const data = [...teams]
    .sort((a, b) => b.total - a.total)
    .map((team) => ({ name: team.name, total: team.total, leader: team.classification === 1 }));

  return (
    <div className="rally-brutal bg-muted p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Distribuição de pontos
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Bar dataKey="total" radius={[0, 2, 2, 0]} isAnimationActive>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.leader ? ACCENT : ACCENT_SOFT} />
            ))}
            <LabelList
              dataKey="total"
              position="right"
              fill="rgba(255,255,255,0.85)"
              fontSize={12}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
