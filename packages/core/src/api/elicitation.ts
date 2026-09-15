import { z } from 'zod';
const option = z.object({ const: z.string(), title: z.string().optional() });
const field = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array']),
  title: z.string().optional(),
  description: z.string().optional(),
  default: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  enum: z.array(z.string()).optional(),
  oneOf: z.array(option).optional(),
  items: z
    .object({
      enum: z.array(z.string()).optional(),
      anyOf: z.array(option).optional(),
    })
    .optional(),
  minItems: z.number().int().nonnegative().optional(),
  maxItems: z.number().int().nonnegative().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  format: z.string().optional(),
});
export const elicitationListSchema = z.array(
  z.object({
    id: z.string(),
    serverId: z.string(),
    serverName: z.string(),
    expiresAt: z.number(),
    approvalKey: z.string().optional(),
    form: z.object({
      message: z.string(),
      requestedSchema: z.object({
        properties: z.record(z.string(), field),
        required: z.array(z.string()).optional(),
      }),
    }),
  }),
);
export type ElicitationRequest = z.infer<typeof elicitationListSchema>[number];
export type ElicitationResponse = {
  action: 'accept' | 'decline' | 'cancel';
  remember?: boolean;
  content?: Record<string, string | number | boolean | string[]>;
};

export const approvalPreferencesSchema = z.array(
  z.object({
    key: z.string(),
    serverId: z.string(),
    serverName: z.string(),
    message: z.string(),
    toolName: z.string(),
  }),
);
export type ApprovalPreference = z.infer<
  typeof approvalPreferencesSchema
>[number];
