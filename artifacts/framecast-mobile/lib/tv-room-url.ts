export type TvLaunchRoom = {
  id: string;
  code: string;
  expiresAt: string;
};

export function buildTvRoomUrl(room: TvLaunchRoom): string {
  const url = new URL('https://2tx1.com/');
  url.searchParams.set('join', room.id);
  url.searchParams.set('code', room.code);
  url.searchParams.set('expiresAt', room.expiresAt);
  return url.toString();
}
