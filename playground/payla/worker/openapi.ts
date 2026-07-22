// OpenAPI 3.1 description of the Payla API.
// Served live at GET /openapi.json with the deployment's own origin as the server URL,
// so it can be imported into OpenCX (Dashboard → Agents → Actions → Import from OpenAPI)
// to turn each endpoint into an agent action/tool. operationIds are the action names,
// and every summary/description is written for an LLM to decide when to call it.

const money = {
  type: "object",
  properties: {
    value: { type: "string", description: "Decimal amount as a string, e.g. \"35.50\"." },
    currency: { type: "string", example: "EUR" },
  },
  required: ["value", "currency"],
} as const;

const payment = {
  type: "object",
  properties: {
    id: { type: "string", example: "tr_0020260000" },
    status: {
      type: "string",
      enum: [
        "open", "pending", "authorized", "paid", "failed",
        "canceled", "expired", "refunded", "partially_refunded", "charged_back",
      ],
    },
    amount: { $ref: "#/components/schemas/Money" },
    amountRefunded: { $ref: "#/components/schemas/Money" },
    method: { type: ["string", "null"], example: "ideal" },
    description: { type: "string" },
    customerId: { type: ["string", "null"] },
    customerName: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    paidAt: { type: ["string", "null"], format: "date-time" },
    settlementId: { type: ["string", "null"] },
  },
} as const;

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: { type: { type: "string" }, message: { type: "string" } },
    },
  },
} as const;

const listResponse = (ref: string) => ({
  type: "object",
  properties: {
    data: { type: "array", items: { $ref: ref } },
    meta: {
      type: "object",
      properties: { count: { type: "integer" }, total: { type: "integer" } },
    },
  },
});

const limitParam = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 250, default: 50 },
  description: "Max rows to return (1–250).",
};

