import { model } from 'mongoose';
import { HealthStrategySchema } from './health-strategy.schema';

describe('HealthStrategySchema', () => {
  const StrategyModel = model(
    `HealthStrategySchemaSpec_${Date.now()}`,
    HealthStrategySchema,
  );

  it('allows keep/review recommendations without a replacement product name', async () => {
    const strategy = new StrategyModel({
      key: 'owner',
      summary: 'Current strategy',
      productRecommendations: [
        {
          domain: 'skincare',
          action: 'keep',
          slot: 'cleanser',
          currentProduct: 'Current cleanser',
          suggestedProductName: '',
          reason: 'Current product is suitable.',
          usageGuidance: 'Continue current routine.',
          availabilityStatus: 'not_checked',
        },
      ],
      supplementRecommendations: [
        {
          action: 'review',
          category: 'Vitamin D3',
          currentSupplement: 'Current Vitamin D3',
          suggestedProductName: '',
          reason: 'Review against current labs and professional guidance.',
          availabilityStatus: 'not_checked',
        },
      ],
      contextHash: 'context',
      aiModel: 'test-model',
      aiResponseId: 'test-response',
      generatedAt: new Date(),
    });

    await expect(strategy.validate()).resolves.toBeUndefined();
    expect(strategy.productRecommendations[0]?.suggestedProductName).toBe('');
    expect(strategy.supplementRecommendations[0]?.suggestedProductName).toBe(
      '',
    );
  });
});
