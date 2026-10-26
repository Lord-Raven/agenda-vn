import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import React, { isValidElement, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ActorDetailPanel } from '../src/screens/ActorDetailPanel';
import { Actor } from '../src/content/Actor';
import { Emotion } from '../src/content/Emotion';
import { Stage, GameConfiguration, SaveType } from '../src/Stage';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { Button } from '../src/components/UiComponents';

const fixture = () => {
    const actor = new Actor({
        id: 'actor', name: 'Alice', outfitId: 'outfit',
        outfits: [{ id: 'outfit', name: 'Original', description: '', prompts: {}, emotionPack: {} }],
    });
    const configuration: GameConfiguration = {
        actors: [actor], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], globalStatValues: {}, statUpdateRules: [], controls: [], functions: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-26',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: '', actors: { [actor.id]: actor }, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.generationPromises = {};
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    stage.showPriorityMessage = mock.fn();
    stage.saveGame = mock.fn();
    return { actor, stage, configuration, save };
};

// Exercise panel handlers without mounting unrelated editors or Material UI dialogs.
function mountPanel(props: React.ComponentProps<typeof ActorDetailPanel>, alpha = 255) {
    const hooks: { value?: unknown; deps?: React.DependencyList; cleanup?: () => void }[] = [];
    let index = 0;
    let effects: (() => void)[] = [];
    const state = mock.method(React, 'useState', (initial: unknown) => {
        const slot = index++;
        hooks[slot] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [hooks[slot].value, (next: unknown) => {
            hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next;
        }];
    });
    const ref = mock.method(React, 'useRef', (initial: unknown) => {
        const slot = index++;
        hooks[slot] ??= { value: { current: initial } };
        return hooks[slot].value;
    });
    const memo = mock.method(React, 'useMemo', (factory: () => unknown, deps: React.DependencyList) => {
        const slot = index++;
        if (!hooks[slot] || deps.some((dep, i) => !Object.is(dep, hooks[slot].deps?.[i]))) {
            hooks[slot] = { value: factory(), deps };
        }
        return hooks[slot].value;
    });
    const effect = mock.method(React, 'useEffect', (callback: React.EffectCallback, deps?: React.DependencyList) => {
        const slot = index++;
        if (!hooks[slot] || !deps || deps.some((dep, i) => !Object.is(dep, hooks[slot].deps?.[i]))) {
            const previous = hooks[slot];
            hooks[slot] = { deps };
            effects.push(() => {
                previous?.cleanup?.();
                hooks[slot].cleanup = callback() || undefined;
            });
        }
    });
    const globals = ['window', 'document', 'Image'] as const;
    const originals = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
        naturalWidth = 10;
        naturalHeight = 10;
        onload?: () => void;
        set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
        createElement: () => ({ getContext: () => ({
            drawImage() {},
            getImageData: () => ({ data: [0, 0, 0, alpha, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255] }),
        }) }),
    } });
    let tree: ReactNode;
    return {
        render() {
            index = 0;
            effects = [];
            tree = ActorDetailPanel(props);
            effects.forEach(run => run());
        },
        find<P,>(type: React.ElementType<P>, predicate: (props: P) => boolean): P | undefined {
            const visit = (nodes: ReactNode): P | undefined => {
                for (const child of React.Children.toArray(nodes)) {
                    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
                    if (child.type === type && predicate(child.props as P)) return child.props as P;
                    const found = visit(child.props.children);
                    if (found) return found;
                }
            };
            return visit(tree);
        },
        restore() {
            hooks.forEach(hook => hook.cleanup?.());
            for (const method of [state, ref, memo, effect]) method.mock.restore();
            globals.forEach((key, i) => {
                const original = originals[i];
                if (original) Object.defineProperty(globalThis, key, original);
                else Reflect.deleteProperty(globalThis, key);
            });
        },
    };
}

