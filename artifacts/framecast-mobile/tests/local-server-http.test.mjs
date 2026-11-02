import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { localServerConfig } from '../lib/local-server-config.ts';
import { LOCAL_RECEIVER_HTML } from '../lib/local-receiver.ts';

test('real phone-server config serves the player as HTML and supports private media byte ranges', async () => {
  const root = await mkdtemp('/tmp/framecast-http-test-');
  const portServer = net.createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const media = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  await writeFile(`${root}/receiver.html`, LOCAL_RECEIVER_HTML);
  await writeFile(`${root}/movie with spaces.mp4`, media);
  await writeFile(`${root}/private.txt`, 'must not be served');
  await writeFile(`${root}/server.conf`, `
server.document-root = "${root}"
server.bind = "127.0.0.1"
server.port = ${port}
${localServerConfig('/testsession', '.mp4', `${root}/receiver.html`, `${root}/movie with spaces.mp4`, ['http://192.168.1.45:45678'])}`);
  const server = spawn('lighttpd', ['-D', '-f', `${root}/server.conf`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  server.stderr.on('data', value => { errors += value; });
  const exited = new Promise(resolve => {
    server.once('error', error => { errors += error.message; resolve(); });
    server.once('exit', resolve);
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    let page;
    for (let i = 0; i < 30; i++) {
      try { page = await fetch(`${origin}/testsession/receiver.html`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(page, `Lighttpd must start: ${errors}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.equal(await page.text(), LOCAL_RECEIVER_HTML);
    const head = await fetch(`${origin}/testsession/receiver.html`, { method: 'HEAD' });
    assert.match(head.headers.get('content-type'), /^text\/html/);
    const part = await fetch(`${origin}/testsession/media.mp4`, { headers: { Range: 'bytes=8-15' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-type'), 'video/mp4');
    assert.equal(part.headers.get('content-range'), `bytes 8-15/${media.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), media.subarray(8, 16));
    const trusted = await fetch(`${origin}/testsession/media.mp4`, {
      headers: { Origin: 'http://192.168.1.45:45678', Range: 'bytes=0-3' },
    });
    assert.equal(trusted.status, 206);
    assert.equal(trusted.headers.get('access-control-allow-origin'), 'http://192.168.1.45:45678');
    assert.match(trusted.headers.get('access-control-expose-headers'), /Content-Length/);
    const preflight = await fetch(`${origin}/testsession/media.mp4`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://192.168.1.45:45678', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Range' },
    });
    assert.equal(preflight.ok, true);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://192.168.1.45:45678');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'Range');
    const untrusted = await fetch(`${origin}/testsession/media.mp4`, {
      headers: { Origin: 'https://unrelated.example' },
    });
    assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(`${origin}/private.txt`)).status, 403);
    assert.equal((await fetch(`${origin}/testsession/`)).status, 403);
  } finally {
    server.kill();
    await exited;
    await rm(root, { recursive: true, force: true });
  }
});

test('metadata access cannot be granted to public or injected receiver origins', () => {
  for (const origin of ['https://unrelated.example', 'http://192.168.evil.example', 'http://192.168.1.45:45678/path', 'http://192.168.1.45:45678"\n']) {
    assert.throws(() => localServerConfig('/testsession', '.mp4', '/receiver.html', '/video.mp4', [origin]));
  }
});

test('a receiver opening acknowledgement is not excluded from cancelling the navigation fallback', async () => {
  const app = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
  const handler = app.slice(app.indexOf("if (signal.type === 'player-state'"), app.indexOf('setRemoteVideoPosition({', app.indexOf("if (signal.type === 'player-state'")));
  assert.ok(handler.includes('localFallbackRef.current = null;'));
  assert.doesNotMatch(handler, /state\.playback\s*!==\s*['"]opening['"]/);
});
