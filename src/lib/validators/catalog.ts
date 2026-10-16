import { z } from "zod";

export const catalogFiltersSchema = z.object({
  q: z.string().trim().max(80).optional().transform((value) => value || ""),
  brand: z.uuid().optional(),
});

export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;
