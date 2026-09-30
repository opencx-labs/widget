// Opt-in provider check: actual local authentication/mint, production embed,
// real WebRTC and transcription, synthetic audio only. No physical device.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium, firefox, webkit } from 'playwright';

assert.equal(process.env.WIDGET_LIVE_DICTATION, 'true');
const fixture = JSON.parse(
  await readFile(process.env.WIDGET_LOCAL_IDENTITIES, 'utf8'),
);
const base = new URL(fixture.base);
assert.equal(base.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
const [identity] = fixture.identities;
const configResponse = await fetch(new URL('/backend/widget/v2/config', base), {
  headers: { 'x-bot-token': identity.botToken },
  signal: AbortSignal.timeout(10000),
});
assert.equal(configResponse.status, 200);
assert.equal(
  (await configResponse.json()).agent.features.dictation,
  true,
  'refresh local fixtures with verify.mjs before running dictation',
);
const bundle = await readFile(
  new URL('../../dist-embed/script.js', import.meta.url),
);
const speech = await readFile(process.env.WIDGET_LIVE_DICTATION_AUDIO);
assert.ok(
  speech.length > 1000,
  'synthetic audio must contain speech, not just an empty header',
);
const engine = process.env.WIDGET_TEST_BROWSER ?? 'chromium';
assert.ok(['chromium', 'firefox', 'webkit'].includes(engine));

for (const displayMode of ['popover', 'companion']) {
  test(
    `${displayMode}: real ${engine} transcription, stop and close release synthetic tracks`,
    { timeout: 90000 },
    async (t) => {
      const browser = await { chromium, firefox, webkit }[engine].launch();
      const unexpected = [],
        mintStatuses = [],
        handshakeStatuses = [],
        errors = [];
      const server = createServer((req, res) => {
        if (req.url === '/script.js') {
          res.setHeader('content-type', 'application/javascript');
          return res.end(bundle);
        }
        if (req.url === '/speech.wav') {
          res.setHeader('content-type', 'audio/wav');
          return res.end(speech);
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(
          '<!doctype html><html><body><h1>Local dictation verification</h1><script src="/script.js"></script></body></html>',
        );
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${server.address().port}`;
      t.after(async () => {
        const currentPage = browser.contexts()[0]?.pages()[0];
        const state = await currentPage
          ?.evaluate(() => ({
            tracks: window.dictationFixture.streams.map((stream) =>
              stream.getTracks().map((track) => track.readyState),
            ),
            peers: window.dictationFixture.peers.map((peer) => ({
              connection: peer.connectionState,
              ice: peer.iceConnectionState,
              signaling: peer.signalingState,
            })),
            events: window.dictationFixture.events,
            transitions: window.dictationFixture.transitions,
            audio: window.dictationFixture.audio.map((audio) => audio.state),
            permissionTracks: window.dictationFixture.permissionStreams.flatMap(
              (stream) => stream.getTracks().map((track) => track.readyState),
            ),
          }))
          .catch(() => null);
        t.diagnostic(
          JSON.stringify({
            state,
            mintStatuses,
            handshakeStatuses,
            unexpected,
          }),
        );
        await browser.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      });
      // The synthetic capture below bypasses the native permission prompt.
      // Grant the permission it models: WebKit restricts ICE candidates without
      // capture permission, even when the supplied track is generated audio.
      const context = await browser.newContext({
        serviceWorkers: 'block',
        permissions: engine === 'webkit' ? ['microphone'] : [],
      });
      let sends = 0;
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (
          [origin, base.origin].includes(url.origin) ||
          url.href === 'https://api.openai.com/v1/realtime/calls'
        )
          return route.continue();
        unexpected.push(url.origin + url.pathname);
        return route.abort();
      });
      await context.addInitScript((engine) => {
        window.dictationFixture = {
          streams: [],
          peers: [],
          events: [],
          transitions: [],
          audio: [],
          permissionStreams: [],
        };
        const NativePeer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeer {
          constructor(...args) {
            super(...args);
            window.dictationFixture.peers.push(this);
            for (const type of [
              'connectionstatechange',
              'iceconnectionstatechange',
              'icegatheringstatechange',
              'signalingstatechange',
            ]) {
              this.addEventListener(type, () =>
                window.dictationFixture.transitions.push({
                  type,
                  time: Math.round(performance.now()),
                  connection: this.connectionState,
                  ice: this.iceConnectionState,
                  gathering: this.iceGatheringState,
                  signaling: this.signalingState,
                }),
              );
            }
          }
          createDataChannel(...args) {
            const channel = super.createDataChannel(...args);
            channel.addEventListener('message', (event) => {
              const value = JSON.parse(event.data);
              window.dictationFixture.events.push(value.type);
            });
            return channel;
          }
        };
        const nativeCapture = navigator.mediaDevices?.getUserMedia.bind(
          navigator.mediaDevices,
        );
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getUserMedia: async () => {
              if (engine === 'webkit') {
                // Playwright WebKit enables MockCaptureDevices. Complete its
                // native permission path before substituting speech audio;
                // replacing getUserMedia alone leaves ICE restrictions active.
                const permissionStream = await nativeCapture({ audio: true });
                window.dictationFixture.permissionStreams.push(
                  permissionStream,
                );
                permissionStream.getTracks().forEach((track) => track.stop());
                if (
                  permissionStream
                    .getTracks()
                    .some(
                      (track) => !track.label.startsWith('Mock audio device'),
                    )
                )
                  throw new Error('Expected the Playwright mock microphone');
              }
              const audio = new AudioContext();
              await audio.resume();
              const destination = audio.createMediaStreamDestination();
              const source = audio.createBufferSource();
              source.buffer = await audio.decodeAudioData(
                await (await fetch('/speech.wav')).arrayBuffer(),
              );
              source.connect(destination);
              window.dictationFixture.streams.push(destination.stream);
              window.dictationFixture.audio.push(audio);
              window.dictationFixture.play = () => source.start();
              return destination.stream;
            },
          },
        });
      }, engine);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.name));
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.pathname.endsWith('/dictation/sessions'))
          mintStatuses.push(response.status());
        if (url.href === 'https://api.openai.com/v1/realtime/calls')
          handshakeStatuses.push(response.status());
      });
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.endsWith('/chat/send')) sends++;
      });
      const publicHtml = await (await fetch(origin)).text();
      assert.equal(
        [identity.botToken, identity.renewed].some((secret) =>
          publicHtml.includes(secret),
        ),
        false,
        'the fixture HTTP response must not expose local credentials',
      );
      await page.goto(origin);
      // Supply temporary identities only through the private automation channel.
      // The loopback HTTP server must never serve them to other local processes.
      await page.evaluate((config) => window.initOpenScript(config), {
        token: identity.botToken,
        apiUrl: base.origin,
        user: { token: identity.renewed, externalId: 'local-a' },
        features: { dictation: true },
        displayMode,
        language: 'en',
        collectUserData: false,
        router: { chatScreenOnly: true },
        disableTooltips: true,
      });
      const frame = page.frameLocator('iframe[title="OpenCX Live Chat"]');
      const launcher = page
        .frameLocator('iframe[title="OpenCX Live Chat Trigger"]')
        .locator('button');
      if (displayMode === 'companion')
        await page.locator('[data-companion-launcher]').click();
      else await launcher.click();
      const input = frame.locator('textarea');
      await input.fill('Typed prefix. ');
      const mic = frame.locator(
        '[data-component="chat/input_box/dictate_btn"]',
      );
      await mic.click();
      await page.waitForFunction(
        () =>
          window.dictationFixture.peers.at(-1)?.connectionState === 'connected',
      );
      await page.evaluate(() => window.dictationFixture.play());
      await page.waitForFunction(
        () => {
          const input = document
            .querySelector('iframe[title="OpenCX Live Chat"]')
            ?.contentDocument?.querySelector('textarea');
          return /payment status/i.test(input?.value ?? '');
        },
        undefined,
        { timeout: 30000 },
      );
      assert.match(await input.inputValue(), /^Typed prefix\./);
      await mic.click();
      const stopped = await page.evaluate(() => ({
        tracksEnded: window.dictationFixture.streams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended'),
        ),
        peersClosed: window.dictationFixture.peers.every(
          (peer) => peer.connectionState === 'closed',
        ),
        deltaCount: window.dictationFixture.events.filter(
          (type) =>
            type === 'conversation.item.input_audio_transcription.delta',
        ).length,
      }));
      assert.ok(stopped.tracksEnded);
      assert.ok(stopped.peersClosed);
      assert.ok(
        stopped.deltaCount > 0,
        'must receive real streamed transcription deltas',
      );
      await mic.click();
      await page.waitForFunction(
        () =>
          window.dictationFixture.streams.length === 2 &&
          window.dictationFixture.peers.at(-1)?.connectionState === 'connected',
      );
      if (displayMode === 'companion')
        await frame.locator('[data-component="companion/close_btn"]').click();
      else await launcher.click();
      await page.waitForFunction(() =>
        window.dictationFixture.streams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended'),
        ),
      );
      assert.ok(
        await page.evaluate(() =>
          window.dictationFixture.peers.every(
            (peer) => peer.connectionState === 'closed',
          ),
        ),
      );
      assert.ok(
        await page.evaluate(() =>
          window.dictationFixture.permissionStreams.every((stream) =>
            stream.getTracks().every((track) => track.readyState === 'ended'),
          ),
        ),
      );
      assert.equal(sends, 0, 'dictation must not send an unsubmitted message');
      assert.ok(
        mintStatuses.length > 0 &&
          mintStatuses.every((status) => status === 201 || status === 200),
      );
      assert.equal(handshakeStatuses.length, 2);
      assert.ok(
        handshakeStatuses.every((status) => status === 201 || status === 200),
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      t.diagnostic(
        `real WebRTC, ${stopped.deltaCount} transcript deltas, both tracks stopped; no physical microphone`,
      );
    },
  );
}
