import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIAgentExecutor } from '../lib/server/agents/openai-executor.ts';
import { chiefOfStaffAgent } from '../lib/server/agents/registry.ts';
import { Usage } from '@openai/agents';

test('executor uses configured SDK provider, disables retention, and preserves synthesis clarification', async () => {
  let called = false;
  const answer = { mode: 'needs_input', sufficient: false, question: '真实截止日是哪一天？', missingEvidence: ['deadline'], recommendation: null };
  const executor = createOpenAIAgentExecutor('test-not-a-real-key', 2000, { modelProvider: { getModel: () => ({
    async getResponse(request) {
      called = true;
      assert.equal(request.modelSettings.store, false);
      assert.equal(request.tracing, false);
      return { usage: new Usage(), output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] };
    },
    async *getStreamedResponse() { throw new Error('stream not expected'); },
  }) } });
  const result = await executor({ phase: 'synthesis', agent: chiefOfStaffAgent, input: { records: [] }, signal: new AbortController().signal });
  assert.equal(called, true);
  assert.deepEqual(result, { status: 'needs_input', question: answer.question, missingEvidence: answer.missingEvidence });
});
