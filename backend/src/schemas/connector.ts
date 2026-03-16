import { z } from "zod";

export const connectorCreateSchema = z.object({
  kind: z.string(),
  name: z.string(),
  config: z.record(z.any()).nullable().optional(),
  sync_frequency: z.string().default("1 hour"),
});

export const connectorUpdateSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.any()).nullable().optional(),
  sync_frequency: z.string().optional(),
});