for (const isCreatorMode of [false, true]) {
    for (const outcome of ['success', 'transparent', 'removal-error', 'download-error', 'upload-error'] as const) {
        test(`expression background removal: ${outcome}, creator: ${isCreatorMode}`, async () => {
            const { actor, stage, configuration, save } = fixture();
            const emotion = Object.values(Emotion)[0];
            const uploadedUrl = 'https://storage/original.png';
            const updatedUrl = 'https://storage/transparent.png';
            let uploadCount = 0;
            const upload = mock.method(stage, 'uploadFile', async (_name: string, _file: File) => {
                if (++uploadCount === 1) return uploadedUrl;
                if (outcome === 'upload-error') throw new Error('Upload failed');
                return updatedUrl;
            });
            const remove = mock.method(stage, 'removeBackground', async () => {
                if (outcome === 'removal-error') throw new Error('Removal failed');
                return 'https://processor/output.png';
            });
            const fetchImage = mock.method(globalThis, 'fetch', async () => new Response(
                outcome === 'download-error' ? null : new Blob(['processed'], { type: 'image/png' }),
                { status: outcome === 'download-error' ? 503 : 200 },
            ));
            const errors = mock.method(console, 'error', () => {});
            const panel = mountPanel({ actor, stage: () => stage, isCreatorMode }, outcome === 'transparent' ? 0 : 255);
            try {
                panel.render();
                const opener = panel.find(motion.div, props => React.Children.toArray(props.children)
                    .some(child => isValidElement<{ children?: ReactNode }>(child) && child.props.children === emotion));
                assert.ok(opener);
                opener.onClick?.({} as React.MouseEvent<HTMLDivElement>);
                panel.render();
                const input = panel.find('input', props => props.type === 'file');
                assert.ok(input);
                await input.onChange?.({ target: { files: [new File(['original'], 'expression.png', { type: 'image/png' })] } } as React.ChangeEvent<HTMLInputElement>);
                await new Promise(resolve => setImmediate(resolve));
                panel.render();
                const button = panel.find(Button, props => props.children === 'Remove Background');
                if (outcome === 'transparent') {
                    assert.equal(button, undefined);
                    assert.equal(remove.mock.callCount(), 0);
                    return;
                }
                assert.ok(button);
                const pending = button.onClick?.();
                panel.render();
                assert.equal(panel.find(Button, props => props.children === 'Removing Background...')?.disabled, true);
                assert.equal(actor.outfits[0].emotionPack?.[emotion], uploadedUrl);
                await button.onClick?.();
                await pending;
                panel.render();
                assert.equal(remove.mock.callCount(), 1);
                assert.deepEqual(remove.mock.calls[0].arguments, [uploadedUrl, { throwOnError: true }]);
                const storedActor = isCreatorMode ? configuration.actors[0] : save.actors[actor.id];
                if (outcome === 'success') {
                    assert.equal(storedActor.outfits[0].emotionPack?.[emotion], updatedUrl);
                    assert.equal(panel.find(Button, props => props.children === 'Remove Background'), undefined);
                    assert.equal(upload.mock.callCount(), 2);
                    const [name, file] = upload.mock.calls[1].arguments;
                    assert.notEqual(name, upload.mock.calls[0].arguments[0]);
                    assert.equal(await file.text(), 'processed');
                    assert.equal(file.type, 'image/png');
                } else {
                    assert.equal(actor.outfits[0].emotionPack?.[emotion], uploadedUrl);
                    assert.ok(panel.find(Button, props => props.children === 'Remove Background'));
                    assert.equal(errors.mock.callCount(), 1);
                }
            } finally {
                panel.restore();
                upload.mock.restore();
                remove.mock.restore();
                fetchImage.mock.restore();
                errors.mock.restore();
            }
        });
    }
}

test('strict background removal rejects missing results while legacy calls retain their fallback', async () => {
    const { stage } = fixture();
    Object.defineProperty(stage, 'generator', { value: { removeBackground: async () => undefined } });
    const errors = mock.method(console, 'error', () => {});
    try {
        assert.equal(await stage.removeBackground('original'), 'original');
        await assert.rejects(stage.removeBackground('original', { throwOnError: true }), /updated image/);
    } finally {
        errors.mock.restore();
    }
});
