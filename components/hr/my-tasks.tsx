"use client";

import { useState } from "react";
import { completeTask, createTask } from "@/lib/actions/employee-actions";
import { Card, Button, Field, inputClass, Badge } from "@/components/ui";

interface Task {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: string;
  completed_at?: string;
}

export function MyTasks({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [showForm, setShowForm] = useState(false);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await completeTask(taskId, !completed);
      setTasks(
        tasks.map((t) =>
          t.id === taskId ? { ...t, completed_at: !completed ? new Date().toISOString() : undefined } : t
        )
      );
    } catch (error) {
      console.error("Erreur:", error);
    }
  };

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createTask(formData);
      setShowForm(false);
      (e.target as HTMLFormElement).reset();
      // Reload tasks
      window.location.reload();
    } catch (error) {
      console.error("Erreur:", error);
    }
  };

  const completed = tasks.filter((t) => t.completed_at).length;
  const total = tasks.length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mes Tâches</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {completed}/{total} complétées
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Ajouter"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAddTask} className="mb-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <Field label="Titre" htmlFor="title" required>
            <input id="title" name="title" type="text" required className={inputClass} />
          </Field>
          <Field label="Description" htmlFor="description">
            <textarea id="description" name="description" rows={2} className={inputClass} />
          </Field>
          <Field label="Deadline" htmlFor="deadline">
            <input id="deadline" name="deadline" type="date" className={inputClass} />
          </Field>
          <Field label="Priorité" htmlFor="priority">
            <select id="priority" name="priority" className={inputClass}>
              <option value="low">Basse</option>
              <option value="normal" selected>
                Normale
              </option>
              <option value="high">Haute</option>
              <option value="urgent">Urgente</option>
            </select>
          </Field>
          <Button type="submit" className="w-full">
            Ajouter
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">Aucune tâche</p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <input
                type="checkbox"
                checked={!!task.completed_at}
                onChange={() => handleToggleTask(task.id, !!task.completed_at)}
                className="w-5 h-5 rounded border-slate-300 cursor-pointer"
              />
              <div className="flex-1">
                <p
                  className={`font-medium ${
                    task.completed_at ? "line-through text-slate-400" : "text-slate-900 dark:text-white"
                  }`}
                >
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
                )}
              </div>
              <div className="flex gap-2 items-center">
                {task.deadline && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{task.deadline}</span>
                )}
                <Badge
                  tone={
                    task.priority === "urgent"
                      ? "red"
                      : task.priority === "high"
                        ? "amber"
                        : task.priority === "low"
                          ? "blue"
                          : "slate"
                  }
                >
                  {task.priority}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <div className="mt-4 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      )}
    </Card>
  );
}
