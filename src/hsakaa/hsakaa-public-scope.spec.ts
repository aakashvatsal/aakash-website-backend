import { HsakaaMode } from './dto/ask-hsakaa.dto';
import { evaluatePublicHsakaaScope } from './hsakaa-public-scope';

describe('evaluatePublicHsakaaScope', () => {
  it.each([
    ['What is Aakash building long-term?', HsakaaMode.CHAT],
    ['What does Aakash believe about building companies?', HsakaaMode.CHAT],
    ['What is 8lete?', HsakaaMode.CHAT],
    ['Tell me about Cosmo', HsakaaMode.CHAT],
    ['What companies have you built?', HsakaaMode.CHAT],
    ['What are your hobbies?', HsakaaMode.CHAT],
    ['Which books are you reading?', HsakaaMode.CHAT],
    ['What books are in the library?', HsakaaMode.LIBRARY],
    ['What are the latest entries?', HsakaaMode.JOURNAL],
    ['What goals do you remember?', HsakaaMode.MEMORY],
  ])('allows personal question: %s', (message, mode) => {
    expect(evaluatePublicHsakaaScope(mode, message).allowed).toBe(true);
  });

  it.each([
    'What is the capital of France?',
    'Can you explain quantum physics?',
    'How does a combustion engine work?',
    'Recommend me a good book',
    'Write me an email',
    'Solve 29 * 48',
    'Plan a trip to Japan',
    'Translate this sentence to Spanish',
  ])('blocks generic question: %s', (message) => {
    expect(evaluatePublicHsakaaScope(HsakaaMode.CHAT, message).scope).toBe(
      'out_of_scope',
    );
  });

  it('does not let a non-chat mode turn an unrelated question into a personal one', () => {
    expect(
      evaluatePublicHsakaaScope(
        HsakaaMode.LIBRARY,
        'What is the capital of France?',
      ).scope,
    ).toBe('out_of_scope');
  });

  it.each([
    "How was Aakash's WHOOP recovery today?",
    'What workout does Aakash do?',
    'How much does Aakash weigh?',
  ])('blocks health even when it is about Aakash: %s', (message) => {
    expect(evaluatePublicHsakaaScope(HsakaaMode.CHAT, message).scope).toBe(
      'health',
    );
  });

  it.each([
    "How is Aakash's Instagram performing?",
    'What did Aakash post today?',
    'How many followers does Aakash have?',
  ])('blocks media even when it is about Aakash: %s', (message) => {
    expect(evaluatePublicHsakaaScope(HsakaaMode.CHAT, message).scope).toBe(
      'media',
    );
  });

  it.each(['Why?', 'Tell me more', 'How so?', 'And then?'])(
    'allows an unmistakable follow-up in an existing personal conversation: %s',
    (message) => {
      expect(
        evaluatePublicHsakaaScope(HsakaaMode.CHAT, message, true).allowed,
      ).toBe(true);
    },
  );

  it.each(['Capital of France?', 'Write me a poem', 'Solve 2 + 2'])(
    'blocks unrelated short questions even after a personal conversation: %s',
    (message) => {
      expect(
        evaluatePublicHsakaaScope(HsakaaMode.CHAT, message, true).scope,
      ).toBe('out_of_scope');
    },
  );
});
