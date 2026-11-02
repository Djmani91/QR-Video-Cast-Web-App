export function parseSavedTvRoom(raw: string | null, now = Date.now()) {
  try {
    const room = JSON.parse(raw || 'null');
    if (!room || typeof room.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(room.id)
      || typeof room.code !== 'string' || !/^\d{2,3}$/.test(room.code)
      || typeof room.expiresAt !== 'string' || !(Date.parse(room.expiresAt) > now)) return null;
    return { id: room.id as string, code: room.code as string,
      expiresAt: room.expiresAt as string, paired: room.paired === true };
  } catch {
    return null;
  }
}
