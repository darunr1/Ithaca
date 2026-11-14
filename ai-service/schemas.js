import { z } from 'zod';
export const extractionSchema = z.object({ drafts: z.array(z.object({
  memberId: z.string().nullable(), memberName: z.string().min(1), description: z.string().min(1).max(2000),
  skills: z.array(z.string().min(1)).max(12), suggestedLevel: z.enum(['low', 'medium', 'high']),
  sourceExcerpt: z.string().min(1), uncertainty: z.string()
}).strict()).max(50) }).strict();
export const fitSchema = z.object({ candidateId: z.string(), strengths: z.array(z.object({
  explanation: z.string().min(1), evidenceId: z.string().min(1), sourceExcerpt: z.string().min(1)
}).strict()).max(10), gaps: z.array(z.string()), reviewRequired: z.literal(true) }).strict();
export const extractionJsonSchema = z.toJSONSchema(extractionSchema);
export const fitJsonSchema = z.toJSONSchema(fitSchema);
export function validateExtraction(output, { notes, roster }) {
  const result = extractionSchema.parse(output);
  for (const draft of result.drafts) {
    if (!notes.includes(draft.sourceExcerpt)) throw new Error('Evidence must be an exact excerpt of the supplied notes.');
    if (draft.memberId !== null) {
      const member = roster.find(m => m.id === draft.memberId);
      if (!member || member.name !== draft.memberName) throw new Error('Member attribution does not match the roster.');
      if (!draft.sourceExcerpt.includes(member.name)) throw new Error('Attributed evidence must explicitly name the roster member; otherwise leave memberId null.');
    }
  }
  return result;
}
export function validateFit(output, { candidateId, evidence }) {
  const result = fitSchema.parse(output);
  if (result.candidateId !== candidateId) throw new Error('Candidate mismatch.');
  for (const strength of result.strengths) {
    const source = evidence.find(e => e.id === strength.evidenceId);
    if (!source || !source.text.includes(strength.sourceExcerpt)) throw new Error('Unsupported candidate-fit evidence.');
  }
  return result;
}
