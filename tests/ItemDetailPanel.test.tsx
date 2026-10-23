import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React, { isValidElement, ReactNode } from 'react';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Item, isItemAvailable } from '../src/content/Item';
import { createLoreEntry } from '../src/content/Lore';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { Button, ConfirmDialog, TextInput } from '../src/components/UiComponents';
import { ItemDetailPanel } from '../src/screens/ItemDetailPanel';

const fixture = () => {
    const item = new Item({ id: 'item', name: 'Old name', loreId: 'lore' });
    const lore = { ...createLoreEntry({ type: 'item', title: item.name, content: 'Description' }), id: 'lore' };
    const configuration: GameConfiguration = {
        actors: [], items: [new Item(item)], locations: [], maps: [], universalSchedule: {},
        lorebook: [{ ...lore }], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [], functions: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-23',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: {}, atlas: {}, inventory: [new Item(item)], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
        lorebook: [{ ...lore }],
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    stage.saveGame = mock.fn();
    stage.showPriorityMessage = mock.fn();
    return { stage, configuration, save };
};

// Run the panel's hooks and handlers without mounting its unrelated image and condition editors.
const mountPanel = (props: React.ComponentProps<typeof ItemDetailPanel>) => {
    const hooks: { value?: unknown; deps?: React.DependencyList; cleanup?: () => void }[] = [];
    let index = 0;
    let effects: (() => void)[] = [];
    const stateMock = mock.method(React, 'useState', (initial: unknown) => {
        const slot = index++;
        if (!hooks[slot]) hooks[slot] = { value: typeof initial === 'function' ? initial() : initial };
        return [hooks[slot].value, (next: unknown) => {
            hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next;
        }];
    });
    const refMock = mock.method(React, 'useRef', (initial: unknown) => {
        const slot = index++;
        hooks[slot] ??= { value: { current: initial } };
        return hooks[slot].value;
    });
    const memoMock = mock.method(React, 'useMemo', (factory: () => unknown, deps: React.DependencyList) => {
        const slot = index++;
        if (!hooks[slot] || deps.some((dep, i) => !Object.is(dep, hooks[slot].deps?.[i]))) {
            hooks[slot] = { value: factory(), deps };
        }
        return hooks[slot].value;
    });
    const effectMock = mock.method(React, 'useEffect', (effect: React.EffectCallback, deps?: React.DependencyList) => {
        const slot = index++;
        if (!hooks[slot] || !deps || deps.some((dep, i) => !Object.is(dep, hooks[slot].deps?.[i]))) {
            const previous = hooks[slot];
            hooks[slot] = { deps };
            effects.push(() => {
                previous?.cleanup?.();
                hooks[slot].cleanup = effect() || undefined;
            });
        }
    });
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
    let tree: ReactNode;
    const render = () => {
        index = 0;
        effects = [];
        tree = ItemDetailPanel(props);
        effects.forEach(effect => effect());
    };
    const find = <P,>(type: React.ElementType<P>, predicate: (props: P) => boolean = () => true): P => {
        const visit = (node: ReactNode): P | undefined => {
            for (const child of React.Children.toArray(node)) {
                if (!isValidElement<{ children?: ReactNode }>(child)) continue;
                if (child.type === type && predicate(child.props as P)) return child.props as P;
                const found = visit(child.props.children);
                if (found) return found;
            }
        };
        const found = visit(tree);
        assert.ok(found, 'Expected panel control');
        return found;
    };
    const unmount = () => {
        hooks.forEach(hook => {
            hook.cleanup?.();
            hook.cleanup = undefined;
        });
    };
    return {
        render, find, unmount,
        restore: () => {
            unmount();
            stateMock.mock.restore();
            refMock.mock.restore();
            memoMock.mock.restore();
            effectMock.mock.restore();
            if (originalWindow) {
                Object.defineProperty(globalThis, 'window', originalWindow);
            } else {
                Reflect.deleteProperty(globalThis, 'window');
            }
        },
    };
};

for (const isCreatorMode of [false, true]) {
    for (const pendingRename of [false, true]) {
        for (const sharedLore of [false, true]) {
            test(`item deletion persists through unmount (creator: ${isCreatorMode}, pending rename: ${pendingRename}, shared lore: ${sharedLore})`, () => {
                const { stage, configuration, save } = fixture();
                const source = isCreatorMode ? configuration.items : save.inventory;
                if (sharedLore) source.push(new Item({ id: 'other', name: 'Other', loreId: 'lore' }));
                const onDeactivate = mock.fn();
                const panel = mountPanel({ item: source[0], stage: () => stage, isCreatorMode, onDeactivate });
                try {
                    panel.render();
                    if (pendingRename) {
                        panel.find(TextInput, props => props.placeholder === 'Item name').onChange?.({
                            target: { value: 'New name' },
                        } as React.ChangeEvent<HTMLInputElement>);
                        panel.render();
                    }
                    panel.find(Button, props => props.children === 'Delete').onClick?.();
                    panel.render();
                    assert.equal(panel.find(ConfirmDialog).isOpen, true);
                    assert.equal(source[0].active, true);
                    panel.find(ConfirmDialog).onConfirm();
                    panel.unmount();

                    const items = isCreatorMode ? configuration.items : save.inventory;
                    const lorebook = isCreatorMode ? configuration.lorebook : save.lorebook;
                    assert.equal(items[0].active, false);
                    assert.equal(items[0].name, pendingRename ? 'New name' : 'Old name');
                    assert.equal(isItemAvailable(new Item(JSON.parse(JSON.stringify(items[0]))), {}), false);
                    assert.deepEqual(items.filter(item => item.active !== false).map(item => item.id), sharedLore ? ['other'] : []);
                    assert.equal(lorebook?.length, sharedLore ? 1 : 0);
                    assert.deepEqual(onDeactivate.mock.calls.map(call => call.arguments), [['item']]);
                    const untouched = isCreatorMode ? save.inventory : configuration.items;
                    assert.equal(untouched[0].active, true);
                    assert.equal((isCreatorMode ? save.lorebook : configuration.lorebook)?.length, 1);
                } finally {
                    panel.restore();
                }
            });
        }
    }

    test(`canceling item deletion retains normal autosave on unmount (creator: ${isCreatorMode})`, () => {
        const { stage, configuration, save } = fixture();
        const source = isCreatorMode ? configuration.items : save.inventory;
        const onDeactivate = mock.fn();
        const panel = mountPanel({ item: source[0], stage: () => stage, isCreatorMode, onDeactivate });
        try {
            panel.render();
            panel.find(TextInput, props => props.placeholder === 'Item name').onChange?.({
                target: { value: 'New name' },
            } as React.ChangeEvent<HTMLInputElement>);
            panel.render();
            panel.find(Button, props => props.children === 'Delete').onClick?.();
            panel.render();
            panel.find(ConfirmDialog).onCancel();
            panel.render();
            assert.equal(panel.find(ConfirmDialog).isOpen, false);
            panel.unmount();
            const items = isCreatorMode ? configuration.items : save.inventory;
            assert.equal(items[0].name, 'New name');
            assert.equal(items[0].active, true);
            assert.equal((isCreatorMode ? configuration.lorebook : save.lorebook)?.length, 1);
            assert.equal(onDeactivate.mock.callCount(), 0);
        } finally {
            panel.restore();
        }
    });
}
