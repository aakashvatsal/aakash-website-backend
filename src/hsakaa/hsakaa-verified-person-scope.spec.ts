import { HsakaaMode } from './dto/ask-hsakaa.dto';
import { evaluateVerifiedPersonHsakaaScope } from './hsakaa-public-scope';

describe('evaluateVerifiedPersonHsakaaScope', () => {
  it.each([
    'What do you remember about me?',
    'Do you remember me?',
    'What have we discussed?',
    'How did we meet?',
    'Tell me about our relationship',
  ])('allows verified relationship question: %s', (message) => {
    expect(
      evaluateVerifiedPersonHsakaaScope(HsakaaMode.CHAT, message).allowed,
    ).toBe(true);
  });

  it.each([
    'What is the capital of France?',
    'Write me an email',
    'Recommend me a restaurant',
  ])('still blocks generic question: %s', (message) => {
    expect(
      evaluateVerifiedPersonHsakaaScope(HsakaaMode.CHAT, message).scope,
    ).toBe('out_of_scope');
  });

  it.each([
    'How is your WHOOP recovery?',
    'What workout do you do?',
    'How is your Instagram performing?',
  ])('keeps excluded domains blocked: %s', (message) => {
    expect(
      evaluateVerifiedPersonHsakaaScope(HsakaaMode.CHAT, message).allowed,
    ).toBe(false);
  });
});
