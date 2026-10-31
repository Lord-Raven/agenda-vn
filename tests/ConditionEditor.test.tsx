import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { isValidElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConditionEditor, createDefaultCondition } from '../src/components/ConditionEditor';
import { ConditionalFlagEditor } from '../src/components/ConditionalFlagEditor';
import { StatUpdateRuleEditor } from '../src/components/StatUpdateRuleEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { Condition, ConditionCollection, GlobalStatCondition } from '../src/content/Condition';
import { cloneStat, Stat, StatUpdateRule } from '../src/content/Stat';

const numberStat = cloneStat({
    id: 'score', name: 'Score', type: 'number', default: 7, guidance: '',
    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
});

const clickButton = (tree: ReactNode, label: string) => {
    let handler: (() => void) | undefined;
    const visit = (children: ReactNode) => React.Children.forEach(children, child => {
        if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string; onClick?: () => void }>(child)) return;
        if (child.props['aria-label'] === label || React.Children.toArray(child.props.children).includes(label)) {
            handler = child.props.onClick;
        }
        visit(child.props.children);
    });
    visit(tree);
    assert.ok(handler, `Missing button: ${label}`);
    handler();
};

const cases: Array<{ name: string; stats: Stat[]; expected: GlobalStatCondition }> = [
    {
        name: 'numeric stat', stats: [numberStat],
        expected: { type: 'globalStat', statId: 'score', comparison: 'equals', value: 7 },
    },
    {
        name: 'list stat', stats: [cloneStat({
            ...numberStat, type: 'optionList', default: [],
            options: [{ id: 'first', name: 'First', description: '' }],
        })],
        expected: { type: 'globalStat', statId: 'score', comparison: 'contains', value: 'first' },
    },
    {
        name: 'no global stats', stats: [],
        expected: { type: 'globalStat', statId: '', comparison: 'equals', value: 0 },
    },
];

for (const { name, stats, expected } of cases) {
    test(`condition editor adds Global Stat with ${name}, preserving existing conditions and categories`, () => {
        const existing: ConditionCollection[] = [[{
            type: 'calendar', field: 'day', comparison: 'equals', value: 2,
        }]];
        let collections = existing;
        let categories = ['disabled'];
        const tree = ConditionEditor({
            conditionCollections: existing, globalStats: stats,
            onChange: next => { collections = next; },
            collectionCategories: [{ value: 'unavailable', label: 'Unavailable' }, { value: 'disabled', label: 'Disabled' }],
            collectionCategoryValues: categories,
            onCollectionCategoryValuesChange: next => { categories = next; },
        });
        clickButton(tree, ' Add condition');
        assert.deepEqual(collections, [...existing, [expected]]);
        assert.equal(collections[0], existing[0]);
        assert.deepEqual(categories, ['disabled', 'unavailable']);
        assert.equal(existing.length, 1);
    });

    test(`conditional flags add Global Stat with ${name}`, () => {
        const existing: ConditionCollection[] = [[{
            type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'night',
        }]];
        let flag = { value: true, conditions: existing };
        let tree: ReactNode;
        const Probe = () => {
            tree = ConditionalFlagEditor({
                label: 'Visible', flag, globalStats: stats,
                onChange: next => { flag = next; },
            });
            return tree;
        };
        renderToStaticMarkup(<TooltipProvider><Probe /></TooltipProvider>);
        clickButton(tree, 'Add a Condition for Visible');
        assert.deepEqual(flag, { value: true, conditions: [...existing, [expected]] });
        assert.equal(flag.conditions[0], existing[0]);
        assert.equal(existing.length, 1);
    });

    test(`stat update events start with Global Stat with ${name}`, () => {
        let rules: StatUpdateRule[] = [];
        let tree: ReactNode;
        const Probe = () => {
            tree = StatUpdateRuleEditor({
                rules, globalStats: stats, actorStats: [], actors: [], locations: [],
                onChange: next => { rules = next; },
            });
            return tree;
        };
        renderToStaticMarkup(<TooltipProvider><Probe /></TooltipProvider>);
        clickButton(tree, ' Add stat update event');
        assert.equal(rules.length, 1);
        assert.ok(rules[0].id);
        assert.deepEqual(rules[0].conditions, [[expected]]);
        assert.deepEqual(rules[0].updates, []);
    });
}

