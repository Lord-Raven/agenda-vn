import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { isValidElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConditionEditor, createDefaultCondition } from '../src/components/ConditionEditor';
import { ConditionalFlagEditor } from '../src/components/ConditionalFlagEditor';
import { StatUpdateRuleEditor } from '../src/components/StatUpdateRuleEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { ConditionCollection, GlobalStatCondition } from '../src/content/Condition';
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
