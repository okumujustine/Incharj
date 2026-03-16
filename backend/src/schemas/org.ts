import { z } from "zod";

export const orgCreateSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const orgUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  settings: z.record(z.any()).nullable().optional(),
});

export const memberRoleSchema = z.object({
  role: z.string(),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.string().default("member"),
});
