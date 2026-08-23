"use client";

import { Card, Badge } from "@/components/ui";

interface RankingData {
  id: string;
  name: string;
  score: number;
  tasksCompleted: number;
  ordersCompleted: number;
  absenceCount: number;
}

export function ChampionDuMois({ ranking }: { ranking: RankingData[] }) {
  const champion = ranking[0];

  if (!champion || champion.score <= 0) {
    return (
      <Card className="p-6 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">🏆 Champion du Mois</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">À déterminer...</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900 dark:to-orange-900 border-2 border-amber-300 dark:border-amber-600">
      <div className="text-center">
        <div className="text-4xl mb-2">⭐</div>
        <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100">{champion.name}</h2>
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Champion du Mois</p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white/50 dark:bg-black/20 rounded-lg p-2">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{champion.tasksCompleted}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Tâches</p>
          </div>
          <div className="bg-white/50 dark:bg-black/20 rounded-lg p-2">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{champion.ordersCompleted}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Commandes</p>
          </div>
          <div className="bg-white/50 dark:bg-black/20 rounded-lg p-2">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{champion.score}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Points</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function EmployeeRanking({ ranking }: { ranking: RankingData[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📊 Classement Employés</h2>

      <div className="flex flex-col gap-2">
        {ranking.slice(0, 5).map((emp, idx) => (
          <div
            key={emp.id}
            className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border-l-4 border-brand-500"
          >
            <div className="flex items-center justify-center w-8 h-8 bg-brand-500 text-white rounded-full font-bold text-sm">
              {idx + 1}
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-white">{emp.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {emp.tasksCompleted} tâches • {emp.ordersCompleted} commandes • -{emp.absenceCount} absences
              </p>
            </div>
            <Badge tone={idx === 0 ? "amber" : idx === 1 ? "slate" : "blue"}>{emp.score} pts</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
