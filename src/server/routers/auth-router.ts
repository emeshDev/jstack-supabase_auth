// this is auth router /controller , i hope you wont changed it
// src/server/routers/auth-router.ts
import { db } from "@/db";
import { router } from "../__internals/router";
import { privateProcedure } from "../procedures";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const authRouter = router({
  v1: privateProcedure
    .input(
      z.object({
        userId: z.string(),
        email: z.string().email(),
        name: z.string().optional(),
        emailVerified: z.string().nullable(),
        deviceId: z.string(),
      })
    )
    .mutation(async ({ c, input, ctx }) => {
      try {
        const { supabaseUser, token } = ctx;

        // Single source of truth untuk user data
        const user = await db.user.upsert({
          where: { id: input.userId },
          create: {
            id: input.userId,
            email: input.email,
            name: input.name,
            emailVerified: input.emailVerified
              ? new Date(input.emailVerified)
              : null,
          },
          update: {
            email: input.email,
            name: input.name,
            emailVerified: input.emailVerified
              ? new Date(input.emailVerified)
              : null,
          },
        });

        // Consistent expiry time
        const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

        const session = await db.session.upsert({
          where: {
            token: ctx.token,
            deviceId: input.deviceId,
          },
          create: {
            userId: user.id,
            token: ctx.token,
            deviceId: input.deviceId,
            expires: expiryTime,
            userAgent: c.req.header("user-agent"),
            ipAddress:
              c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
            lastActivity: supabaseUser.last_sign_in_at
              ? new Date(supabaseUser.last_sign_in_at)
              : new Date(), // fallback ke current time
          },
          update: {
            expires: expiryTime,
            userAgent: c.req.header("user-agent"),
            ipAddress:
              c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
            lastActivity: supabaseUser.last_sign_in_at
              ? new Date(supabaseUser.last_sign_in_at)
              : new Date(), // fallback ke current time
          },
        });

        return c.json({
          success: true,
          user,
          session,
        });
      } catch (error) {
        throw new HTTPException(500, {
          message:
            error instanceof Error ? error.message : "Failed to sync user data",
        });
      }
    }),

  updateSession: privateProcedure
    .input(
      z.object({
        token: z.string(),
        expiresAt: z.number(),
      })
    )
    .mutation(async ({ c, input }) => {
      try {
        const session = await db.session.update({
          where: { token: input.token },
          data: {
            lastActivity: new Date(),
            expires: new Date(input.expiresAt * 1000),
          },
        });

        return c.json({
          success: true,
          session,
        });
      } catch (error) {
        throw new HTTPException(500, {
          message:
            error instanceof Error ? error.message : "Failed to update session",
        });
      }
    }),

  logout: privateProcedure.mutation(async ({ c, ctx }) => {
    try {
      const { token } = ctx;

      await db.session.deleteMany({
        where: { token },
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Logout error: ", error);
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : "Failed to logout",
      });
    }
  }),
});
