import { Condition, ConditionContext, evaluateConditions } from './Condition';

export interface AlternativeImage {
    description: string;
    imagePrompt: string;
    imageUrl: string;
    conditions: Condition[];
}

export const createAlternativeImage = (data?: Partial<AlternativeImage>): AlternativeImage => ({
    description: data?.description || '',
    imagePrompt: data?.imagePrompt || '',
    imageUrl: data?.imageUrl || '',
    conditions: Array.isArray(data?.conditions) ? [...data.conditions] : [],
});

export const getMatchingAlternativeImage = (
    alternatives: AlternativeImage[] | undefined,
    context: ConditionContext | undefined,
): AlternativeImage | undefined => {
    if (!context) {
        return undefined;
    }
    return alternatives?.find((alternative) => evaluateConditions(alternative.conditions, context));
};