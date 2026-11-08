import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ActorScheduleEditor } from '../src/components/ActorScheduleEditor';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { TooltipProvider } from '../src/components/TooltipContext';
import { VariableContentContext } from '../src/components/VariableContentContext';
import { Stage } from '../src/Stage';
import { ActorSchedule } from '../src/content/Actor';
import { cloneStat } from '../src/content/Stat';
import { functionReference, GameFunction } from '../src/content/Function';
import { variableContentValue } from '../src/content/Condition';

const testSchedulePicker = (source: 'destination' | 'condition') => test(`schedule ${source} Function actor parameters offer Variable and persist it on confirmation`, () => {
    const fn: GameFunction = {
        id: 'destination', name: 'Destination', description: '', returnType: source === 'destination' ? 'location' : 'boolean',
        script: "return arg('Who') ? 'place' : '';",
        parameters: [cloneStat({
            id: 'Who', name: 'Who', type: 'actor', default: '', guidance: '',
            llmSees: { value: false, conditions: [] },
            llmMaintained: { value: false, conditions: [] },
        })],
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => ({ functions: [fn], globalStats: [] } as ReturnType<Stage['getConfiguration']>);
    stage.getSave = () => ({ actors: {}, atlas: {}, inventory: [] } as ReturnType<Stage['getSave']>);
    let schedule: ActorSchedule = { available: source === 'destination' ? [] : [[{
        type: 'function', reference: '', comparison: 'equals', value: true,
    }]] };
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { nodeType: 1, children: [] } } });
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => {
            renderer = create(<TooltipProvider><ActorScheduleEditor
                schedule={schedule} locations={[]} globalStats={[]} actorStats={[]} stage={stage}
                onChange={next => { schedule = next; }}
            /></TooltipProvider>);
        });
        const click = (label: string) => {
            const button = renderer!.root.findAllByType('button').find(candidate =>
                candidate.findAllByType('span').some(span => span.children.includes(label))
                || candidate.children.includes(label));
            assert.ok(button, `Missing button: ${label}`);
            act(() => button.props.onClick());
        };
        const sourcePicker = renderer.root.findAllByType(SearchableOptionPicker).find(picker =>
            picker.props.title === (source === 'destination' ? 'Choose schedule destination' : 'Choose function'));
        assert.ok(sourcePicker);
        act(() => sourcePicker.findByType('button').props.onClick());
        click('Destination(Who)');
        const actorPicker = renderer.root.findAllByType(SearchableOptionPicker).find(picker => picker.props.functionType === 'actor');
        assert.ok(actorPicker);
        act(() => actorPicker.findByType('button').props.onClick());
        click('Variable');
        assert.ok(actorPicker.findAllByType('span').some(span => span.children.includes('Variable')));
        click('Confirm');
        const reference = functionReference(fn.id, { Who: variableContentValue('actor') });
        assert.deepEqual(schedule, source === 'destination' ? { [reference]: [] } : { available: [[{
            type: 'function', reference, comparison: 'equals', value: true,
        }]] });
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
        else Reflect.deleteProperty(globalThis, 'document');
    }
});

testSchedulePicker('destination');
testSchedulePicker('condition');

test('Variable is scoped to scheduling and compatible content picker types', () => {
    const picker = (type: 'actor' | 'item') => <SearchableOptionPicker
        value={variableContentValue('actor')} options={[]} functionType={type} onChange={() => {}}
    />;
    assert.doesNotMatch(renderToStaticMarkup(picker('actor')), /Variable/);
    assert.match(renderToStaticMarkup(<VariableContentContext.Provider value="actor">
        {picker('actor')}
    </VariableContentContext.Provider>), /Selected option: Variable/);
    assert.doesNotMatch(renderToStaticMarkup(<VariableContentContext.Provider value="actor">
        {picker('item')}
    </VariableContentContext.Provider>), /Variable/);
});
