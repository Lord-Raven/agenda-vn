import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { useState } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { ScreenErrorBoundary } from '../src/components/ScreenErrorBoundary';
import { ControlRenderer } from '../src/components/ControlRenderer';
import { Control } from '../src/content/Control';
import { functionReference } from '../src/content/Function';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';

const fixture = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        functions: [{
            id: 'broken', name: 'Station label', returnType: 'text', description: '',
            script: 'return call("StationToLocation");',
        }],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-11-01',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    return { stage, configuration, save };
};

const click = (renderer: ReactTestRenderer, label: string) => {
    const button = renderer.root.findAllByType('button').find(node => node.children.includes(label));
    assert.ok(button, `Missing button: ${label}`);
    act(() => button.props.onClick());
};

test('a bad label function displays an error without unmounting the app and retries after a fix', () => {
    const { stage, configuration, save } = fixture();
    const before = structuredClone(save);
    const control = new Control({ label: '{{Station label}}' });
    const logging = mock.method(console, 'error', () => {});
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => {
            renderer = create(<div>
                <span>App is still running</span>
                <ScreenErrorBoundary onReturnToMenu={() => {}}>
                    <ControlRenderer stage={() => stage} control={control} />
                </ScreenErrorBoundary>
            </div>);
        });
        assert.ok(renderer);
        assert.ok(renderer.root.findByType('pre').children.join('').includes('Unknown function: StationToLocation'));
        assert.equal(renderer.root.findByType('span').children.join(''), 'App is still running');
        assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
        assert.ok(logging.mock.calls.some(call => call.arguments[0] === 'Failed to render screen:'));
        assert.deepEqual(save, before);

        click(renderer, 'Retry');
        assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
        configuration.functions[0].script = 'return "Station";';
        click(renderer, 'Retry');
        assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
        assert.ok(renderer.root.findByType('button').children.includes('Station'));
        assert.equal(control.label, '{{Station label}}');
    } finally {
        if (renderer) act(() => renderer?.unmount());
        logging.mock.restore();
    }
});

test('returning to the menu resets a failed screen boundary and leaves navigation usable', () => {
    const { stage } = fixture();
    const BadReference = () => <div>{String(stage.resolveValue(functionReference('missing'), 'location'))}</div>;
    const App = () => {
        const [screen, setScreen] = useState('map');
        return <ScreenErrorBoundary key={screen} onReturnToMenu={() => setScreen('menu')}>
            {screen === 'map' ? <BadReference /> : <button>Content Management</button>}
        </ScreenErrorBoundary>;
    };
    const logging = mock.method(console, 'error', () => {});
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => { renderer = create(<App />); });
        assert.ok(renderer);
        assert.match(renderer.root.findByType('pre').children.join(''), /Unknown function reference: missing/);
        click(renderer, 'Main Menu');
        assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
        assert.deepEqual(renderer.root.findByType('button').children, ['Content Management']);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        logging.mock.restore();
    }
});

test('the boundary also reports invalid function results and read-only violations without swallowing them', () => {
    const { stage, configuration, save } = fixture();
    const before = structuredClone(save);
    const Value = () => <div>{String(stage.resolveValue(functionReference('broken'), 'text'))}</div>;
    const logging = mock.method(console, 'error', () => {});
    try {
        for (const [script, message] of [
            ['return 42;', /Expected a text function result/],
            ['set("Score", 3); return "Done";', /read-only/],
        ] as const) {
            configuration.functions[0].script = script;
            let renderer: ReactTestRenderer | undefined;
            try {
                act(() => {
                    renderer = create(<ScreenErrorBoundary onReturnToMenu={() => {}}><Value /></ScreenErrorBoundary>);
                });

                assert.ok(renderer);
                assert.match(renderer.root.findByType('pre').children.join(''), message);
                assert.deepEqual(save, before);
                assert.throws(() => stage.resolveValue(functionReference('broken'), 'text'), message);
            } finally {
                if (renderer) act(() => renderer?.unmount());
            }
        }
    } finally {
        logging.mock.restore();
    }
});

test('Main Menu recovers an editor error even when the parent is already on the menu screen', () => {
    const { stage } = fixture();
    const Menu = () => {
        const [editing, setEditing] = useState(false);
        if (editing) {
            stage.resolveValue(functionReference('missing'), 'text');
        }
        return <button onClick={() => setEditing(true)}>Content Management</button>;
    };
    const logging = mock.method(console, 'error', () => {});
    const returnToMenu = mock.fn();
    let renderer: ReactTestRenderer | undefined;
    try {
        act(() => {
            renderer = create(<ScreenErrorBoundary onReturnToMenu={returnToMenu}><Menu /></ScreenErrorBoundary>);
        });
        assert.ok(renderer);
        click(renderer, 'Content Management');
        assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
        click(renderer, 'Main Menu');
        assert.equal(returnToMenu.mock.callCount(), 1);
        assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
        assert.deepEqual(renderer.root.findByType('button').children, ['Content Management']);
    } finally {
        if (renderer) act(() => renderer?.unmount());
        logging.mock.restore();
    }
});
