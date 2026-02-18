export type AppRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export function parseJwt(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}