test('default conditions use the first global stat and its type-specific value', () => {
    for (const [stat, value] of [
        [cloneStat({ ...numberStat, type: 'checkbox', default: true }), true],
        [cloneStat({ ...numberStat, type: 'text', default: 'Ready' }), 'Ready'],
        [cloneStat({
            ...numberStat, type: 'option', default: 'second',
            options: [
                { id: 'first', name: 'First', description: '' },
                { id: 'second', name: 'Second', description: '' },
            ],
        }), 'second'],
    ] as const) {
        assert.deepEqual(createDefaultCondition([stat, numberStat]), {
            type: 'globalStat', statId: stat.id, comparison: 'equals', value,
        });
    }
});

const changeConditionSelect = (
    condition: Condition,
    selected: string,
    value: string,
    props: Partial<React.ComponentProps<typeof ConditionEditor>> = {},
): Condition => {
    const untouched: ConditionCollection = [{ type: 'calendar', field: 'year', comparison: 'equals', value: 2026 }];
    const collections = [[condition], untouched];
    let updated = collections;
    const tree = ConditionEditor({
        globalStats: [], ...props, conditionCollections: collections,
        onChange: next => { updated = next; },
    });
    let handler: React.ChangeEventHandler<HTMLSelectElement> | undefined;
    const visit = (children: ReactNode) => React.Children.forEach(children, child => {
        if (!isValidElement<React.PropsWithChildren<React.SelectHTMLAttributes<HTMLSelectElement>>>(child)) return;
        if (child.type === 'select' && child.props.value === selected) handler = child.props.onChange;
        visit(child.props.children);
    });
    visit(tree);
    assert.ok(handler, `Missing select: ${selected}`);
    handler({ target: { value } } as React.ChangeEvent<HTMLSelectElement>);
    assert.equal(updated[1], untouched);
    assert.equal(collections[0][0], condition);
    return updated[0][0];
};

const locationStat = cloneStat({ ...numberStat, id: 'destination', type: 'location', default: '' });
const locations = [{ id: 'town', name: 'Town' }, { id: 'forest', name: 'Forest' }];
const sharedOption = { id: 'shared', name: 'Shared', description: '' };
const optionStat = cloneStat({
    ...numberStat, type: 'option', default: 'first',
    options: [{ id: 'first', name: 'First', description: '' }, sharedOption],
});

