import type { QueryClient } from '@tanstack/react-query';

export const tasksKey = (projectId: string) => ['project', projectId, 'tasks'];
export const taskKey = (taskId: string) => ['task', taskId];

/** Tras cambiar una tarea, refresca todo lo que depende de ella. */
export async function refreshTaskData(queryClient: QueryClient, projectId: string, taskId?: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tasksKey(projectId) }),
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'indicators'] }),
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    // Fechas y horas cambian la ruta crítica y el costo real por categoría.
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'schedule'] }),
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'expenses', 'categories'] }),
    ...(taskId ? [queryClient.invalidateQueries({ queryKey: taskKey(taskId) })] : []),
  ]);
}
