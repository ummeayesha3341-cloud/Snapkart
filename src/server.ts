import "dotenv/config";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { requireAdmin, requireAuth, requireCustomer } from "./auth.js";
import { normalizeCategory } from "./categories.js";
import { paymentProvider } from "./payments.js";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3000);
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
const safeUser = (user: { id: string; email: string; name: string; role: string }) => ({ id: user.id, email: user.email, name: user.name, role: user.role });
const newReceiptToken = () => randomBytes(32).toString("base64url");
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
  if (product.stock < body.quantity + (current?.quantity ?? 0)) return reply.code(409).send({ error: "INSUFFICIENT_STOCK" });
  await db.cartItem.upsert({ where: { cartId_productId: { cartId: cart.id, productId: product.id } }, create: { cartId: cart.id, productId: product.id, quantity: body.quantity }, update: { quantity: { increment: body.quantity } } });
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
  return { ok: true };
});
app.delete("/cart/items/:id", { preHandler: requireCustomer }, async (request, reply) => {
  const { id } = idParam.parse(request.params);
  const result = await db.cartItem.deleteMany({ where: { id, cart: { userId: request.user.id } } });
  if (!result.count) return reply.code(404).send({ error: "CART_ITEM_NOT_FOUND" });
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
  const isTestPayment = provider.startsWith("mock_");
  const paymentMethod = provider === "cash_on_delivery" ? "Cash at hand-off"
    : provider === "mock_upi" ? "UPI app (test)"
    : provider === "mock_card" ? "Card (test)"
    : "Online payment";
  const paymentStatus = order.payment?.status === "SUCCEEDED"
    ? isTestPayment ? "Test payment successful — no money was charged" : "Paid"
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

app.get("/admin/summary", { preHandler: requireAdmin }, async () => {
  const [products, customers, orders, revenue] = await Promise.all([
    db.product.count({ where: { active: true } }), db.user.count({ where: { role: "CUSTOMER" } }),
    db.order.count(), db.payment.aggregate({ where: { status: "SUCCEEDED", provider: { notIn: ["mock", "mock_upi", "mock_card"] } }, _sum: { amountMinor: true } }),
  ]);
  return { products, customers, orders, revenueMinor: revenue._sum.amountMinor ?? 0 };
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
try {
  await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
