import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { requireAdmin, requireAuth, requireCustomer, requireGateOperator } from "./auth.js";
import { normalizeCategory } from "./categories.js";
import { paymentProvider } from "./payments.js";

const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.set-cookie"] } });
const port = Number(process.env.PORT ?? 3000);
const requestMetrics = new Map<string, { count: number; errors: number; sumSeconds: number; buckets: number[] }>();
const latencyBuckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
app.addHook("onResponse", async (request, reply) => {
  const route = request.routeOptions.url ?? "unmatched";
  if (route === "/metrics") return;
  const key = JSON.stringify([request.method, route, reply.statusCode]);
  const elapsed = reply.elapsedTime / 1000;
  const entry = requestMetrics.get(key) ?? { count: 0, errors: 0, sumSeconds: 0, buckets: latencyBuckets.map(() => 0) };
  entry.count += 1;
  if (reply.statusCode >= 500) entry.errors += 1;
  entry.sumSeconds += elapsed;
  latencyBuckets.forEach((bound, index) => { if (elapsed <= bound) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1; });
  requestMetrics.set(key, entry);
  if (reply.statusCode >= 500 || elapsed >= 1) request.log.warn({ statusCode: reply.statusCode, elapsedMs: Math.round(reply.elapsedTime), route }, "API request needs attention");
});
await app.register(helmet);
await app.register(cors, { origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",") });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  if (error instanceof z.ZodError) return reply.code(400).send({ error: "VALIDATION_ERROR", details: error.issues });
  const appError = error as Error & { statusCode?: number; code?: string };
  if (appError.statusCode && appError.code) return reply.code(appError.statusCode).send({ error: appError.code, message: appError.message });
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Unexpected server error" });
});

const idParam = z.object({ id: z.string().min(1) });
const isMockProvider = (provider: string) => provider === "mock" || provider.startsWith("mock_");
const isSettledForGate = (order: { status: string; payment: { status: string; provider: string } | null }) =>
  order.status === "PAID" && order.payment?.status === "SUCCEEDED" && (!isMockProvider(order.payment.provider) || (process.env.ALLOW_SIMULATED_GATE_PAYMENTS === "true" && process.env.NODE_ENV !== "production"));
const safeUser = (user: { id: string; email: string; name: string; role: string }) => ({ id: user.id, email: user.email, name: user.name, role: user.role });
const newReceiptToken = () => randomBytes(32).toString("base64url");
const recordDemand = async (productId: string, type: "SCAN" | "CART_ADD" | "CART_REMOVE" | "PURCHASE" | "RETURN" | "STOCKOUT_ATTEMPT", quantity = 1, client: { demandEvent: typeof db.demandEvent } = db) => {
  try { await client.demandEvent.create({ data: { productId, type, quantity } }); }
  catch (error) { app.log.warn({ err: error, productId, type }, "Could not record product demand event"); }
};
function dayBucket(date: Date, interval: "day" | "week" | "month") {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (interval === "week") day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  if (interval === "month") day.setUTCDate(1);
  return day.toISOString().slice(0, 10);
}
async function ensureReceiptToken(orderId: string) {
  const token = newReceiptToken();
  await db.order.updateMany({ where: { id: orderId, receiptToken: null }, data: { receiptToken: token } });
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { receiptToken: true } });
  return order.receiptToken!;
}
// Public catalog responses must not expose supplier, expiry, or internal timestamps.
const publicProduct = (product: {
  id: string; barcode: string; name: string; description: string | null;
  category: string | null; brand: string | null; priceMinor: number;
  currency: string; stock: number; active: boolean;
}) => ({
  id: product.id, barcode: product.barcode, name: product.name,
  description: product.description, category: product.category, brand: product.brand,
  priceMinor: product.priceMinor, currency: product.currency, stock: product.stock,
  active: product.active,
});
const cartView = (cart: any) => ({
  id: cart.id,
  items: cart.items.map((item: any) => ({
    id: item.id, productId: item.productId, barcode: item.product.barcode, name: item.product.name,
    unitPriceMinor: item.product.priceMinor, currency: item.product.currency,
    quantity: item.quantity, lineTotalMinor: item.product.priceMinor * item.quantity,
  })),
  subtotalMinor: cart.items.reduce((sum: number, item: any) => sum + item.product.priceMinor * item.quantity, 0),
});

app.get("/health", async () => ({ status: "ok" }));
app.get("/metrics", async (request, reply) => {
  const token = process.env.METRICS_TOKEN;
  if (!token || request.headers.authorization !== `Bearer ${token}`) return reply.code(404).send({ error: "NOT_FOUND" });
  reply.type("text/plain; version=0.0.4; charset=utf-8");
  const lines = ["# HELP snapkart_http_requests_total Total HTTP requests by method, route, and status.", "# TYPE snapkart_http_requests_total counter", "# HELP snapkart_http_errors_total HTTP 5xx responses by method and route.", "# TYPE snapkart_http_errors_total counter", "# HELP snapkart_http_request_duration_seconds Request latency in seconds.", "# TYPE snapkart_http_request_duration_seconds histogram"];
  for (const [key, value] of requestMetrics) {
    const [method, route, status] = JSON.parse(key) as [string, string, number];
    const labels = `method=${JSON.stringify(method)},route=${JSON.stringify(route)}`;
    lines.push(`snapkart_http_requests_total{${labels},status=${JSON.stringify(String(status))}} ${value.count}`);
    if (status >= 500) lines.push(`snapkart_http_errors_total{${labels}} ${value.errors}`);
    latencyBuckets.forEach((bound, index) => lines.push(`snapkart_http_request_duration_seconds_bucket{${labels},le=${JSON.stringify(String(bound))}} ${value.buckets[index]}`));
    lines.push(`snapkart_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${value.count}`, `snapkart_http_request_duration_seconds_sum{${labels}} ${value.sumSeconds}`, `snapkart_http_request_duration_seconds_count{${labels}} ${value.count}`);
  }
  return `${lines.join("\n")}\n`;
});
app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
  const user = await db.user.findUnique({ where: { id: request.user.id } });
  if (!user) return reply.code(404).send({ error: "USER_NOT_FOUND" });
  return { user: safeUser(user) };
});