export function buildOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Payla API",
      version: "1.0.0",
      description:
        "Merchant dashboard API for the Payla payments platform. Read balances, payments, " +
        "customers, settlements and disputes, and take actions like issuing refunds or creating " +
        "payment links. Use these actions to help a merchant resolve support questions with real data.",
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Required only for write actions when the deployment sets PAYLA_API_KEY.",
        },
      },
      schemas: {
        Money: money,
        Payment: payment,
        Error: errorSchema,
        Balance: {
          type: "object",
          properties: {
            available: { $ref: "#/components/schemas/Money" },
            pending: { $ref: "#/components/schemas/Money" },
            currency: { type: "string" },
          },
        },
        Customer: {
          type: "object",
          properties: {
            id: { type: "string", example: "cst_004100" },
            name: { type: "string" },
            email: { type: "string" },
            locale: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            paymentsCount: { type: "integer" },
            totalSpent: { $ref: "#/components/schemas/Money" },
          },
        },
        Refund: {
          type: "object",
          properties: {
            id: { type: "string", example: "re_00030000" },
            paymentId: { type: "string" },
            amount: { $ref: "#/components/schemas/Money" },
            status: { type: "string", enum: ["queued", "pending", "processing", "refunded", "failed"] },
            reason: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        PaymentLink: {
          type: "object",
          properties: {
            id: { type: "string", example: "pl_00050000" },
            description: { type: "string" },
            amount: { $ref: "#/components/schemas/Money" },
            status: { type: "string", enum: ["active", "paid", "expired"] },
            url: { type: "string", format: "uri" },
            createdAt: { type: "string", format: "date-time" },
            paidAt: { type: ["string", "null"], format: "date-time" },
          },
        },
        Settlement: {
          type: "object",
          properties: {
            id: { type: "string", example: "stl_009000" },
            reference: { type: "string" },
            amount: { $ref: "#/components/schemas/Money" },
            status: { type: "string", enum: ["open", "pending", "paidout", "failed"] },
            createdAt: { type: "string", format: "date-time" },
            settledAt: { type: ["string", "null"], format: "date-time" },
            paymentsCount: { type: "integer" },
          },
        },
        Dispute: {
          type: "object",
          properties: {
            id: { type: "string", example: "chb_00070000" },
            paymentId: { type: "string" },
            amount: { $ref: "#/components/schemas/Money" },
            reason: {
              type: "string",
              enum: ["fraudulent", "product_not_received", "duplicate", "subscription_canceled", "general"],
            },
            status: { type: "string", enum: ["open", "under_review", "won", "lost", "expired"] },
            createdAt: { type: "string", format: "date-time" },
            dueAt: { type: ["string", "null"], format: "date-time" },
          },
        },
        Settings: {
          type: "object",
          properties: {
            merchantName: { type: "string" },
            merchantId: { type: "string" },
            email: { type: "string" },
            country: { type: "string" },
            payoutSchedule: { type: "string", enum: ["daily", "weekly", "monthly"] },
            statementDescriptor: { type: "string" },
            testMode: { type: "boolean" },
          },
        },
      },
    },
    paths: {
      "/api/balance": {
        get: {
          operationId: "get_balance",
          summary: "Get the merchant's current available and pending balance.",
          description: "Use when a merchant asks how much money they have, what's available to pay out, or what's still pending.",
          responses: { "200": { description: "Balance", content: { "application/json": { schema: { $ref: "#/components/schemas/Balance" } } } } },
        },
      },
      "/api/metrics": {
        get: {
          operationId: "get_business_metrics",
          summary: "Get 30-day revenue, payment count, success rate and method breakdown.",
          description: "Use for questions about sales performance, revenue trends, conversion/success rate, average order value, or which payment methods customers use.",
          responses: { "200": { description: "Metrics" } },
        },
      },
      "/api/payments": {
        get: {
          operationId: "list_payments",
          summary: "List recent payments, optionally filtered by status, method or customer.",
          description: "Use to find a customer's recent orders, review failed/expired payments, or list refunded ones. Filter by customer to answer 'where is my order' type questions.",
          parameters: [
            { name: "status", in: "query", required: false, schema: { $ref: "#/components/schemas/Payment/properties/status" }, description: "Filter by payment status." },
            { name: "method", in: "query", required: false, schema: { type: "string" }, description: "Filter by payment method (ideal, creditcard, paypal, ...)." },
            { name: "customer", in: "query", required: false, schema: { type: "string" }, description: "Filter by customer id (cst_...)." },
            limitParam,
          ],
          responses: { "200": { description: "Payments", content: { "application/json": { schema: listResponse("#/components/schemas/Payment") } } } },
        },
      },
      "/api/payments/{id}": {
        get: {
          operationId: "get_payment",
          summary: "Get one payment by id, including its refunds.",
          description: "Use when the merchant references a specific payment/order id (tr_...) and you need its status, amount, method and refund history.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Payment with refunds", content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/payments/{id}/refunds": {
        post: {
          operationId: "refund_payment",
          summary: "Refund a payment, fully or partially.",
          description: "Use to issue a refund for a paid payment. Omit amount for a full refund of the remaining balance; pass amount (in euros) for a partial refund. Only 'paid' or 'partially_refunded' payments can be refunded. This changes real data — confirm the amount and payment with the merchant first.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    amount: { type: "number", description: "Refund amount in major units (euros). Omit for a full refund." },
                    reason: { type: "string", maxLength: 200 },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Refund created + updated payment" },
            "422": { description: "Not refundable / invalid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/refunds": {
        get: {
          operationId: "list_refunds",
          summary: "List recent refunds across all payments.",
          parameters: [limitParam],
          responses: { "200": { description: "Refunds", content: { "application/json": { schema: listResponse("#/components/schemas/Refund") } } } },
        },
      },
      "/api/customers": {
        get: {
          operationId: "list_customers",
          summary: "List customers, ranked by total spend.",
          parameters: [limitParam],
          responses: { "200": { description: "Customers", content: { "application/json": { schema: listResponse("#/components/schemas/Customer") } } } },
        },
      },
      "/api/customers/{id}": {
        get: {
          operationId: "get_customer",
          summary: "Get one customer by id, including their recent payments.",
          description: "Use to look up a customer's profile, lifetime spend and recent orders.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Customer with payments", content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/payment-links": {
        get: {
          operationId: "list_payment_links",
          summary: "List payment links.",
          parameters: [limitParam],
          responses: { "200": { description: "Payment links", content: { "application/json": { schema: listResponse("#/components/schemas/PaymentLink") } } } },
        },
        post: {
          operationId: "create_payment_link",
          summary: "Create a shareable payment link for a given amount.",
          description: "Use when a merchant wants to charge a customer without an integration — e.g. an invoice, deposit or one-off charge. Returns a URL to share. This creates real data.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "description"],
                  properties: {
                    amount: { type: "number", description: "Amount in major units (euros), e.g. 49.99." },
                    description: { type: "string", maxLength: 200 },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created link", content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentLink" } } } } },
        },
      },
      "/api/settlements": {
        get: {
          operationId: "list_settlements",
          summary: "List settlements (payout batches) and their status.",
          description: "Use for payout questions: what's been paid out, what's pending, and the amounts per settlement.",
          parameters: [limitParam],
          responses: { "200": { description: "Settlements", content: { "application/json": { schema: listResponse("#/components/schemas/Settlement") } } } },
        },
      },
      "/api/settlements/{id}": {
        get: {
          operationId: "get_settlement",
          summary: "Get one settlement by id.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Settlement", content: { "application/json": { schema: { $ref: "#/components/schemas/Settlement" } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/disputes": {
        get: {
          operationId: "list_disputes",
          summary: "List chargebacks / disputes and their status.",
          description: "Use for questions about chargebacks, disputes, or amounts at risk and their response deadlines.",
          parameters: [limitParam],
          responses: { "200": { description: "Disputes", content: { "application/json": { schema: listResponse("#/components/schemas/Dispute") } } } },
        },
      },
      "/api/settings": {
        get: {
          operationId: "get_settings",
          summary: "Get the merchant's account settings (payout schedule, descriptor, test mode).",
          responses: { "200": { description: "Settings", content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } } } },
        },
      },
    },
  };
}
