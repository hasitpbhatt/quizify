import type { PromptTask } from '@/lib/llm/promptTask';
import { parseGradeResponse, type GradeResult } from '@/lib/llm/gradeParser';
import { buildGradeSystemPrompt, buildGradeUserMessage } from '@/lib/prompts/grade';

export interface GradeInput {
  prompt: string;
  given: string;
  correctAnswer: string;
}

export const gradeTask: PromptTask<GradeResult> = {
  id: 'grade',
  buildSystem: (_persona, ctx) => buildGradeSystemPrompt(ctx.conceptTitle as string),
  buildUser: (input) => {
    const { prompt, given, correctAnswer } = input as GradeInput;
    return buildGradeUserMessage(prompt, given, correctAnswer);
  },
  parse: parseGradeResponse,
};