app.get("/products", async (request) => {
  const query = z.object({ q: z.string().trim().max(120).optional(), category: z.string().trim().min(1).max(120).optional(), barcode: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
  const filters: Prisma.ProductWhereInput[] = [];
  if (query.q) filters.push({ name: { contains: query.q, mode: "insensitive" } });
  if (query.category) {
    // Resolve against the category values actually present in the catalog. This
    // supports case, spacing, underscore, hyphen, singular/plural and aisle aliases
    // without loading or hardcoding category-specific product lists.
    const storedCategories = await db.product.findMany({
      where: { active: true, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    });
    const wanted = normalizeCategory(query.category);
    const matches = [...new Set(storedCategories
      .map(({ category }) => category)
      .filter((category): category is string => category !== null)
      .filter((category) => normalizeCategory(category) === wanted))];
    filters.push({ category: { in: matches } });
  }
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(query.barcode ? { barcode: query.barcode } : {}),
    ...(filters.length ? { AND: filters } : {}),
  };
  const [items, total] = await Promise.all([db.product.findMany({ where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.limit, take: query.limit }), db.product.count({ where })]);
  return { items: items.map(publicProduct), page: query.page, limit: query.limit, total };
});
app.get("/products/barcode/:barcode", async (request, reply) => {
  const { barcode } = z.object({ barcode: z.string().min(1).max(80) }).parse(request.params);
  const product = await db.product.findFirst({ where: { barcode, active: true } });
  if (!product) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
  await recordDemand(product.id, "SCAN");
  if (product.stock === 0) await recordDemand(product.id, "STOCKOUT_ATTEMPT");
  return { product: publicProduct(product) };
});

app.get("/cart", { preHandler: requireCustomer }, async (request, reply) => {
  const cart = await db.cart.findUnique({ where: { userId: request.user.id }, include: { items: { include: { product: true }, orderBy: { id: "asc" } } } });
  if (!cart) return reply.code(404).send({ error: "CART_NOT_FOUND" });
  return cartView(cart);
});
app.post("/cart/items", { preHandler: requireCustomer }, async (request, reply) => {
  const body = z.object({ barcode: z.string().min(1).max(80), quantity: z.number().int().min(1).max(99).default(1) }).parse(request.body);
  const product = await db.product.findFirst({ where: { barcode: body.barcode, active: true } });
  if (!product) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
  const cart = await db.cart.upsert({ where: { userId: request.user.id }, create: { userId: request.user.id }, update: {} });
  const current = await db.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: product.id } } });
  if (product.stock < body.quantity + (current?.quantity ?? 0)) {
    await recordDemand(product.id, "STOCKOUT_ATTEMPT", body.quantity);
    return reply.code(409).send({ error: "INSUFFICIENT_STOCK" });
  }
  await db.cartItem.upsert({ where: { cartId_productId: { cartId: cart.id, productId: product.id } }, create: { cartId: cart.id, productId: product.id, quantity: body.quantity }, update: { quantity: { increment: body.quantity } } });
  await recordDemand(product.id, "CART_ADD", body.quantity);
  const fresh = await db.cart.findUniqueOrThrow({ where: { id: cart.id }, include: { items: { include: { product: true } } } });
  return reply.code(200).send(cartView(fresh));
});
app.patch("/cart/items/:id", { preHandler: requireCustomer }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const { quantity } = z.object({ quantity: z.number().int().min(1).max(99) }).parse(request.body);
  const item = await db.cartItem.findFirst({ where: { id, cart: { userId: request.user.id } }, include: { product: true } });
  if (!item) return reply.code(404).send({ error: "CART_ITEM_NOT_FOUND" });
  if (quantity > item.product.stock) return reply.code(409).send({ error: "INSUFFICIENT_STOCK" });
  await db.cartItem.update({ where: { id }, data: { quantity } });
  if (quantity > item.quantity) await recordDemand(item.productId, "CART_ADD", quantity - item.quantity);
  else if (quantity < item.quantity) await recordDemand(item.productId, "CART_REMOVE", item.quantity - quantity);
  return { ok: true };
});
app.delete("/cart/items/:id", { preHandler: requireCustomer }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const item = await db.cartItem.findFirst({ where: { id, cart: { userId: request.user.id } } });
  if (!item) return reply.code(404).send({ error: "CART_ITEM_NOT_FOUND" });
  await db.cartItem.delete({ where: { id } });
  await recordDemand(item.productId, "CART_REMOVE", item.quantity);
  return reply.code(204).send();
});

