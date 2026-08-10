import { ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

export interface AlternativeImage {
    description: string;
    imagePrompt: string;
    imageUrl: string;
    conditionCollections: ConditionCollection[];
}

export const createAlternativeImage = (data?: Partial<AlternativeImage>): AlternativeImage => ({
    description: data?.description || '',
    imagePrompt: data?.imagePrompt || '',
    imageUrl: data?.imageUrl || '',
    conditionCollections: (data?.conditionCollections || []).map((collection) => [...collection]),
});

export const getMatchingAlternativeImage = (
    alternatives: AlternativeImage[] | undefined,
    context: ConditionContext | undefined,
): AlternativeImage | undefined => {
    if (!context) {
        return undefined;
    }
    return alternatives?.find((alternative) => evaluateConditionCollections(alternative.conditionCollections, context));
};