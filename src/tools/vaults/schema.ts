// Original — no upstream. Input and output schemas for the vaults tool (068 FR-036, data-model §6).
import { z } from "zod";

export const vaultsInputSchema = z.strictObject({});

export const vaultEntrySchema = z.strictObject({
  name: z.string().min(1).describe("Obsidian display name of the vault, the value tools take as `vault`."),
  path: z.string().min(1).describe("Absolute path of the vault folder, as Obsidian reports it."),
  open: z
    .boolean()
    .nullable()
    .describe("Whether the vault is open in Obsidian; null when unknown (the CLI does not report it)."),
});

export const vaultsOutputSchema = z
  .strictObject({
    count: z.number().int().min(0).describe("Number of vaults listed; always equals vaults.length."),
    vaults: z.array(vaultEntrySchema).describe("Every vault Obsidian knows, in CLI order; duplicate names are kept."),
  })
  .refine((o) => o.count === o.vaults.length, "count must equal vaults.length");

export type VaultsInput = z.infer<typeof vaultsInputSchema>;
export type VaultsOutput = z.infer<typeof vaultsOutputSchema>;
