-- El Project Manager no tiene tareas asignadas: las tareas son de los colaboradores.
DELETE FROM "TaskAssignee" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'PM');
