import { z } from "zod";

export const userUpdateSchema = z.object({
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});
