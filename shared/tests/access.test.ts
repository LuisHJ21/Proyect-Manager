import { describe, expect, it } from 'vitest';
import { ACCESS, accessLevel, canRead, canWrite, LABELS, ROLE, SECTIONS, type Role } from '../src';

const EXPECTED = {
  project: ['write', 'read', 'read'],
  planning: ['write', 'read', 'read'],
  tasks: ['write', 'read', 'read'],
  comments: ['write', 'read', 'none'],
  attachments: ['write', 'read', 'read'],
  members: ['write', 'read', 'read'],
  raci: ['write', 'none', 'none'],
  deliverables: ['write', 'read', 'read'],
  lessons: ['write', 'write', 'read'],
  incidents: ['write', 'own', 'none'],
  decisions: ['write', 'none', 'none'],
  risks: ['write', 'own', 'none'],
  stakeholders: ['write', 'none', 'none'],
  budget: ['write', 'none', 'none'],
  performance: ['write', 'none', 'none'],
  changes: ['write', 'none', 'none'],
  closure: ['write', 'none', 'none'],
  activity: ['read', 'none', 'none'],
} as const;

const ROLES: Role[] = ['PM', 'COLLABORATOR', 'OBSERVER'];

describe('tabla de capacidades', () => {
  it('existe el perfil Observador', () => {
    expect(ROLE).toContain('OBSERVER');
    expect(LABELS.role.OBSERVER).toBe('Observador');
  });

  it('las secciones son las de la especificación', () => {
    expect([...SECTIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [section, levels] of Object.entries(EXPECTED)) {
    it(`sección ${section}`, () => {
      ROLES.forEach((role, i) => {
        const level = levels[i];
        const s = section as keyof typeof EXPECTED;
        expect(ACCESS[role][s]).toBe(level);
        expect(accessLevel(role, s)).toBe(level);
        expect(canRead(role, s)).toBe(level !== 'none');
        expect(canWrite(role, s)).toBe(level === 'write');
      });
    });
  }
});
