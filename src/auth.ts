import { createClient, type SupabaseClient, type User as SupabaseUser } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { db } from "./db.js";

export type AuthUser = { id: string; email: string; role: "CUSTOMER" | "ADMIN" };
declare module "fastify" {
  interface FastifyRequest { user: AuthUser }
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  : null;

async function getOrCreateAppUser(identity: SupabaseUser) {
  const email = identity.email?.trim().toLowerCase();
  if (!email) throw Object.assign(new Error("A verified email address is required"), { statusCode: 403, code: "EMAIL_REQUIRED" });
  const verified = Boolean(identity.email_confirmed_at || identity.confirmed_at);

  let user = await db.user.findUnique({ where: { supabaseUserId: identity.id } });
  if (user) return user;

  // Link an existing SnapKart customer/admin only after Supabase confirms control of the email.
  const existingByEmail = await db.user.findUnique({ where: { email } });
  if (existingByEmail) {
    if (!verified) throw Object.assign(new Error("Verify your email address before linking this SnapKart account"), { statusCode: 403, code: "EMAIL_NOT_VERIFIED" });
    try {
      return await db.user.update({ where: { id: existingByEmail.id }, data: { supabaseUserId: identity.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const linked = await db.user.findUnique({ where: { supabaseUserId: identity.id } });
        if (linked) return linked;
      }
      throw error;
    }
  }

  if (!verified) throw Object.assign(new Error("Verify your email address before using SnapKart"), { statusCode: 403, code: "EMAIL_NOT_VERIFIED" });
  const name = String(identity.user_metadata?.full_name ?? identity.user_metadata?.name ?? email.split("@")[0]).trim().slice(0, 120) || "SnapKart customer";
  try {
    return await db.$transaction(async tx => {
      const created = await tx.user.create({ data: { supabaseUserId: identity.id, email, name } });
      await tx.cart.create({ data: { userId: created.id } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const linked = await db.user.findUnique({ where: { supabaseUserId: identity.id } });
      if (linked) return linked;
    }
    throw error;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!supabase) return reply.code(503).send({ error: "AUTH_NOT_CONFIGURED", message: "Supabase Auth is not configured on this backend" });
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return reply.code(401).send({ error: "UNAUTHORIZED", message: "Sign in to continue" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return reply.code(401).send({ error: "UNAUTHORIZED", message: "Your session is invalid or expired" });
  try {
    const user = await getOrCreateAppUser(data.user);
    request.user = { id: user.id, email: user.email, role: user.role };
  } catch (error) {
    const authError = error as Error & { statusCode?: number; code?: string };
    if (authError.statusCode && authError.code) return reply.code(authError.statusCode).send({ error: authError.code, message: authError.message });
    throw error;
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const authResult = await requireAuth(request, reply);
  if (authResult) return authResult;
  if (request.user.role !== "ADMIN") return reply.code(403).send({ error: "FORBIDDEN", message: "Administrator access required" });
}