app.post("/checkout", { preHandler: requireCustomer }, async (request, reply) => {
  const body = z.object({
    paymentMethod: z.enum(["CASH", "UPI", "CARD"]).default("CASH"),
    upiApp: z.enum(["PHONEPE", "GOOGLE_PAY", "PAYTM"]).optional(),
  }).parse(request.body ?? {});
  const simulatedOnlinePayment = body.paymentMethod !== "CASH";
  if (simulatedOnlinePayment && process.env.PAYMENT_PROVIDER !== "mock") {
    return reply.code(503).send({ error: "ONLINE_PAYMENTS_NOT_CONFIGURED", message: "Online payments are unavailable until a payment gateway is configured." });
  }
  const key = request.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8 || key.length > 128) return reply.code(400).send({ error: "IDEMPOTENCY_KEY_REQUIRED" });
  const existing = await db.order.findUnique({ where: { userId_idempotencyKey: { userId: request.user.id, idempotencyKey: key } }, include: { items: true, payment: true } });
  if (existing) {
    if (!existing.receiptToken) existing.receiptToken = await ensureReceiptToken(existing.id);
    return { order: existing, simulated: existing.payment?.provider.startsWith("mock_") ?? false };
  }
  const order = await db.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { userId: request.user.id }, include: { items: { include: { product: true } } } });
    if (!cart?.items.length) throw Object.assign(new Error("Cart is empty"), { statusCode: 400, code: "EMPTY_CART" });
    if (cart.items.some((item) => item.product.currency !== cart.items[0]!.product.currency)) throw Object.assign(new Error("Cart products must use the same currency"), { statusCode: 409, code: "MIXED_CURRENCIES" });
    for (const item of cart.items) {
      const changed = await tx.product.updateMany({ where: { id: item.productId, active: true, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } });
      if (changed.count !== 1) throw Object.assign(new Error(`Insufficient stock for ${item.product.name}`), { statusCode: 409, code: "INSUFFICIENT_STOCK" });
    }
    const subtotalMinor = cart.items.reduce((sum, item) => sum + item.product.priceMinor * item.quantity, 0);
    const created = await tx.order.create({ data: {
      userId: request.user.id, idempotencyKey: key, subtotalMinor, receiptToken: newReceiptToken(),
      currency: cart.items[0]!.product.currency,
      items: { create: cart.items.map(({ product, quantity }) => ({ productId: product.id, barcode: product.barcode, productName: product.name, unitPriceMinor: product.priceMinor, quantity })) },
    }, include: { items: true } });
    let provider = "cash_on_delivery";
    let paymentStatus: "PENDING" | "SUCCEEDED" = "PENDING";
    let providerReference: string | undefined;
    if (simulatedOnlinePayment) {
      // This is a local mock adapter only: it accepts no card or UPI credentials and moves no money.
      const result = await paymentProvider.charge({ orderId: created.id, amountMinor: subtotalMinor, currency: created.currency });
      provider = body.paymentMethod === "UPI" ? "mock_upi" : "mock_card";
      paymentStatus = result.succeeded ? "SUCCEEDED" : "PENDING";
      providerReference = `${result.reference}_${body.upiApp ?? "card"}`;
      if (result.succeeded) await tx.order.update({ where: { id: created.id }, data: { status: "PAID" } });
    }
    await tx.payment.create({ data: {
      orderId: created.id, provider, status: paymentStatus, providerReference,
      amountMinor: subtotalMinor, currency: created.currency,
    } });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.demandEvent.createMany({ data: cart.items.map((item) => ({ productId: item.productId, type: "PURCHASE" as const, quantity: item.quantity })) });
    return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: { items: true, payment: true } });
  }, { isolationLevel: "Serializable" });
  return reply.code(201).send({
    order,
    simulated: simulatedOnlinePayment,
    message: simulatedOnlinePayment
      ? "Simulated payment succeeded. No money was charged."
      : "Order placed. Cash is due when the order is handed over.",
  });
});
app.get("/orders", { preHandler: requireCustomer }, async (request) => {
  const orders = await db.order.findMany({ where: { userId: request.user.id }, include: { items: true, payment: true }, orderBy: { createdAt: "desc" } });
  return { items: orders };
});
app.get("/orders/:id", { preHandler: requireCustomer }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  let order = await db.order.findFirst({ where: { id, userId: request.user.id }, include: { items: true, payment: true } });
  if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
  if (!order.receiptToken) {
    await ensureReceiptToken(order.id);
    order = await db.order.findFirstOrThrow({ where: { id, userId: request.user.id }, include: { items: true, payment: true } });
  }
  return { order };
});
app.post("/orders/:id/returns", { preHandler: requireCustomer }, async (request, reply) => {
  const { id: orderId } = idParam.parse(request.params);
  const body = z.object({
    reason: z.string().trim().min(3).max(500),
    unusedAttested: z.literal(true),
    items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  }).parse(request.body);
  if (new Set(body.items.map((item) => item.orderItemId)).size !== body.items.length) return reply.code(400).send({ error: "DUPLICATE_RETURN_ITEM" });
  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, userId: request.user.id }, include: { payment: true, items: true } });
    if (!order) return { kind: "missing" as const };
    if (order.status !== "PAID" || order.payment?.status !== "SUCCEEDED") return { kind: "not_paid" as const };
    if (order.payment.provider !== "cash_on_delivery" && !isMockProvider(order.payment.provider)) return { kind: "refund_unavailable" as const };
    const age = Date.now() - order.createdAt.getTime();
    if (age < 0 || age > 30 * 24 * 60 * 60 * 1000) return { kind: "expired" as const };
    const byId = new Map(order.items.map((item) => [item.id, item]));
    const ids = body.items.map((item) => item.orderItemId);
    const existing = await tx.returnItem.findMany({ where: { orderItemId: { in: ids }, returnRequest: { is: { status: { not: "REJECTED" } } } } });
    for (const requested of body.items) {
      const orderItem = byId.get(requested.orderItemId);
      if (!orderItem) return { kind: "invalid_item" as const };
      const alreadyRequested = existing.filter((item) => item.orderItemId === requested.orderItemId).reduce((sum, item) => sum + item.quantity, 0);
      if (alreadyRequested + requested.quantity > orderItem.quantity) return { kind: "quantity" as const };
    }
    const created = await tx.returnRequest.create({
      data: {
        orderId, customerUserId: request.user.id, reason: body.reason, unusedAttested: true,
        items: { create: body.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity, unitPriceMinor: byId.get(item.orderItemId)!.unitPriceMinor })) },
        auditEvents: { create: { actorUserId: request.user.id, action: "REQUESTED", note: body.reason } },
      },
      include: { items: { include: { orderItem: true } }, auditEvents: true },
    });
    return { kind: "created" as const, request: created };
  }, { isolationLevel: "Serializable" });
  if (result.kind === "missing") return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
  if (result.kind === "not_paid") return reply.code(409).send({ error: "ORDER_NOT_RETURNABLE", message: "Returns can be requested only for paid orders." });
  if (result.kind === "refund_unavailable") return reply.code(503).send({ error: "REAL_REFUNDS_NOT_CONFIGURED", message: "Return requests for online payments are unavailable until a verified refund integration is configured." });
  if (result.kind === "expired") return reply.code(409).send({ error: "RETURN_WINDOW_CLOSED", message: "Returns must be requested within 30 days of purchase." });
  if (result.kind === "invalid_item") return reply.code(400).send({ error: "INVALID_RETURN_ITEM" });
  if (result.kind === "quantity") return reply.code(409).send({ error: "RETURN_QUANTITY_EXCEEDED" });
  return reply.code(201).send({ returnRequest: result.request });
});
app.get("/orders/:id/returns", { preHandler: requireCustomer }, async (request, reply) => {
  const { id: orderId } = idParam.parse(request.params);
  const order = await db.order.findFirst({ where: { id: orderId, userId: request.user.id }, select: { id: true } });
  if (!order) return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
  const items = await db.returnRequest.findMany({ where: { orderId, customerUserId: request.user.id }, include: { items: { include: { orderItem: true } }, auditEvents: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
  return { items };
});
app.get("/receipts/:token", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
  const { token } = z.object({ token: z.string().length(43).regex(/^[A-Za-z0-9_-]+$/) }).parse(request.params);
  const order = await db.order.findUnique({
    where: { receiptToken: token },
    select: {
      id: true, createdAt: true, subtotalMinor: true, currency: true,
      items: { select: { productName: true, unitPriceMinor: true, quantity: true } },
      payment: { select: { provider: true, status: true } },
    },
  });
  if (!order) return reply.code(404).send({ error: "RECEIPT_NOT_FOUND" });
  const provider = order.payment?.provider ?? "unknown";
  const isTestPayment = isMockProvider(provider);
  const paymentMethod = provider === "cash_on_delivery" ? "Cash at hand-off"
    : provider === "mock_upi" ? "UPI app (test)"
    : provider === "mock_card" ? "Card (test)"
    : "Online payment";
  const paymentStatus = order.payment?.status === "SUCCEEDED"
    ? isTestPayment ? "Test payment successful — no money was charged" : "Paid"
    : order.payment?.status === "REFUNDED"
      ? isTestPayment ? "Simulated refund recorded — no money was moved" : "Refund recorded"
    : provider === "cash_on_delivery" ? "Cash due at hand-off" : "Payment pending";
  return {
    receipt: {
      receiptNumber: order.id.slice(-8).toUpperCase(),
      createdAt: order.createdAt,
      totalMinor: order.subtotalMinor,
      currency: order.currency,
      paymentMethod,
      paymentStatus,
      items: order.items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        lineTotalMinor: item.unitPriceMinor * item.quantity,
      })),
    },
  };
});

