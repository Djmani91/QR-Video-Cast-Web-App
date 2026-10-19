export const ROTATION_RENDERER_VERSION = 4;

const REFRESH_MESSAGE = 'Refresh the TV browser page, reconnect your phone, then send the video again. The TV page is using an older video player.';

/** A TV room can stay open across publishes. Do not silently mix player versions. */
export function verifyRotationRenderer(channel: RTCDataChannel, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.removeEventListener('message', onMessage);
      channel.removeEventListener('close', onClose);
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const packet = JSON.parse(event.data);
        if (packet.framecast !== 'receiver-info') return;
        finish(Number.isFinite(packet.rotationRenderer) && packet.rotationRenderer >= ROTATION_RENDERER_VERSION
          ? undefined : new Error(REFRESH_MESSAGE));
      } catch {
        // Other media messages are handled by the existing transfer listener.
      }
    };
    const onClose = () => finish(new Error('The TV disconnected before its player was ready. Reconnect to the TV.'));
    channel.addEventListener('message', onMessage);
    channel.addEventListener('close', onClose);
    timer = setTimeout(() => finish(new Error(REFRESH_MESSAGE)), timeoutMs);
    try {
      channel.send(JSON.stringify({ framecast: 'receiver-info' }));
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Could not check the TV player.'));
    }
  });
}
