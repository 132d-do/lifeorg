export type OpenAIRuntime = Record<string, string | undefined>;

const allowedSpecialistModels = new Set(["gpt-5.6-terra"]);
const allowedChiefModels = new Set(["gpt-5.6-sol"]);

export function readOpenAIConfiguration(runtime: OpenAIRuntime) {
  const specialistCandidate = runtime.OPENAI_SPECIALIST_MODEL;
  const chiefCandidate = runtime.OPENAI_CHIEF_MODEL;
  return {
    apiKey: runtime.OPENAI_API_KEY?.trim() || null,
    specialistModel: specialistCandidate && allowedSpecialistModels.has(specialistCandidate) ? specialistCandidate : "gpt-5.6-terra",
    chiefModel: chiefCandidate && allowedChiefModels.has(chiefCandidate) ? chiefCandidate : "gpt-5.6-sol",
  };
}