const statSelectionCases: Array<{
    name: string;
    from: Stat;
    to: Stat;
    comparison?: GlobalStatCondition['comparison'];
    value: GlobalStatCondition['value'];
    expectedValue: GlobalStatCondition['value'];
    expectedComparison?: GlobalStatCondition['comparison'];
}> = [
    { name: 'location reference', from: locationStat, to: locationStat, value: 'town', expectedValue: 'town' },
    { name: 'different reference kind', from: locationStat, to: cloneStat({ ...locationStat, type: 'actor' }), value: 'town', expectedValue: '' },
    { name: 'missing reference', from: locationStat, to: locationStat, value: 'deleted', expectedValue: '' },
    { name: 'variable reference', from: locationStat, to: locationStat, value: 'variable:location', expectedValue: 'variable:location' },
    { name: 'numeric zero', from: numberStat, to: numberStat, comparison: 'greaterThan', value: 0, expectedValue: 0 },
    { name: 'numeric formula', from: numberStat, to: numberStat, value: '1d6+2', expectedValue: '1d6+2' },
    { name: 'checkbox false', from: cloneStat({ ...numberStat, type: 'checkbox', default: true }), to: cloneStat({ ...numberStat, type: 'checkbox', default: true }), value: false, expectedValue: false },
    { name: 'text substring', from: cloneStat({ ...numberStat, type: 'text' }), to: cloneStat({ ...numberStat, type: 'text' }), comparison: 'contains', value: 'hello', expectedValue: 'hello' },
    { name: 'shared option', from: optionStat, to: optionStat, value: 'shared', expectedValue: 'shared' },
    { name: 'unavailable option', from: optionStat, to: cloneStat({ ...optionStat, options: [{ id: 'other', name: 'Other', description: '' }], default: 'other' }), value: 'shared', expectedValue: 'other' },
    { name: 'scalar to reference list', from: locationStat, to: cloneStat({ ...locationStat, type: 'locationList', default: [] }), value: 'town', expectedValue: 'town', expectedComparison: 'contains' },
    { name: 'reference list to scalar', from: cloneStat({ ...locationStat, type: 'locationList', default: [] }), to: locationStat, comparison: 'notContains', value: 'town', expectedValue: 'town', expectedComparison: 'equals' },
    { name: 'scalar to option list', from: optionStat, to: cloneStat({ ...optionStat, type: 'optionList', default: [] }), value: 'shared', expectedValue: 'shared', expectedComparison: 'contains' },
    { name: 'incompatible value only', from: locationStat, to: numberStat, value: 'town', expectedValue: 7 },
    { name: 'typed global source', from: locationStat, to: locationStat, value: 'globalStat:destination', expectedValue: 'globalStat:destination' },
    { name: 'incompatible global source', from: locationStat, to: numberStat, value: 'globalStat:destination', expectedValue: 7 },
];

for (const { name, from, to, comparison = 'notEquals', value, expectedValue, expectedComparison = comparison } of statSelectionCases) {
    for (const category of ['globalStat', 'contentStat'] as const) {
        test(`${category} changes preserve valid selections: ${name}`, () => {
            const nextStat = cloneStat({ ...to, id: 'next-stat' });
            const condition: Condition = category === 'globalStat'
                ? { type: 'globalStat', statId: from.id, comparison, value }
                : { type: 'contentStat', contentType: 'actor', targetId: 'actor-x', statId: from.id, comparison, value };
            assert.deepEqual(changeConditionSelect(condition, from.id, nextStat.id, {
                globalStats: [from, nextStat], actorStats: [from, nextStat],
                actors: [{ id: 'actor-x', name: 'Actor X' }], locations, variableContentType: 'location',
            }), { ...condition, statId: nextStat.id, comparison: expectedComparison, value: expectedValue });
        });
    }
}

test('category changes keep a valid stat, comparison, value and meta-target rather than choosing the first stat', () => {
    const condition: Condition = {
        type: 'contentStat', contentType: 'actor', targetId: 'none',
        statId: locationStat.id, comparison: 'notEquals', value: 'town',
    };
    assert.deepEqual(changeConditionSelect(condition, 'contentStat:actor', 'contentStat:location', {
        actorStats: [locationStat], locationStats: [numberStat, locationStat], locations,
    }), { ...condition, contentType: 'location' });
});

test('category changes reset invalid targets and stats but preserve valid comparison and value', () => {
    const condition: Condition = {
        type: 'contentStat', contentType: 'actor', targetId: 'actor-x',
        statId: 'old-score', comparison: 'greaterThan', value: 42,
    };
    for (const targetId of ['actor-x', 'variable']) {
        assert.deepEqual(changeConditionSelect({ ...condition, targetId }, 'contentStat:actor', 'contentStat:location', {
            actorStats: [cloneStat({ ...numberStat, id: 'old-score' })], locationStats: [numberStat],
            actors: [{ id: 'actor-x', name: 'Actor X' }], locations, variableContentType: 'actor',
        }), { ...condition, contentType: 'location', targetId: 'any', statId: numberStat.id });
    }
});

