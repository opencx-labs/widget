// Opt-in real local API verification. Run from the backend checkout under Node 24
// with --experimental-transform-types; see README.md. No production destinations.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.TEST_POSTGRES_URL, '');
assert.equal(process.env.NEON_POSTGRES_URL, '');
assert.match(process.env.LOCAL_POSTGRES_DB ?? '', /^opencx_widget_[a-z0-9_]+$/);
const backend = process.cwd();
const base = new URL(
  process.env.WIDGET_LOCAL_BACKEND ?? 'http://127.0.0.1:8184',
);
assert.equal(base.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
const source = (path) => import(pathToFileURL(resolve(backend, path)));
const { db } = await source('src/db/db.ts');
const { testUtils_organization_createOrg: createOrg } = await source(
  'src/test/util/organization/create-org.ts',
);
const { testUtils_dashboardAuth_dashboardHeaders: auth } = await source(
  'src/test/util/dashboard-auth/dashboard-headers.ts',
);
const { testUtils_user_addUserToOrgWithPermissions: member } = await source(
  'src/test/util/user/add-user-to-org-with-permissions.ts',
);
const { Capability } = await source('src/utils/permission.ts');
const {
  aiAgentFeatures_all,
  aiAgentEntitlements_all,
  AI_AGENT_ENTITLED_FEATURE_KEYS,
} = await source('src/agent-engine/ai-agent-features.dto.ts');
const { chatbotMetadata_service_set: metadata } = await source(
  'src/copilot/chatbot-metadata-service/set.ts',
);
const { agentRuntimeConfig_service_resolveFeatures: effective } = await source(
  'src/agent-engine/runtime-config-service/resolve-features.ts',
);
const { contact_service_upsertContact: contact } = await source(
  'src/consumer/service/upsert-contact.ts',
);
const { WidgetContactTokenCodec } = await source(
  'src/widget/widget-contact-jwt-codec.ts',
);
const { AutopilotSettingsDtoSchema } = await source(
  'src/copilot/dto/autopilot-settings.dto.ts',
);
const autopilotSettings = JSON.stringify(
  AutopilotSettingsDtoSchema.parse({ web: { autopilot_enabled: false } }),
);
const results = [];
async function api(path, headers, method = 'GET', body, expected = 200) {
  const response = await fetch(new URL(`/backend/${path}`, base), {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: unexpected status`,
  );
  if (expected !== 200 && expected !== 201) return;
  return response.json();
}
async function check(name, fn) {
  await fn();
  results.push(name);
  process.stdout.write(`PASS ${name}\n`);
}
try {
  const a = await createOrg({
    orgName: 'Widget local stability A',
    orgData: {
      autopilot_settings: autopilotSettings,
      ai_agent_entitlements: JSON.stringify(aiAgentEntitlements_all()),
    },
  });
  const b = await createOrg({
    orgName: 'Widget local stability B',
    orgData: { autopilot_settings: autopilotSettings },
  });
  await metadata(a.orgId, { ai_agent_v3_enabled: true });
  await metadata(b.orgId, { ai_agent_v3_enabled: true });
  const adminA = await auth({ userId: a.user.id, orgId: a.orgId });
  const adminB = await auth({ userId: b.user.id, orgId: b.orgId });
  const reader = await member({
    orgId: a.orgId,
    permissions: [
      Capability['settings-autopilot:read'],
      Capability['settings-channels:read'],
    ],
  });
  const readerHeaders = await auth({ userId: reader.user.id, orgId: a.orgId });
  const config = (org) =>
    api('widget/v2/config', { 'x-bot-token': org.org.token });
  const baselineB = await api('ai-agent-features', adminB);
  const on = aiAgentFeatures_all();
  await api('ai-agent-features', adminA, 'PATCH', on);
  for (const key of Object.keys(on)) {
    await check(
      `feature ${key}: off/on save, reload, runtime and org isolation`,
      async () => {
        for (const value of [false, true]) {
          await api('ai-agent-features', adminA, 'PATCH', { [key]: value });
          const read = await api('ai-agent-features', adminA);
          assert.deepEqual(read.features, { ...on, [key]: value });
          const org = await db
            .selectFrom('chatbots')
            .select(['id', 'ai_agent_features', 'ai_agent_entitlements'])
            .where('id', '=', a.orgId)
            .executeTakeFirstOrThrow();
          assert.equal((await effective(org))[key], value);
          const widget = await config(a);
          if (key in widget.agent.features)
            assert.equal(widget.agent.features[key], value);
          assert.deepEqual(await api('ai-agent-features', adminB), baselineB);
        }
      },
    );
  }
  await check(
    'read-only and cross-org settings writes are rejected without mutation',
    async () => {
      const before = await api('ai-agent-features', adminA);
      const beforePresentation = await api('widget-settings', adminA);
      await api(
        'ai-agent-features',
        readerHeaders,
        'PATCH',
        { memory: false },
        403,
      );
      await api(
        'ai-agent-features',
        { ...adminA, 'x-org-id': b.orgId },
        'PATCH',
        { memory: false },
        401,
      );
      await api(
        'widget-settings',
        readerHeaders,
        'PUT',
        {
          presentation: {
            streaming: false,
            toolActivity: 'hidden',
            reasoning: false,
          },
        },
        403,
      );
      await api('ai-agent-features', adminA, 'PATCH', { memory: 'yes' }, 400);
      assert.deepEqual(await api('ai-agent-features', adminA), before);
      assert.deepEqual(
        await api('widget-settings', adminA),
        beforePresentation,
      );
    },
  );
  await check(
    'every denied entitlement rejects a mixed write atomically and stays ineffective',
    async () => {
      for (const key of AI_AGENT_ENTITLED_FEATURE_KEYS) {
        await api(
          'ai-agent-features',
          adminB,
          'PATCH',
          { preamble: false, [key]: true },
          403,
        );
        assert.deepEqual(await api('ai-agent-features', adminB), baselineB);
        const org = await db
          .selectFrom('chatbots')
          .select(['id', 'ai_agent_features', 'ai_agent_entitlements'])
          .where('id', '=', b.orgId)
          .executeTakeFirstOrThrow();
        assert.equal((await effective(org))[key], false);
        const widget = await config(b);
        if (key in widget.agent.features)
          assert.equal(widget.agent.features[key], false);
      }
    },
  );
  await check(
    'concurrent independent feature patches both persist',
    async () => {
      await Promise.all([
        api('ai-agent-features', adminA, 'PATCH', { memory: false }),
        api('ai-agent-features', adminA, 'PATCH', { dictation: false }),
      ]);
      const read = await api('ai-agent-features', adminA);
      assert.equal(read.features.memory, false);
      assert.equal(read.features.dictation, false);
    },
  );
  await check(
    'all 12 presentation combinations persist and reach the widget config',
    async () => {
      const other = await api('widget-settings', adminB);
      for (const streaming of [false, true])
        for (const toolActivity of ['hidden', 'status', 'details'])
          for (const reasoning of [false, true]) {
            const presentation = { streaming, toolActivity, reasoning };
            await api('widget-settings', adminA, 'PUT', { presentation });
            assert.deepEqual(
              (await api('widget-settings', adminA)).presentation,
              presentation,
            );
            assert.deepEqual(
              (await config(a)).agent.presentation,
              presentation,
            );
            assert.deepEqual(await api('widget-settings', adminB), other);
          }
      const before = await api('widget-settings', adminA);
      await api(
        'widget-settings',
        adminA,
        'PUT',
        { presentation: { toolActivity: 'invalid' } },
        400,
      );
      assert.deepEqual(await api('widget-settings', adminA), before);
    },
  );
  const identities = [];
  for (const [org, name] of [
    [a, 'A'],
    [a, 'B'],
    [b, 'C'],
  ]) {
    const row = await contact({
      orgId: org.orgId,
      contact: {
        email: `widget-${name}-${crypto.randomUUID()}@example.invalid`,
      },
    });
    const payload = {
      org_id: org.orgId,
      contact: { id: row.id, verified: true },
    };
    identities.push({
      name,
      orgId: org.orgId,
      botToken: org.org.token,
      token: WidgetContactTokenCodec.createToken(payload, {
        expiresInSeconds: 3600,
      }),
      renewed: WidgetContactTokenCodec.createToken(payload, {
        expiresInSeconds: 7200,
      }),
      expired: WidgetContactTokenCodec.createToken(payload, {
        expiresInSeconds: -1,
      }),
    });
  }
  for (const owner of identities) {
    owner.headers = {
      'x-bot-token': owner.botToken,
      authorization: `Bearer ${owner.token}`,
    };
    const session = await api(
      'widget/v2/create-session',
      owner.headers,
      'POST',
      { customData: { external_id: `local-${owner.name.toLowerCase()}` } },
      201,
    );
    owner.sessionId = session.id;
    await api(
      'widget/v2/chat/send',
      owner.headers,
      'POST',
      {
        bot_token: owner.botToken,
        session_id: session.id,
        uuid: crypto.randomUUID(),
        content: `PRIVATE HISTORY ${owner.name}`,
      },
      201,
    );
  }
  await check(
    'real JWT renewal retains history; other contacts/orgs cannot read it',
    async () => {
      for (const owner of identities) {
        const path = `widget/v2/session/history/${owner.sessionId}`;
        const history = await api(path, owner.headers);
        assert.ok(
          JSON.stringify(history).includes(`PRIVATE HISTORY ${owner.name}`),
        );
        assert.deepEqual(
          await api(path, {
            ...owner.headers,
            authorization: `Bearer ${owner.renewed}`,
          }),
          history,
        );
        await api(
          path,
          { ...owner.headers, authorization: `Bearer ${owner.expired}` },
          'GET',
          undefined,
          401,
        );
        for (const visitor of identities.filter((i) => i !== owner)) {
          await api(path, visitor.headers, 'GET', undefined, 404);
          await api(
            `widget/v2/poll/${owner.sessionId}`,
            visitor.headers,
            'GET',
            undefined,
            404,
          );
          await api(
            `widget/v5/chat/${owner.sessionId}/messages`,
            visitor.headers,
            'GET',
            undefined,
            404,
          );
          await api(
            `widget/v5/chat/${owner.sessionId}/stop`,
            visitor.headers,
            'POST',
            undefined,
            404,
          );
        }
      }
      await api(
        'widget/v2/sessions?filters=%7B%7D',
        {
          ...identities[0].headers,
          authorization: identities[2].headers.authorization,
        },
        'GET',
        undefined,
        401,
      );
    },
  );
  if (process.env.WIDGET_LOCAL_IDENTITIES)
    await writeFile(
      process.env.WIDGET_LOCAL_IDENTITIES,
      JSON.stringify({ base: base.origin, identities }),
      { mode: 0o600 },
    );
  await writeFile(
    process.env.WIDGET_LOCAL_REPORT ?? '/tmp/widget-local-backend-results.json',
    JSON.stringify(
      {
        checks: results,
        passed: results.length,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    `PASS ${results.length} local backend checks (real HTTP + local database; no provider response assertions)\n`,
  );
} finally {
  await db.destroy();
  const { shutdownTelemetry } = await source('src/utils/telemetry.ts');
  await shutdownTelemetry();
}
// Backend imports may own idle queue/Redis clients. This CLI has completed all
// awaited assertions and database writes; terminate only this verifier process.
process.exit(0);
