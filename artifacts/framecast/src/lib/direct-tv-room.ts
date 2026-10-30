export type DirectTvRoom = {
  id: string;
  code: string;
  expiresAt: string;
};

export function parseDirectTvRoom(search: string): DirectTvRoom | null {
  const params = new URLSearchParams(search);
  const id = params.get('join') ?? '';
  const code = params.get('code') ?? '';
  const expiresAt = params.get('expiresAt') ?? '';

  if (
    !/^[0-9a-f-]{36}$/i.test(id)
    || !/^\d{5}$/.test(code)
    || !Number.isFinite(Date.parse(expiresAt))
  ) {
    return null;
  }
  return { id, code, expiresAt };
}