test('global and content categories preserve compatible values even when their stat IDs differ', () => {
    const condition: Condition = { type: 'globalStat', statId: locationStat.id, comparison: 'notEquals', value: 'town' };
    const localStat = cloneStat({ ...locationStat, id: 'local-destination' });
    const localCondition: Condition = {
        type: 'contentStat', contentType: 'actor', targetId: 'any',
        statId: localStat.id, comparison: 'notEquals', value: 'town',
    };
    const props = { globalStats: [locationStat], actorStats: [localStat], locations };
    assert.deepEqual(changeConditionSelect(condition, 'globalStat', 'contentStat:actor', props), localCondition);
    assert.deepEqual(changeConditionSelect(localCondition, 'contentStat:actor', 'globalStat', props), condition);
});

test('identity conditions retain valid identity values and comparisons across category changes', () => {
    const condition: Condition = { type: 'globalStat', statId: locationStat.id, comparison: 'notEquals', value: 'town' };
    const props = { globalStats: [locationStat], locations, variableContentType: 'location' as const };
    const identity: Condition = { type: 'contentIdentity', contentType: 'location', comparison: 'notEquals', value: 'town' };
    assert.deepEqual(changeConditionSelect(condition, 'globalStat', 'contentIdentity:location', props), identity);
    assert.deepEqual(changeConditionSelect(identity, 'contentIdentity:location', 'globalStat', props), condition);
});

test('calendar fields keep compatible values and reset incompatible choices', () => {
    const condition: Condition = { type: 'calendar', field: 'day', comparison: 'greaterThan', value: 5 };
    assert.deepEqual(changeConditionSelect(condition, 'day', 'month'), { ...condition, field: 'month' });
    assert.deepEqual(changeConditionSelect(condition, 'day', 'timeOfDay'), { ...condition, field: 'timeOfDay', value: 'morning' });
    assert.deepEqual(changeConditionSelect({ ...condition, field: 'timeOfDay', value: 'night' }, 'timeOfDay', 'dayOfWeek'),
        { ...condition, field: 'dayOfWeek', value: 'monday' });
});

const stageWithFunctions = (functions: Array<Record<string, unknown>>) => ({
    getSave: () => ({ playerId: 'player' }),
    getConfiguration: () => ({ functions, globalStats: [] }),
}) as unknown as React.ComponentProps<typeof ConditionEditor>['stage'];

test('function conditions default from the first non-void function and preserve compatible selections', () => {
    const stage = stageWithFunctions([
        { id: 'fn-void', name: 'Reset', description: '', script: '', returnType: 'void' },
        { id: 'fn-number', name: 'Score', description: '', script: '', returnType: 'number' },
    ]);
    const condition: Condition = { type: 'globalStat', statId: numberStat.id, comparison: 'greaterThan', value: 5 };
    const fnCondition: Condition = { type: 'function', reference: 'function:fn-number', comparison: 'greaterThan', value: 5 };
    assert.deepEqual(changeConditionSelect(condition, 'globalStat', 'function', { globalStats: [numberStat], stage }), fnCondition);
    assert.deepEqual(changeConditionSelect(fnCondition, 'function', 'globalStat', { globalStats: [numberStat], stage }),
        { type: 'globalStat', statId: numberStat.id, comparison: 'greaterThan', value: 5 });
});

test('function conditions reset incompatible comparisons and values for list results', () => {
    const stage = stageWithFunctions([{ id: 'fn-party', name: 'Party', description: '', script: '', returnType: 'actorList' }]);
    const condition: Condition = { type: 'globalStat', statId: numberStat.id, comparison: 'greaterThan', value: 5 };
    assert.deepEqual(changeConditionSelect(condition, 'globalStat', 'function', { globalStats: [numberStat], stage }),
        { type: 'function', reference: 'function:fn-party', comparison: 'contains', value: '' });
});
