import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Stage, GameConfiguration, SaveType } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { createLoreEntry } from '../src/content/Lore';
import { formatCurrentDate } from '../src/content/Skit';
import { cloneStat } from '../src/content/Stat';
import { GameFunction } from '../src/content/Function';
import { generateFunctionScript } from '../src/content/FunctionGeneration';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { FunctionEditor } from '../src/components/FunctionEditor';
import { Button, ConfirmDialog } from '../src/components/UiComponents';

let originalWindow: PropertyDescriptor | undefined;
beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
        configurable: true, value: { addEventListener() {}, removeEventListener() {} },
    });
});
afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
});

const fixture = () => {
    const parameter = cloneStat({
        id: 'amount', name: 'Amount', type: 'number', default: 2, min: 0, max: 10,
        guidance: 'How much gold to grant',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    });
    const fn: GameFunction = {
        id: 'reward', name: 'Reward', description: 'Grant gold', returnType: 'void',
        script: 'set("Gold", 1);', parameters: [parameter],
    };
    const other: GameFunction = {
        id: 'bonus', name: 'Bonus', description: 'Calculate a bonus', returnType: 'number',
        parameters: [parameter], script: 'return 99;',
    };
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [cloneStat({ ...parameter, id: 'gold', name: 'Gold' })], globalStatValues: {},
        statUpdateRules: [], controls: [], functions: [fn, other],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-15',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: 'player', actors: {
            player: new Actor({ id: 'player', name: 'Player', profile: 'A traveler' }),
            ally: new Actor({ id: 'ally', name: 'Ally', summary: 'A friendly guide', background: 'Local' }),
            inactive: new Actor({ id: 'inactive', name: 'Inactive actor', active: false }),
        },
        atlas: {}, inventory: [], screens: [], universalSchedule: {}, timeline: [],
        timestamp: 0, globalStatValues: {}, currentDate: '2026-11-09', currentTimeOfDay: 'morning',
        lorebook: [createLoreEntry({ title: 'World rules', content: 'Gold is scarce.', constant: true })],
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.generateText = mock.fn(async () => 'set("Gold", get("Gold") + arg("Amount"));');
    return { stage, fn, other, configuration };
};

test('function generation includes world, actors, date, typed signatures, stats, and the script API', async () => {
    const { stage, fn, other, configuration } = fixture();
    let prompt = '';
    stage.generateText = mock.fn(async (value, min, max) => {
        prompt = value;
        assert.equal(min, 50);
        assert.equal(max, 2500);
        return 'set("Gold", get("Gold") + arg("Amount"));';
    });
    const script = await generateFunctionScript(fn, [fn, other], stage);
    assert.equal(script, 'set("Gold", get("Gold") + arg("Amount"));');
    for (const context of ['Gold is scarce.', 'Player', 'A friendly guide', 'Local',
        formatCurrentDate('2026-11-09', 'morning'),
        'Reward', 'Grant gold', 'Amount', 'How much gold to grant', '"default":2', '"max":10',
        'Bonus', 'Calculate a bonus', '"returnType":"number"', 'Gold', JSON.stringify(fn.script)]) {
        assert.ok(prompt.includes(context), `Missing context: ${context}`);
    }
    for (const helper of ['arg(name)', 'get(name)', 'set(name, value)', 'getObjects(name)',
        'getActor(name)', 'getLocation(name)', 'getItem(name)', 'actors()', 'locations()', 'items()',
        'call(name', 'random()', 'getField', 'setField', 'read-only', 'seeded']) {
        assert.ok(prompt.includes(helper), `Missing API: ${helper}`);
    }
    assert.ok(!prompt.includes('Inactive actor'));
    assert.ok(!prompt.includes(other.script));
    assert.equal(configuration.functions[0].script, fn.script);
});

test('generation accepts fenced bodies, rejects empty/invalid code, and never executes the result', async () => {
    const { stage, fn } = fixture();
    stage.generateText = async () => '```javascript\nthrow new Error("Not executed");\n```';
    assert.equal(await generateFunctionScript(fn, [fn], stage), 'throw new Error("Not executed");');
    for (const response of ['', '```js\n\n```', 'return (;', 'const get = 1;']) {
        stage.generateText = async () => response;
        await assert.rejects(generateFunctionScript(fn, [fn], stage));
    }
    stage.generateText = async () => { throw new Error('Text service unavailable'); };
    await assert.rejects(generateFunctionScript(fn, [fn], stage), /Text service unavailable/);
});

