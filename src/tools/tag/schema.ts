// Original — no upstream. tag input/output/eval-envelope schemas — vault-only surface (NO target_mode discriminator per FR-001/R4); structural normalisation chain (trim → strip-leading-`#` → empty/length/segment refinements); discriminated-union eval-envelope wire format with two ok:true mode variants (default {count, paths} and count-only {total}) per cross-mode envelope architecture (R3 / FR-019); third-rail base64-decoded payload is anti-injection (FR-020) and rides on the frozen JS template.
import { z } from "zod";

export const tagInputSchema = z
  .object({
    tag: z
      .string()
      .min(1, "tag is required")
      .max(220, "tag too long (raw input max 220 chars; structural max 200 post-trim/post-#-strip)")
      .transform((s) => s.trim())
      .transform((s) => (s.startsWith("#") ? s.slice(1) : s))
      .refine((s) => s.length > 0, "tag is empty post-trim/post-#-strip")
      .refine((s) => s.length <= 200, "tag exceeds 200 chars post-strip")
      .refine(
        (s) => !s.split("/").some((seg) => seg.length === 0),
        "tag contains empty hierarchical segment (e.g. /foo, foo/, foo//bar)",
      ),
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict();

export const tagDefaultOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string().min(1)),
  })
  .strict()
  .refine((o) => o.count === o.paths.length, "count must equal paths.length");

export const tagCountOnlyOutputSchema = z.number().int().nonnegative();

const tagEnvelopeOkDefault = z
  .object({
    ok: z.literal(true),
    mode: z.literal("default"),
    count: z.number().int().nonnegative(),
    paths: z.array(z.string().min(1)),
  })
  .strict();

const tagEnvelopeOkCountOnly = z
  .object({
    ok: z.literal(true),
    mode: z.literal("count-only"),
    total: z.number().int().nonnegative(),
  })
  .strict();

const tagEnvelopeError = z
  .object({
    ok: z.literal(false),
    code: z.string().min(1),
    detail: z.string().optional(),
  })
  .strict();

// z.union (not z.discriminatedUnion) because both ok:true branches share the
// "ok" discriminator value; the secondary `mode` discriminator differentiates
// them but zod's discriminatedUnion requires the outer discriminator value to
// be unique per branch. A two-level discriminatedUnion would be marginally
// faster on the success path but adds intermediate types with no observable
// payoff at three variants total.
export const tagEvalEnvelopeSchema = z.union([
  tagEnvelopeOkDefault,
  tagEnvelopeOkCountOnly,
  tagEnvelopeError,
]);

export type TagInput = z.infer<typeof tagInputSchema>;
export type TagDefaultOutput = z.infer<typeof tagDefaultOutputSchema>;
export type TagCountOnlyOutput = z.infer<typeof tagCountOnlyOutputSchema>;
export type TagEvalEnvelope = z.infer<typeof tagEvalEnvelopeSchema>;