const receiptTokenParams = z.object({ token: z.string().length(43).regex(/^[A-Za-z0-9_-]+$/) });
const gateReceiptSelect = {
  id: true, status: true, createdAt: true, subtotalMinor: true, currency: true,
  payment: { select: { status: true, provider: true } },
  items: { select: { productName: true, barcode: true, quantity: true, unitPriceMinor: true } },
} as const;
app.get("/staff/gate/receipts/:token", { preHandler: requireGateOperator, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
  const { token } = receiptTokenParams.parse(request.params);
  const order = await db.order.findUnique({ where: { receiptToken: token }, select: { ...gateReceiptSelect, gateChecks: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, outcome: true, createdAt: true } } } });
  if (!order) return reply.code(404).send({ error: "RECEIPT_NOT_FOUND" });
  const paid = isSettledForGate(order);
  const lastCheck = order.gateChecks[0] ?? null;
  const previouslyCleared = await db.gateCheck.findFirst({ where: { orderId: order.id, outcome: "CLEARED" }, select: { createdAt: true } });
  return { receipt: {
    receiptNumber: order.id.slice(-8).toUpperCase(), createdAt: order.createdAt,
    totalMinor: order.subtotalMinor, currency: order.currency,
    paymentStatus: order.payment && isMockProvider(order.payment.provider) ? "SIMULATED — NO MONEY CHARGED" : order.payment?.status ?? "MISSING",
    gateState: previouslyCleared ? "ALREADY_CLEARED" : lastCheck && ["FLAGGED", "DENIED"].includes(lastCheck.outcome) ? "SUPERVISOR_REVIEW" : paid ? "READY_TO_CHECK" : "PAYMENT_REQUIRED",
    previouslyClearedAt: previouslyCleared?.createdAt ?? null,
    items: order.items.map(item => ({ name: item.productName, barcode: item.barcode, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, lineTotalMinor: item.quantity * item.unitPriceMinor })),
  } };
});
app.post("/staff/gate/receipts/:token/checks", { preHandler: requireGateOperator, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
  const { token } = receiptTokenParams.parse(request.params);
  const body = z.object({ outcome: z.enum(["CLEARED", "FLAGGED"]), note: z.string().trim().max(500).optional() }).superRefine((value, context) => {
    if (value.outcome === "FLAGGED" && !value.note) context.addIssue({ code: "custom", path: ["note"], message: "Add a short note describing the mismatch" });
  }).parse(request.body);
  const order = await db.order.findUnique({ where: { receiptToken: token }, select: { id: true, status: true, payment: { select: { status: true, provider: true } } } });
  if (!order) return reply.code(404).send({ error: "RECEIPT_NOT_FOUND" });
  if (!isSettledForGate(order)) {
    const check = await db.gateCheck.create({ data: { orderId: order.id, staffUserId: request.user.id, outcome: "DENIED", note: "Exit denied: payment is unsettled or simulated" } });
    return reply.code(409).send({ error: "PAYMENT_NOT_SETTLED", check: { outcome: check.outcome, createdAt: check.createdAt } });
  }
  const existing = await db.gateCheck.findFirst({ where: { orderId: order.id, outcome: "CLEARED" }, select: { id: true, createdAt: true } });
  if (existing) {
    const check = await db.gateCheck.create({ data: { orderId: order.id, staffUserId: request.user.id, outcome: "DUPLICATE", note: "Receipt was already cleared" } });
    return reply.code(409).send({ error: "RECEIPT_ALREADY_CLEARED", check: { outcome: check.outcome, createdAt: check.createdAt }, previouslyClearedAt: existing.createdAt });
  }
  if (body.outcome === "CLEARED") {
    const latest = await db.gateCheck.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" }, select: { outcome: true } });
    if (latest && ["FLAGGED", "DENIED"].includes(latest.outcome)) return reply.code(409).send({ error: "GATE_REVIEW_REQUIRED" });
  }
  try {
    const check = await db.gateCheck.create({ data: { orderId: order.id, staffUserId: request.user.id, outcome: body.outcome, note: body.note } });
    return reply.code(201).send({ check: { outcome: check.outcome, createdAt: check.createdAt } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && body.outcome === "CLEARED") return reply.code(409).send({ error: "RECEIPT_ALREADY_CLEARED" });
    throw error;
  }
});

app.get("/admin/analytics/sales", { preHandler: requireAdmin }, async (request, reply) => {
  const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), interval: z.enum(["day", "week", "month"]).default("day") }).parse(request.query);
  const start = query.from ? new Date(Date.UTC(query.from.getUTCFullYear(), query.from.getUTCMonth(), query.from.getUTCDate())) : new Date(Date.now() - 29 * 86400000);
  const endInclusive = query.to ?? new Date();
  const endExclusive = new Date(Date.UTC(endInclusive.getUTCFullYear(), endInclusive.getUTCMonth(), endInclusive.getUTCDate() + 1));
  if (start >= endExclusive || endExclusive.getTime() - start.getTime() > 367 * 86400000) return reply.code(400).send({ error: "INVALID_DATE_RANGE", message: "Choose a valid range of up to 366 days." });
  const orders = await db.order.findMany({
    where: { status: "PAID", createdAt: { gte: start, lt: endExclusive } },
    include: { payment: true, items: true, returnRequests: { where: { status: "COMPLETED" }, select: { refundAmountMinor: true } } },
  });
  const buckets = new Map<string, { date: string; currency: string; orders: number; grossPaidMinor: number; refundMinor: number; netSalesMinor: number; simulatedGrossMinor: number; simulatedRefundMinor: number }>();
  for (const order of orders) {
    if (!order.payment || !["SUCCEEDED", "REFUNDED"].includes(order.payment.status)) continue;
    const date = dayBucket(order.createdAt, query.interval);
    const key = `${date}:${order.currency}`;
    const bucket = buckets.get(key) ?? { date, currency: order.currency, orders: 0, grossPaidMinor: 0, refundMinor: 0, netSalesMinor: 0, simulatedGrossMinor: 0, simulatedRefundMinor: 0 };
    const gross = order.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
    const refunds = order.returnRequests.reduce((sum, item) => sum + item.refundAmountMinor, 0);
    bucket.orders += 1;
    if (isMockProvider(order.payment.provider)) {
      bucket.simulatedGrossMinor += gross;
      bucket.simulatedRefundMinor += refunds;
    } else {
      bucket.grossPaidMinor += gross;
      bucket.refundMinor += refunds;
      bucket.netSalesMinor += gross - refunds;
    }
    buckets.set(key, bucket);
  }
  return { from: start.toISOString().slice(0, 10), to: new Date(endExclusive.getTime() - 86400000).toISOString().slice(0, 10), interval: query.interval, items: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)) };
});
app.get("/admin/analytics/demand", { preHandler: requireAdmin }, async (request, reply) => {
  const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
  const end = query.to ?? new Date();
  const start = query.from ?? new Date(end.getTime() - 29 * 86400000);
  if (start >= end || end.getTime() - start.getTime() > 367 * 86400000) return reply.code(400).send({ error: "INVALID_DATE_RANGE", message: "Choose a valid range of up to 366 days." });
  const groupedEvents = await db.demandEvent.groupBy({ by: ["productId", "type"], where: { createdAt: { gte: start, lte: end } }, _sum: { quantity: true } });
  const productIds = [...new Set(groupedEvents.map((event) => event.productId))];
  const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, barcode: true, stock: true, active: true } });
  const byProduct = new Map(products.map((product) => [product.id, { product, scans: 0, cartAdds: 0, cartRemovals: 0, purchasedUnits: 0, returnedUnits: 0, stockoutAttempts: 0 }]));
  for (const event of groupedEvents) {
    const row = byProduct.get(event.productId);
    if (!row) continue;
    const amount = event._sum.quantity ?? 0;
    if (event.type === "SCAN") row.scans = amount;
    if (event.type === "CART_ADD") row.cartAdds = amount;
    if (event.type === "CART_REMOVE") row.cartRemovals = amount;
    if (event.type === "PURCHASE") row.purchasedUnits = amount;
    if (event.type === "RETURN") row.returnedUnits = amount;
    if (event.type === "STOCKOUT_ATTEMPT") row.stockoutAttempts = amount;
  }
  const items = [...byProduct.values()].sort((a, b) => b.purchasedUnits - a.purchasedUnits || b.cartAdds - a.cartAdds || b.scans - a.scans).slice(0, query.limit);
  return { from: start.toISOString(), to: end.toISOString(), items };
});