test('Generate requires confirmation, prevents duplicate requests, and replaces only the body', async () => {
    let resolve!: (body: string) => void;
    const onGenerate = mock.fn(() => new Promise<string>(done => { resolve = done; }));
    const onScriptChange = mock.fn();
    const onTest = mock.fn(() => ({ value: undefined, errors: [] }));
    let renderer!: ReactTestRenderer;
    act(() => {
        renderer = create(<FunctionEditor script="return 1;" onGenerate={onGenerate}
            onScriptChange={onScriptChange} onTest={onTest} />);
    });
    try {
        const clickGenerate = () => act(() => renderer.root.findAllByType(Button)
            .find(button => React.Children.toArray(button.props.children).includes('Generate'))!.props.onClick());
        assert.equal(renderer.root.findByType(ConfirmDialog).props.isOpen, false);
        clickGenerate();
        assert.equal(onGenerate.mock.callCount(), 0);
        assert.equal(renderer.root.findByType(ConfirmDialog).props.isOpen, true);
        act(() => renderer.root.findByType(ConfirmDialog).props.onCancel());
        assert.equal(onGenerate.mock.callCount(), 0);
        clickGenerate();
        let request!: Promise<void>;
        act(() => { request = renderer.root.findByType(ConfirmDialog).props.onConfirm(); });
        assert.equal(onGenerate.mock.callCount(), 1);
        assert.equal(renderer.root.findByType(ConfirmDialog).props.isOpen, false);
        assert.ok(renderer.root.findAllByType(Button).some(button => button.props.disabled));
        act(() => { renderer.root.findByType(ConfirmDialog).props.onConfirm(); });
        assert.equal(onGenerate.mock.callCount(), 1);
        await act(async () => { resolve('return 42;'); await request; });
        assert.equal(onScriptChange.mock.callCount(), 1);
        assert.equal(onScriptChange.mock.calls[0].arguments[0], 'return 42;');
        assert.equal(onTest.mock.callCount(), 0);
    } finally {
        act(() => renderer.unmount());
    }
});

test('generation failures preserve the script and expose an error', async () => {
    const onScriptChange = mock.fn();
    const errorLog = mock.method(console, 'error', () => {});
    let renderer!: ReactTestRenderer;
    act(() => {
        renderer = create(<FunctionEditor script="return 1;" onScriptChange={onScriptChange}
            onGenerate={async () => { throw new Error('Offline'); }}
            onTest={() => ({ value: undefined, errors: [] })} />);
    });
    try {
        await act(async () => { await renderer.root.findByType(ConfirmDialog).props.onConfirm(); });
        assert.equal(onScriptChange.mock.callCount(), 0);
        assert.match(renderer.root.findByProps({ role: 'alert' }).children.join(''), /Offline/);
        assert.equal(errorLog.mock.callCount(), 1);
    } finally {
        act(() => renderer.unmount());
        errorLog.mock.restore();
    }
});

test('late generation results do not overwrite edited scripts or unmounted Functions', async () => {
    for (const unmount of [false, true]) {
        let resolve!: (body: string) => void;
        const onGenerate = () => new Promise<string>(done => { resolve = done; });
        const onScriptChange = mock.fn();
        const props = { onGenerate, onScriptChange, onTest: () => ({ value: undefined, errors: [] }) };
        const errorLog = mock.method(console, 'error', () => {});
        let renderer!: ReactTestRenderer;
        act(() => { renderer = create(<FunctionEditor {...props} script="return 1;" />); });
        let request!: Promise<void>;
        act(() => { request = renderer.root.findByType(ConfirmDialog).props.onConfirm(); });
        try {
            act(() => {
                if (unmount) renderer.unmount();
                else renderer.update(<FunctionEditor {...props} script="return 2;" />);
            });
            await act(async () => { resolve('return 42;'); await request; });
            assert.equal(onScriptChange.mock.callCount(), 0);
            if (!unmount) {
                assert.match(renderer.root.findByProps({ role: 'alert' }).children.join(''), /Your edits were kept/);
            }
        } finally {
            if (!unmount) act(() => renderer.unmount());
            errorLog.mock.restore();
        }
    }
});
