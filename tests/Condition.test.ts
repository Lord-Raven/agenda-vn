import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Condition, ConditionContext, ContentProperty, ContentType, evaluateCondition, hasVariableContentTarget } from '../src/content/Condition';
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

test('skit state conditions read the active skit, treating no skit as inactive with no participants or location', () => {
    const skitState = { participants: ['alice', 'bob'], locationId: 'park' };
    const cases: Array<[Condition, boolean, boolean]> = [
        [{ type: 'skitState', field: 'active', comparison: 'equals', value: true }, true, false],
        [{ type: 'skitState', field: 'active', comparison: 'equals', value: false }, false, true],
        [{ type: 'skitState', field: 'participants', comparison: 'contains', value: 'alice' }, true, false],
        [{ type: 'skitState', field: 'participants', comparison: 'notContains', value: 'carol' }, true, true],
        [{ type: 'skitState', field: 'participants', comparison: 'minimumLength', value: 2 }, true, false],
        [{ type: 'skitState', field: 'participants', comparison: 'maximumLength', value: 0 }, false, true],
        [{ type: 'skitState', field: 'location', comparison: 'equals', value: 'park' }, true, false],
        [{ type: 'skitState', field: 'location', comparison: 'notEquals', value: 'park' }, false, true],
    ];
    for (const [condition, duringSkit, outsideSkit] of cases) {
        assert.equal(evaluateCondition(condition, { skitState }), duringSkit, `${JSON.stringify(condition)} during skit`);
        assert.equal(evaluateCondition(condition, {}), outsideSkit, `${JSON.stringify(condition)} outside skit`);
    }
});

test('skit state condition values resolve references as the field type', () => {
    const types: string[] = [];
    const context: ConditionContext = {
        skitState: { participants: ['alice'], locationId: 'park' },
        resolveValue: (value, type) => {
            types.push(type);
            return value === 'stat:friend' ? 'alice' : value === 'stat:place' ? 'park' : value as string;
        },
    };
    assert.equal(evaluateCondition({ type: 'skitState', field: 'participants', comparison: 'contains', value: 'stat:friend' }, context), true);
    assert.equal(evaluateCondition({ type: 'skitState', field: 'location', comparison: 'equals', value: 'stat:place' }, context), true);
    assert.deepEqual(types, ['actor', 'location']);
});

test('content properties compare raw strings for each entity kind and resolve values as text', () => {
    const common = { id: 'one', name: 'Moonstone', description: 'A pale stone', category: 'Treasures' };
    const actor = { ...common, displayName: 'Moon', role: 'Ranger', birthDate: '2000-01-02', summary: 'A scout', background: 'Raised outside', profile: 'Curious' };
    const fields: Array<[ContentType, ContentProperty, string]> = [
        ...(['actor', 'item', 'location'] as const).flatMap(type => [
            [type, 'name', 'moonstone'], [type, 'description', 'pale'], [type, 'category', 'treasures'],
        ] as Array<[ContentType, ContentProperty, string]>),
        ['actor', 'displayName', 'moon'], ['actor', 'role', 'ranger'], ['actor', 'birthDate', '2000-01-02'],
        ['actor', 'summary', 'scout'], ['actor', 'background', 'outside'], ['actor', 'profile', 'curious'],
    ];
    const context: ConditionContext = {
        actors: [actor], inventory: [common], atlas: [common],
        resolveValue: (value, type) => { assert.ok(type === 'text' || type === 'actor' || type === 'item' || type === 'location'); return literalValue(value); },
    };
    for (const [contentType, property, value] of fields) {
        const condition: Condition = { type: 'contentStat', contentType, targetId: 'one', statId: '', property, comparison: 'contains', value };
        assert.equal(evaluateCondition(condition, context), true, `${contentType} ${property}`);
        assert.equal(evaluateCondition({ ...condition, comparison: 'notContains' }, context), false);
    }
});

test('property targets support variable, any, none, missing fields and custom stat IDs independently', () => {
    const stat = cloneStat({ id: 'property:name', name: 'Custom', type: 'text', default: '', guidance: '', llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] } });
    const actor = { id: 'a', name: '1d6', role: 'Guard', statMap: { 'property:name': 'custom' } };
    const context: ConditionContext = { actors: [actor, { id: 'b', role: 'Mage', active: false }], currentActor: actor, actorStats: [stat] };
    const condition: Condition = { type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: '', property: 'role', comparison: 'equals', value: 'guard' };
    assert.equal(evaluateCondition(condition, context), true);
    assert.equal(evaluateCondition({ ...condition, targetId: 'any' }, context), true);
    assert.equal(evaluateCondition({ ...condition, targetId: 'none' }, context), false);
    assert.equal(evaluateCondition({ ...condition, targetId: 'none', value: 'mage' }, context), true);
    assert.equal(evaluateCondition({ ...condition, targetId: 'missing' }, context), false);
    assert.equal(evaluateCondition({ ...condition, property: 'summary', value: '' }, context), true);
    assert.equal(evaluateCondition({ ...condition, property: 'name', value: '1d6' }, context), true);
    assert.equal(evaluateCondition({ ...condition, property: 'name', value: 'variable:actor' }, { ...context, currentActor: { ...actor, name: 'variable:actor' } }), true);
    assert.equal(hasVariableContentTarget([[{ ...condition, targetId: 'a', value: 'variable:actor' }]]), false);
    assert.equal(hasVariableContentTarget([[{ ...condition, value: 'variable:actor' }]]), true);
    assert.equal(evaluateCondition({ ...condition, contentType: 'item', property: 'role', targetId: 'none' }, context), false);
    assert.equal(evaluateCondition({ type: 'contentStat', contentType: 'actor', targetId: 'a', statId: 'property:name', comparison: 'equals', value: 'custom' }, context), true);
    assert.equal(evaluateCondition(JSON.parse(JSON.stringify(condition)), context), true);
});
