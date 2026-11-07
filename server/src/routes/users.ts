import { createUserSchema, resetPasswordSchema, updateUserSchema } from '@pm/shared';
import type { User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { requirePm } from '../auth/guards';
import { hashPassword } from '../auth/passwords';
import { deleteUserSessions } from '../auth/sessions';
import { toUserDto } from '../auth/userDto';
import { AppError, notFound } from '../errors';

export async function userRoutes(app: FastifyInstance) {
  const { prisma } = app;

  const findUser = async (id: string): Promise<User> => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('Usuario no encontrado');
    return user;
  };

  app.get('/api/users', async (req) => {
    requirePm(req);
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    return users.map(toUserDto);
  });

  app.post('/api/users', async (req, reply) => {
    requirePm(req);
    const input = createUserSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      const message = 'Ya existe una cuenta con este correo';
      throw new AppError(409, 'email_taken', message, { fields: { email: message } });
    }
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await hashPassword(input.temporaryPassword),
        mustChangePassword: true,
      },
    });
    return reply.status(201).send(toUserDto(user));
  });

  app.patch<{ Params: { id: string } }>('/api/users/:id', async (req) => {
    requirePm(req);
    const target = await findUser(req.params.id);
    const input = updateUserSchema.parse(req.body);

    const losesPmAccess = target.role === 'PM' && target.active && (input.active === false || input.role === 'COLLABORATOR');
    if (losesPmAccess && (await prisma.user.count({ where: { role: 'PM', active: true } })) <= 1) {
      throw new AppError(409, 'last_pm', 'Debe quedar al menos un Project Manager activo');
    }

    const updated = await prisma.user.update({ where: { id: target.id }, data: input });
    if (input.active === false) await deleteUserSessions(prisma, target.id);
    return toUserDto(updated);
  });

  app.post<{ Params: { id: string } }>('/api/users/:id/reset-password', async (req) => {
    requirePm(req);
    const target = await findUser(req.params.id);
    const input = resetPasswordSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true },
    });
    await deleteUserSessions(prisma, target.id);
    return toUserDto(updated);
  });
}
