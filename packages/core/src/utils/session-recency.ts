import type { SessionDto } from '../types/dtos';

export function sessionUpdatedAt(session: SessionDto): number {
  return new Date(session.updatedAt).getTime();
}

export function isNewerSession(session: SessionDto, than: SessionDto): boolean {
  return sessionUpdatedAt(session) > sessionUpdatedAt(than);
}
