import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Condition, ConditionContext, evaluateCondition } from '../src/content/Condition';
import { cloneStat, StatType } from '../src/content/Stat';

const listTypes: StatType[] = ['actorList', 'locationList', 'itemList', 'contentList', 'optionList'];

const literalValue = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        || (Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string'))) {
        return value;
    }
    throw new Error('Expected a literal stat value.');
};

for (const type of listTypes) {
    const stat = cloneStat({
        id: 'list', name: 'List', type, default: ['a', 'b'], guidance: '',
        options: [{ id: 'a', name: 'A', description: '' }, { id: 'b', name: 'B', description: '' }],
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    });
    const entity = { id: 'entity', statMap: { list: ['a', 'b'] } };
    const context: ConditionContext = {
        globalStats: [stat], globalStatValues: { list: ['a', 'b'] },
        actorStats: [stat], locationStats: [stat], itemStats: [stat],
        actors: [entity], atlas: [entity], inventory: [entity],
        functions: [{ id: 'list', name: 'List', returnType: type, description: '', script: '' }],
        resolveValue: value => value === 'function:list' ? ['a', 'b'] : literalValue(value),
    };
    const conditions: Condition[] = [
        { type: 'globalStat', statId: stat.id, comparison: 'minimumLength', value: 2 },
        ...(['actor', 'location', 'item'] as const).map(contentType => ({
            type: 'contentStat' as const, contentType, targetId: 'entity',
            statId: stat.id, comparison: 'minimumLength' as const, value: 2,
        })),
        { type: 'function', reference: 'function:list', comparison: 'minimumLength', value: 2 },
    ];
    for (const condition of conditions) {
        test(`${condition.type}${condition.type === 'contentStat' ? `:${condition.contentType}` : ''} ${type} length comparisons are inclusive`, () => {
            for (const [value, minimum, maximum] of [[0, true, false], [1, true, false], [2, true, true], [3, false, true]] as const) {
                assert.equal(evaluateCondition({ ...condition, comparison: 'minimumLength', value }, context), minimum);
                assert.equal(evaluateCondition({ ...condition, comparison: 'maximumLength', value }, context), maximum);
            }
            assert.equal(evaluateCondition({ ...condition, comparison: 'contains', value: 'a' }, context), true);
            assert.equal(evaluateCondition({ ...condition, comparison: 'notContains', value: 'c' }, context), true);
        });
    }
    test(`${type} length checks use defaults and match an empty list at zero`, () => {
        const condition: Condition = { type: 'globalStat', statId: stat.id, comparison: 'maximumLength', value: 0 };
        assert.equal(evaluateCondition(condition, { globalStats: [stat], globalStatValues: { list: [] } }), true);
        assert.equal(evaluateCondition({ ...condition, comparison: 'minimumLength' }, { globalStats: [stat], globalStatValues: { list: [] } }), true);
        assert.equal(evaluateCondition({ ...condition, comparison: 'minimumLength', value: 1 }, { globalStats: [stat], globalStatValues: { list: [] } }), false);
        assert.equal(evaluateCondition({ ...condition, value: 2 }, { globalStats: [stat] }), true);
        assert.equal(evaluateCondition(condition, {}), false);
    });
}

test('length checks reject invalid thresholds and never count scalar values', () => {
    const context: ConditionContext = {
        functions: [{ id: 'result', name: 'Result', returnType: 'text', description: '', script: '' }],
        resolveValue: value => value === 'function:result' ? 'abc' : literalValue(value),
    };
    for (const comparison of ['minimumLength', 'maximumLength'] as const) {
        const condition: Condition = { type: 'function', reference: 'function:result', comparison, value: 0 };
        assert.equal(evaluateCondition(condition, context), false);
        for (const value of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '', '2', true]) {
            assert.throws(() => evaluateCondition({ ...condition, value }, context), /non-negative integer/);
        }
    }
});

test('length thresholds resolve as numbers, without option-list membership normalization', () => {
    const stat = cloneStat({
        id: 'choices', name: 'Choices', type: 'optionList', default: ['a', 'b'], guidance: '',
        options: [{ id: 'a', name: 'A', description: '' }, { id: 'b', name: '2', description: '' }],
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    });
    const context: ConditionContext = {
        globalStats: [stat],
        resolveValue: (value, type) => {
            if (value === 'globalStat:threshold') {
                assert.equal(type, 'number');
                return 2;
            }
            return literalValue(value);
        },
    };
    assert.equal(evaluateCondition({ type: 'globalStat', statId: stat.id, comparison: 'minimumLength', value: 2 }, context), true);
    assert.equal(evaluateCondition({ type: 'globalStat', statId: stat.id, comparison: 'maximumLength', value: 'globalStat:threshold' }, context), true);
});
