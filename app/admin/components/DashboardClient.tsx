'use client';

import EmployeeRanking from './EmployeeRanking';
import MyTasks from './MyTasks';
import AbsenceReporter from './AbsenceReporter';
import { useEffect, useState } from 'react';

export default function DashboardClient() {
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    // Get employee ID from localStorage or session
    const stored = localStorage.getItem('employeeId');
    if (stored) {
      setEmployeeId(stored);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Tasks and Absence Section */}
      {employeeId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
              <MyTasks employeeId={employeeId} />
            </div>
          </div>
          <div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
              <AbsenceReporter employeeId={employeeId} />
            </div>
          </div>
        </div>
      )}

      {/* Champion du Mois Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <EmployeeRanking />
      </div>
    </div>
  );
}