app.get("/admin/returns", { preHandler: requireAdmin }, async (request) => {
  const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"]).optional() }).parse(request.query);
  const where = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    db.returnRequest.findMany({ where, include: { order: { select: { id: true, createdAt: true, currency: true, payment: true } }, customer: { select: { id: true, email: true, name: true } }, items: { include: { orderItem: true } }, auditEvents: { include: { actor: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
    db.returnRequest.count({ where }),
  ]);
  return { items, total, page: query.page, limit: query.limit };
});
app.post("/admin/returns/:id/review", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional() }).parse(request.body);
  const current = await db.returnRequest.findUnique({ where: { id }, select: { status: true } });
  if (!current) return reply.code(404).send({ error: "RETURN_NOT_FOUND" });
  if (current.status !== "REQUESTED") return reply.code(409).send({ error: "RETURN_ALREADY_REVIEWED" });
  const status = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const updated = await db.$transaction(async (tx) => {
    const changed = await tx.returnRequest.updateMany({ where: { id, status: "REQUESTED" }, data: { status, reviewerAdminId: request.user.id, adminNote: body.note } });
    if (!changed.count) return null;
    await tx.returnAuditEvent.create({ data: { returnRequestId: id, actorUserId: request.user.id, action: status, note: body.note } });
    return tx.returnRequest.findUniqueOrThrow({ where: { id }, include: { items: true, auditEvents: { orderBy: { createdAt: "asc" } } } });
  });
  if (!updated) return reply.code(409).send({ error: "RETURN_ALREADY_REVIEWED" });
  return { returnRequest: updated };
});
app.post("/admin/returns/:id/complete", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const body = z.object({ disposition: z.enum(["RESTOCK", "QUARANTINE", "DISCARD"]), cashRefundConfirmed: z.boolean().default(false), note: z.string().trim().max(500).optional() }).parse(request.body);
  const current = await db.returnRequest.findUnique({ where: { id }, include: { order: { include: { payment: true } }, items: { include: { orderItem: true } } } });
  if (!current) return reply.code(404).send({ error: "RETURN_NOT_FOUND" });
  if (current.status !== "APPROVED") return reply.code(409).send({ error: "RETURN_NOT_APPROVED" });
  const provider = current.order.payment?.provider ?? "";
  if (provider === "cash_on_delivery" && !body.cashRefundConfirmed) return reply.code(400).send({ error: "CASH_REFUND_CONFIRMATION_REQUIRED" });
  if (provider !== "cash_on_delivery" && !isMockProvider(provider)) return reply.code(503).send({ error: "REAL_REFUNDS_NOT_CONFIGURED", message: "A verified refund integration is required before online refunds can be completed." });
  const refundAmountMinor = current.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
  const refundStatus = provider === "cash_on_delivery" ? "CASH_PAID_OUT" : "SIMULATED";
  const result = await db.$transaction(async (tx) => {
    const changed = await tx.returnRequest.updateMany({ where: { id, status: "APPROVED" }, data: { status: "COMPLETED", reviewerAdminId: request.user.id, adminNote: body.note, disposition: body.disposition, refundStatus, refundAmountMinor } });
    if (!changed.count) return false;
    for (const item of current.items) {
      if (body.disposition === "RESTOCK") {
        const product = await tx.product.update({ where: { id: item.orderItem.productId }, data: { stock: { increment: item.quantity } } });
        await tx.inventoryAdjustment.create({ data: { productId: product.id, adminUserId: request.user.id, delta: item.quantity, resultingStock: product.stock, reason: `Return ${id.slice(-8)} restocked` } });
      }
      await tx.demandEvent.create({ data: { productId: item.orderItem.productId, type: "RETURN", quantity: item.quantity } });
    }
    await tx.returnAuditEvent.create({ data: { returnRequestId: id, actorUserId: request.user.id, action: "COMPLETED", note: body.note ?? `${body.disposition}; refund ${refundStatus}` } });
    const completed = await tx.returnRequest.findMany({ where: { orderId: current.orderId, status: "COMPLETED" }, select: { refundAmountMinor: true } });
    const refunded = completed.reduce((sum, item) => sum + item.refundAmountMinor, 0);
    if (current.order.payment && refunded >= current.order.payment.amountMinor) await tx.payment.update({ where: { orderId: current.orderId }, data: { status: "REFUNDED" } });
    return true;
  }, { isolationLevel: "Serializable" });
  if (!result) return reply.code(409).send({ error: "RETURN_NOT_APPROVED" });
  return { ok: true, refundStatus, refundAmountMinor, disposition: body.disposition, message: refundStatus === "SIMULATED" ? "Return completed. The recorded refund is simulated; no money was moved." : "Return completed and cash refund was recorded as paid out." };
});

