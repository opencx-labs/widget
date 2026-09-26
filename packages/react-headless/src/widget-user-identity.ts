import { z } from 'zod';
import type { WidgetConfig } from '@opencx/widget-core';

const widgetTokenOwnerSchema = z.object({
  org_id: z.string(),
  contact: z.object({ id: z.string(), verified: z.boolean() }),
  mcp_access: z
    .object({
      server_ids: z.array(z.string()),
      account_id: z.string().optional(),
    })
    .optional(),
});

// JwtCodec on the backend wraps the contact claims in sub.payload. Keep
// accepting flat claims used by existing integrations, but recognize the
// actual authenticate-user token so expiry renewal preserves the conversation.
const widgetTokenClaimsSchema = z.union([
  z
    .object({
      sub: z.object({
        type: z.literal('widget-contact'),
        payload: widgetTokenOwnerSchema,
      }),
    })
    .transform(({ sub }) => sub.payload),
  widgetTokenOwnerSchema,
]);

const decodePayload = (token: string): unknown => {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(`${normalized}${padding}`), (value) =>
      value.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

/**
 * A local lifecycle fingerprint, never an authorization decision. Expiry and
 * signatures intentionally do not participate, so a newly minted token for
 * the same owner updates the transport without destroying session state.
 */
export const widgetUserIdentity = (config: WidgetConfig): string => {
  const user = config.user;
  const token = user?.token;
  if (!token) {
    return JSON.stringify({
      apiUrl: config.apiUrl ?? null,
      botToken: config.token,
      externalId: user?.externalId ?? null,
      verifiedOwner: null,
    });
  }

  const parsed = widgetTokenClaimsSchema.safeParse(decodePayload(token));
  if (!parsed.success) {
    // Opaque or malformed verified tokens cannot prove continuity. Including
    // the token makes renewal take the safe full-reset path.
    return JSON.stringify({
      apiUrl: config.apiUrl ?? null,
      botToken: config.token,
      externalId: user.externalId ?? null,
      opaqueToken: token,
    });
  }

  return JSON.stringify({
    apiUrl: config.apiUrl ?? null,
    botToken: config.token,
    externalId: user.externalId ?? null,
    verifiedOwner: {
      orgId: parsed.data.org_id,
      contactId: parsed.data.contact.id,
      verified: parsed.data.contact.verified,
      accountId: parsed.data.mcp_access?.account_id ?? null,
      serverIds: [...(parsed.data.mcp_access?.server_ids ?? [])].sort(),
    },
  });
};