app.get("/admin/staff-access", { preHandler: requireAdmin }, async () => {
  const staff = await db.user.findMany({ where: { role: "STAFF" }, select: { id: true, email: true, name: true, createdAt: true }, orderBy: { email: "asc" } });
  return { staff };
});
app.post("/admin/staff-access", { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({ email: z.string().trim().email().max(320) }).parse(request.body);
  const user = await db.user.findUnique({ where: { email: body.email.toLowerCase() }, select: { id: true, email: true, name: true, role: true } });
  if (!user) return reply.code(404).send({ error: "STAFF_ACCOUNT_NOT_FOUND", message: "Ask this person to create and verify a SnapKart account, then grant staff access." });
  if (user.role === "ADMIN") return reply.code(409).send({ error: "ADMIN_ROLE_PROTECTED" });
  if (user.role === "STAFF") return { staff: user, unchanged: true };
  const staff = await db.user.update({ where: { id: user.id }, data: { role: "STAFF" }, select: { id: true, email: true, name: true, role: true } });
  return reply.code(201).send({ staff });
});
app.delete("/admin/staff-access/:id", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const result = await db.user.updateMany({ where: { id, role: "STAFF" }, data: { role: "CUSTOMER" } });
  if (!result.count) return reply.code(404).send({ error: "STAFF_ACCOUNT_NOT_FOUND" });
  return { ok: true };
});
app.get("/admin/gate-checks", { preHandler: requireAdmin }, async () => {
  const checks = await db.gateCheck.findMany({ where: { outcome: { in: ["FLAGGED", "DENIED", "DUPLICATE"] } }, include: { order: { select: { id: true, createdAt: true } }, staff: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  const latest = await Promise.all(checks.map(check => db.gateCheck.findFirst({ where: { orderId: check.orderId }, orderBy: { createdAt: "desc" }, select: { id: true } })));
  return { checks: checks.filter((check, index) => latest[index]?.id === check.id).map(check => ({ id: check.id, receiptNumber: check.order.id.slice(-8).toUpperCase(), orderCreatedAt: check.order.createdAt, outcome: check.outcome, note: check.note, createdAt: check.createdAt, staff: check.staff })) };
});
app.post("/admin/gate-checks/:id/resolve", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const body = z.object({ note: z.string().trim().min(3).max(500) }).parse(request.body);
  const flagged = await db.gateCheck.findUnique({ where: { id }, include: { order: { select: { id: true, status: true, payment: { select: { status: true, provider: true } } } } } });
  if (!flagged || !["FLAGGED", "DENIED"].includes(flagged.outcome)) return reply.code(404).send({ error: "GATE_EXCEPTION_NOT_FOUND" });
  if (!isSettledForGate(flagged.order)) return reply.code(409).send({ error: "PAYMENT_NOT_SETTLED" });
  const latest = await db.gateCheck.findFirst({ where: { orderId: flagged.orderId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (latest?.id !== flagged.id) return reply.code(409).send({ error: "GATE_EXCEPTION_NOT_CURRENT" });
  try {
    const check = await db.gateCheck.create({ data: { orderId: flagged.orderId, staffUserId: request.user.id, outcome: "CLEARED", note: `Supervisor review: ${body.note}` } });
    return reply.code(201).send({ check: { outcome: check.outcome, createdAt: check.createdAt } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return reply.code(409).send({ error: "RECEIPT_ALREADY_CLEARED" });
    throw error;
  }
});

app.get("/admin/summary", { preHandler: requireAdmin }, async () => {
  const [products, customers, orders, revenuePayments, completedReturns] = await Promise.all([
    db.product.count({ where: { active: true } }), db.user.count({ where: { role: "CUSTOMER" } }),
    db.order.count(), db.payment.findMany({ where: { status: { in: ["SUCCEEDED", "REFUNDED"] }, provider: { notIn: ["mock", "mock_upi", "mock_card"] } }, select: { amountMinor: true } }),
    db.returnRequest.findMany({ where: { status: "COMPLETED", order: { payment: { is: { provider: { notIn: ["mock", "mock_upi", "mock_card"] } } } } }, select: { refundAmountMinor: true } }),
  ]);
  const paid = revenuePayments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const refunded = completedReturns.reduce((sum, item) => sum + item.refundAmountMinor, 0);
  return { products, customers, orders, revenueMinor: Math.max(0, paid - refunded) };
});
app.get("/admin/inventory", { preHandler: requireAdmin }, async (request) => {
  const query = z.object({ q: z.string().trim().max(120).optional(), lowStockAt: z.coerce.number().int().min(0).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
  const where = { ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" as const } }, { barcode: { contains: query.q } }] } : {}), ...(query.lowStockAt === undefined ? {} : { stock: { lte: query.lowStockAt } }) };
  const [items, total] = await Promise.all([db.product.findMany({ where, orderBy: [{ stock: "asc" }, { name: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }), db.product.count({ where })]);
  return { items, total, page: query.page, limit: query.limit };
});
app.post("/admin/products", { preHandler: requireAdmin }, async (request, reply) => {
  const body = z.object({ barcode: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), category: z.string().max(120).optional(), brand: z.string().max(120).optional(), supplier: z.string().max(160).optional(), priceMinor: z.number().int().positive(), currency: z.string().length(3).default("INR"), stock: z.number().int().min(0).default(0) }).parse(request.body);
  const product = await db.product.create({ data: body });
  return reply.code(201).send({ product });
});
app.patch("/admin/products/:id", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const body = z.object({ barcode: z.string().trim().min(1).max(80).optional(), name: z.string().trim().min(1).max(200).optional(), description: z.string().max(2000).nullable().optional(), category: z.string().max(120).nullable().optional(), brand: z.string().max(120).nullable().optional(), supplier: z.string().max(160).nullable().optional(), priceMinor: z.number().int().positive().optional(), currency: z.string().length(3).optional(), active: z.boolean().optional() }).parse(request.body);
  const product = await db.product.update({ where: { id }, data: body });
  return { product };
});
app.post("/admin/products/:id/inventory-adjustments", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const body = z.object({ delta: z.number().int().refine((value) => value !== 0), reason: z.string().trim().min(3).max(300) }).parse(request.body);
  const adjustment = await db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) return null;
    const resultingStock = product.stock + body.delta;
    if (resultingStock < 0) throw Object.assign(new Error("Inventory cannot be negative"), { statusCode: 409, code: "NEGATIVE_STOCK" });
    await tx.product.update({ where: { id }, data: { stock: resultingStock } });
    return tx.inventoryAdjustment.create({ data: { productId: id, adminUserId: request.user.id, delta: body.delta, resultingStock, reason: body.reason } });
  });
  if (!adjustment) return reply.code(404).send({ error: "PRODUCT_NOT_FOUND" });
  return reply.code(201).send({ adjustment });
});
app.get("/admin/orders", { preHandler: requireAdmin }, async (request) => {
  const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(["PENDING_PAYMENT", "PAID", "PAYMENT_FAILED", "CANCELLED"]).optional() }).parse(request.query);
  const where = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([db.order.findMany({ where, include: { user: { select: { id: true, email: true, name: true } }, items: true, payment: true }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }), db.order.count({ where })]);
  return { items, total, page: query.page, limit: query.limit };
});
app.post("/admin/orders/:id/collect-cash", { preHandler: requireAdmin }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { payment: true } });
    if (!order) return { kind: "missing" as const };
    if (order.payment?.provider !== "cash_on_delivery") return { kind: "not_cash" as const };
    if (order.payment.status === "SUCCEEDED" && order.status === "PAID") return { kind: "ok" as const };
    if (order.payment.status !== "PENDING" || order.status !== "PENDING_PAYMENT") return { kind: "not_pending" as const };
    await tx.payment.update({ where: { orderId: id }, data: { status: "SUCCEEDED", providerReference: `cash_${id}` } });
    await tx.order.update({ where: { id }, data: { status: "PAID" } });
    return { kind: "ok" as const };
  });
  if (result.kind === "missing") return reply.code(404).send({ error: "ORDER_NOT_FOUND" });
  if (result.kind === "not_cash") return reply.code(409).send({ error: "NOT_CASH_ON_DELIVERY" });
  if (result.kind === "not_pending") return reply.code(409).send({ error: "ORDER_NOT_PENDING" });
  return { ok: true };
});

app.addHook("onClose", async () => db.$disconnect());
export { app };
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
