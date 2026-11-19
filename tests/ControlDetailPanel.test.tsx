import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage, GameConfiguration } from '../src/Stage';
import { Control, ControlType, STAT_DISPLAY_TYPES } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { ControlRenderer } from '../src/components/ControlRenderer';
import { cloneStat, StatType } from '../src/content/Stat';
import { functionReference, functionReferenceArguments, globalStatReference, MARKER_VARIABLE_VALUE } from '../src/content/Function';
import { PickerAllowedOptionsContext, SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { StatValueInput } from '../src/components/StatValueInput';
import { normalizeStatShape } from '../src/components/StatEntryEditor';
import { IconPicker, resolveIcon } from '../src/components/StatRating';
import { ContentListPortraits } from '../src/components/ContentListControl';
import { ActorPortrait } from '../src/components/ActorPortrait';
import { ItemPortrait } from '../src/components/ItemPortrait';
import { LocationPortrait } from '../src/components/LocationPortrait';
import { Actor } from '../src/content/Actor';
import { getThumbnailUrl } from '../src/utils/ImageCache';
import { ReferenceMultiSelect } from '../src/components/UiComponents';
import { createDefaultStatUpdate } from '../src/components/OutcomeEditor';

const createStage = (control: Control) => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [control],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-14',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => ({
        playerId: '', actors: {}, atlas: {}, inventory: [], screens: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    });
    return stage;
};

const renderPanel = (type: ControlType, iconName: string, widthWeight = 1) => {
    const control = new Control({ type, iconName, widthWeight });
    const stage = createStage(control);
    return renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
};

const sourceStat = (id: string, type: StatType, value: string | string[] = '') => cloneStat({
    id, name: `Global ${id}`, type, default: value, guidance: '',
    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
});

test('stat editor picker sources are configured and saved independently of the edited stat', () => {
    const control = new Control({ type: 'statEditor', statId: 'target' });
    const stage = createStage(control);
    const configuration = stage.getConfiguration();
    configuration.globalStats = [sourceStat('target', 'actorList'), sourceStat('crew', 'actorList')];
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => { renderer = create(<ControlDetailPanel control={control} stage={() => stage} />); });
        const root = renderer!.root;
        const checkbox = root.findByProps({ id: `control-picker-source-${control.id}` });
        act(() => checkbox.props.onChange({ target: { checked: true } }));
        const picker = root.findByType(ReferenceMultiSelect);
        act(() => picker.props.onChange([globalStatReference('crew')]));
        act(() => renderer!.unmount());
        renderer = undefined;
        assert.deepEqual(configuration.controls[0].pickerSource, [globalStatReference('crew')]);
        assert.equal(configuration.controls[0].statId, 'target');
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('stat editor resolves its source against current in-game global values', () => {
    const control = new Control({ type: 'statEditor', statId: 'target', pickerSource: [globalStatReference('crew')], contentListDisplay: 'abbreviated' });
    const stage = createStage(control);
    const configuration = stage.getConfiguration();
    configuration.globalStats = [sourceStat('target', 'actorList', []), sourceStat('crew', 'actorList', ['first'])];
    const save = stage.getSave();
    stage.getSave = () => save;
    const resolveValue = stage.resolveValue.bind(stage);
    const resolved: unknown[] = [];
    stage.resolveValue = (value, type, ...rest) => {
        const result = resolveValue(value, type, ...rest);
        if (value === control.pickerSource) resolved.push(result);
        return result;
    };
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => { renderer = create(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />); });
        assert.deepEqual(resolved.at(-1), ['first']);
        save.globalStatValues.crew = ['second'];
        act(() => renderer!.update(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />));
        assert.deepEqual(resolved.at(-1), ['second']);
    } finally {
        if (renderer) act(() => renderer?.unmount());
    }
});

test('option list inputs honor restrictions while retaining selected options', () => {
    const stat = sourceStat('choices', 'optionList', []);
    stat.options = [
        { id: 'crew', name: 'Crew' },
        { id: 'old', name: 'Old choice' },
        { id: 'other', name: 'Other choice' },
    ];
    const render = (value: string[], allowed: string[]) => renderToStaticMarkup(
        <PickerAllowedOptionsContext.Provider value={new Set(allowed)}>
            <StatValueInput stat={stat} value={value} onChange={() => {}} />
        </PickerAllowedOptionsContext.Provider>,
    );
    const html = render(['old'], ['crew']);
    assert.match(html, /Crew/);
    assert.match(html, /Old choice/);
    assert.doesNotMatch(html, /Other choice/);
    assert.doesNotMatch(render([], ['crew']), /Old choice/);
    assert.match(render([], []), /No options available/);
});

test('selected list previews space text fallbacks and overlap only adjacent image avatars', () => {
    const options = [
        { key: 'first', label: 'First', imageUrl: 'first.png' },
        { key: 'second', label: 'Second', imageUrl: 'second.png' },
        { key: 'text', label: 'Text' },
        { key: 'third', label: 'Third', imageUrl: 'third.png' },
        { key: 'fourth', label: 'Fourth', imageUrl: 'fourth.png' },
        { key: 'other-text', label: 'Other' },
        { key: 'overflow', label: 'Overflow' },
    ];
    const html = renderToStaticMarkup(<SearchableOptionPicker multiple
        options={options} values={options.map(option => option.key)} onChange={() => {}} />);
    assert.match(html, />TE<\/span>/);
    assert.match(html, />OT<\/span>/);
    assert.equal((html.match(/<img[^>]*data-has-image="true"/g) || []).length, 4);
    assert.match(html, />\+1<\/span>/);
    assert.match(html, />span\+span\{margin-left:6px;\}/);
    assert.match(html, />span:has\(\[data-has-image="true"\]\)\+span:has\(\[data-has-image="true"\]\)\{margin-left:-8px;\}/);
    assert.doesNotMatch(html, /style="[^"]*margin-left:-/);
});

test('custom portrait avatars overlap only after their images are available', async () => {
    const imageUrl = 'portrait-overlap-test.png';
    const actor = new Actor({
        id: 'actor', name: 'Alice Baker', outfitId: 'default',
        outfits: [{ id: 'default', name: 'Default', description: '', prompts: {}, emotionPack: { base: imageUrl } }],
    });
    const render = () => renderToStaticMarkup(<SearchableOptionPicker multiple
        options={[
            { key: 'actor', label: actor.name, renderAvatar: size => <ActorPortrait actor={actor} size={size} /> },
            { key: 'item', label: 'Item', renderAvatar: size => <ItemPortrait item={{ id: 'item', name: 'Item', imageUrl }} width={size} height={size} /> },
            { key: 'location', label: 'Location', renderAvatar: size => <LocationPortrait location={{ id: 'location', name: 'Location', imageUrl }} width={size} height={size} /> },
        ]}
        values={['actor', 'item', 'location']} onChange={() => {}} />);
    const html = render();
    assert.equal((html.match(/data-has-image="false"/g) || []).length, 3);
    assert.doesNotMatch(html, /<div[^>]*data-has-image="true"/);
    assert.match(html, />AB<\/span>/);
    assert.match(html, /data-testid="Inventory2Icon"/);
    assert.match(html, /data-testid="PlaceIcon"/);

    await getThumbnailUrl(imageUrl, 44);
    const loadedHtml = render();
    assert.equal((loadedHtml.match(/<div[^>]*data-has-image="true"/g) || []).length, 3);
    assert.doesNotMatch(loadedHtml, /data-has-image="false"|>AB<\/span>|data-testid="(?:Inventory2|Place)Icon"/);
});

for (const kind of ['actor', 'item', 'location'] as const) {
    test(`${kind} portrait lists overlap only adjacent images, not missing references`, () => {
        const stage = createStage(new Control());
        const html = renderToStaticMarkup(<ContentListPortraits kind={kind}
            values={['missing-first', 'missing-second']} stage={stage} label="List stat" />);
        assert.equal((html.match(/<div[^>]*role="listitem"/g) || []).length, 2);
        assert.match(html, /\[role="listitem"\]:has\(\[data-has-image="true"\]\)\+\[role="listitem"\]:has\(\[data-has-image="true"\]\)\{margin-left:-6px;\}/);
        assert.equal((html.match(/margin-left:-6px/g) || []).length, 1);
    });

    test(`${kind} map overlays use compact overlapping portraits, including fallbacks`, () => {
        const stage = createStage(new Control());
        const html = renderToStaticMarkup(<ContentListPortraits kind={kind}
            values={['missing-first', 'missing-second']} stage={stage} label="Map contents" variant="overlay" size={28} />);
        assert.equal((html.match(/<div[^>]*role="listitem"/g) || []).length, 2);
        assert.match(html, /\[role="listitem"\]\+\[role="listitem"\]\{margin-left:-9px;\}/);
        assert.match(html, /width:28px;height:28px/);
        assert.doesNotMatch(html, /width:clamp/);
    });
}

for (const kind of ['actor', 'item', 'location'] as const) {
    test(`${kind} pickers label global scalar and list selections rather than treating them as literal IDs`, () => {
        const stage = createStage(new Control());
        const configuration = stage.getConfiguration();
        configuration.globalStats = [sourceStat('single', kind), sourceStat('many', `${kind}List`)];
        const scalar = renderToStaticMarkup(<SearchableOptionPicker
            options={[]} value={globalStatReference('single')} functionType={kind} stage={stage} onChange={() => {}} />);
        assert.match(scalar, /Global single/);
        assert.doesNotMatch(scalar, /Missing or incompatible/);
        const list = renderToStaticMarkup(<SearchableOptionPicker
            multiple options={[]} values={['literal', globalStatReference('single'), globalStatReference('many')]}
            functionType={kind} stage={() => stage} onChange={() => {}} />);
        assert.match(list, /Global single/);
        assert.match(list, /Global many/);
        const wrongType = renderToStaticMarkup(<SearchableOptionPicker
            options={[]} value={globalStatReference('many')} functionType={kind} stage={stage} onChange={() => {}} />);
        assert.match(wrongType, /Missing or incompatible global stat/);
        configuration.globalStats = [];
        const missing = renderToStaticMarkup(<SearchableOptionPicker
            options={[]} value={globalStatReference('single')} functionType={kind} stage={stage} onChange={() => {}} />);
        assert.match(missing, /Missing or incompatible global stat/);
    });
}

test('rating controls render their configured icons in a height-constrained pip grid', () => {
    const control = new Control({
        type: 'statDisplay',
        statId: 'health',
        displayType: 'rating',
        ratingIconName: 'heart',
    });
    const stage = createStage(control);
    stage.getConfiguration().globalStats = [cloneStat({
        id: 'health',
        name: 'Health',
        type: 'number',
        default: 3,
        max: 5,
        guidance: '',
        llmSees: { value: true, conditions: [] },
        llmMaintained: { value: true, conditions: [] },
    })];
    const save = stage.getSave()!;
    stage.getSave = () => ({
        ...save,
        globalStatValues: { health: 3 },
    });

    const html = renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
    assert.match(html, /data-testid="FavoriteIcon"/);
    assert.match(html, /aria-label="Health: 3 of 5"/);
    assert.match(html, /height:32px;[^"]*justify-content:flex-start/);
    assert.match(html, /grid-template-columns:repeat\(5, minmax\(0, 1fr\)\);[^"]*height:100%/);
});

test('text value editors accept global stat references directly and preserve reference-backed stat shapes', () => {
    const stage = createStage(new Control());
    stage.getConfiguration().globalStats = [sourceStat('icon', 'text', 'favorite'), sourceStat('destination', 'location', 'place')];
    const target = sourceStat('target', 'text');
    const html = renderToStaticMarkup(<StatValueInput stat={target} value="" onChange={() => {}} stage={stage} />);
    assert.match(html, /<input/);
    assert.doesNotMatch(html, /<select|Value source/);
    assert.doesNotMatch(html, /globalStat:destination/);
    const selected = renderToStaticMarkup(<StatValueInput stat={target} value={globalStatReference('icon')} onChange={() => {}} stage={stage} />);
    assert.match(selected, /<input[^>]*value="globalStat:icon"/);
    assert.doesNotMatch(selected, /<select|Value source/);
    for (const type of ['number', 'boolean', 'option', 'optionList', 'actorList', 'locationList', 'itemList'] as const) {
        const stat = sourceStat('target', type, globalStatReference('source'));
        assert.equal(normalizeStatShape(stat).default, globalStatReference('source'));
    }
});

test('text global stats provide icon sources and controls reevaluate their current values', () => {
    const stage = createStage(new Control());
    stage.getConfiguration().globalStats = [sourceStat('icon', 'text', 'favorite')];
    const reference = globalStatReference('icon');
    assert.equal(resolveIcon(reference, stage), resolveIcon('favorite'));
    const picker = renderToStaticMarkup(<IconPicker value={reference} stage={stage} onChange={() => {}} />);
    assert.match(picker, />GL<\/span>/);
    assert.match(picker, /Global icon/);
    assert.match(picker, /aria-label="Selected icon: globalStat:icon"/);
    assert.doesNotMatch(picker, /data-testid="BuildIcon"/);
    assert.throws(() => resolveIcon(reference), /A stage is required/);
    const control = new Control({ type: 'button', iconName: reference });
    const render = () => renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
    assert.match(render(), /data-testid="FavoriteBorderIcon"/);
    const save = stage.getSave();
    save.globalStatValues = { icon: 'star' };
    stage.getSave = () => save;
    assert.match(render(), /data-testid="StarIcon"/);
    assert.equal(control.iconName, reference);
    stage.getConfiguration().globalStats = [];
    assert.throws(() => resolveIcon(reference, stage), /Unknown global stat reference/);
});

test('button labels are optional: an icon alone renders an icon-only button with an accessible name', () => {
    const render = (control: Control) => {
        const stage = createStage(control);
        return renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
    };
    const iconOnly = render(new Control({ type: 'button', name: 'Open Map', iconName: 'favorite' }));
    assert.match(iconOnly, /data-testid="FavoriteBorderIcon"/);
    assert.match(iconOnly, /aria-label="Open Map"/);
    assert.doesNotMatch(iconOnly, />Open Map</);
    assert.doesNotMatch(iconOnly, />Button</);
    const labeled = render(new Control({ type: 'button', name: 'Open Map', iconName: 'favorite', label: 'Map' }));
    assert.match(labeled, />Map</);
    assert.doesNotMatch(labeled, /aria-label/);
    assert.match(render(new Control({ type: 'button', name: 'Open Map' })), />Open Map</);
    assert.match(render(new Control({ type: 'button' })), />Button</);
});

for (const placement of ['top', 'bottom'] as const) {
    for (const type of ['button', 'statDisplay', 'statEditor'] as const) {
        test(`${placement} ${type} uses proportional flex sizing for default, larger and smaller weights`, () => {
            for (const widthWeight of [undefined, 0.5, 1, 2]) {
                const control = new Control({ type, placement, widthWeight, statId: 'score', label: 'Score', description: 'Control description' });
                const stage = createStage(control);
                stage.getConfiguration().globalStats = [cloneStat({
                    id: 'score', name: 'Score', type: 'number', guidance: '', default: 10,
                    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
                })];
                const html = renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
                const weight = widthWeight ?? 1;
                assert.ok(html.includes(`flex:${weight} 1 calc(150px * ${weight})`), `Expected flex sizing for weight ${weight}`);
                assert.match(html, /box-sizing:border-box/);
                assert.match(html, /min-width:0/);
                assert.match(html, /Score/);
                assert.match(html, /title="Control description"/);
            }
        });
    }
}

test('carousel list controls reduce vertical padding and reserve room for multiple portraits', () => {
    const control = new Control({ type: 'statDisplay', statId: 'actors' });
    const stage = createStage(control);
    stage.getConfiguration().globalStats = [sourceStat('actors', 'actorList', ['actor-1'])];

    for (const [isVerticalLayout, expectedMinWidth] of [[false, '180px'], [true, '150px']] as const) {
        const html = renderToStaticMarkup(<ControlRenderer
            control={control}
            stage={() => stage}
            isVerticalLayout={isVerticalLayout}
            onActivate={() => {}}
        />);
        assert.match(html, new RegExp(`min-width:${expectedMinWidth}`));
        assert.match(html, /padding:2px (?:10|6)px/);
        assert.match(html, /padding:2px 6px;[^}]*width:max-content/);
        const dimension = isVerticalLayout ? 'clamp(24px, 28cqi, 24px)' : 'clamp(28px, 28cqi, 40px)';
        assert.ok(html.includes(`width:${dimension};height:${dimension}`));
        assert.doesNotMatch(html, /56px/);
    }

    const abbreviated = new Control({ type: 'statDisplay', statId: 'actors', contentListDisplay: 'abbreviated' });
    const abbreviatedHtml = renderToStaticMarkup(<ControlRenderer control={abbreviated} stage={() => stage} onActivate={() => {}} />);
    assert.doesNotMatch(abbreviatedHtml, /min-width:180px|padding:2px 10px/);
});

for (const kind of ['actor', 'item', 'location'] as const) {
    for (const isVerticalLayout of [false, true]) {
        test(`${kind} list controls keep portraits and empty states compact (vertical: ${isVerticalLayout})`, () => {
            const control = new Control({ type: 'statEditor', statId: 'list' });
            const stage = createStage(control);
            const stat = sourceStat('list', `${kind}List`, ['missing']);
            stage.getConfiguration().globalStats = [stat];
            const render = () => renderToStaticMarkup(<ControlRenderer
                control={control} stage={() => stage} isVerticalLayout={isVerticalLayout} onActivate={() => {}}
            />);
            const dimension = isVerticalLayout ? 'clamp(24px, 28cqi, 24px)' : 'clamp(28px, 28cqi, 40px)';
            const html = render();
            assert.ok(html.includes(`width:${dimension};height:${dimension}`));
            assert.match(html, /<div[^>]*role="listitem"/);
            assert.match(html, />Edit Global list</);

            stat.default = [];
            const emptyHtml = render();
            assert.ok(emptyHtml.includes(`height:${dimension}`));
            assert.match(emptyHtml, />None</);
            assert.doesNotMatch(emptyHtml, /<div[^>]*role="listitem"/);
        });
    }
}

test('settings controls use the Settings placement and own a description', () => {
    const control = new Control({ type: 'settings', placement: 'top', description: 'Player-facing guidance' });
    assert.equal(control.placement, 'settings');

    const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => createStage(control)} />);
    assert.match(html, /Description/);
    assert.doesNotMatch(html, /Width Weight|Label Icon/);
});

for (const outcomeStatTarget of ['global', 'actor'] as const) {
    for (const displayType of STAT_DISPLAY_TYPES) {
        test(`${outcomeStatTarget} numeric outcomes expose ${displayType} display settings`, () => {
            const control = new Control({
                type: 'statOutcome', statId: 'score', outcomeStatTarget,
                displayType, displayColor: '#123456', ratingIconName: 'favorite',
            });
            const stage = createStage(control);
            const stats = [sourceStat('score', 'number')];
            if (outcomeStatTarget === 'actor') {
                stage.getConfiguration().actorStats = stats;
            } else {
                stage.getConfiguration().globalStats = stats;
            }
            const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
            assert.match(html, /<label[^>]*>Display<\/label>/);
            for (const option of STAT_DISPLAY_TYPES) {
                assert.ok(html.includes(`<option value="${option}"${option === displayType ? ' selected=""' : ''}>`));
            }
            assert.match(html, /Display Color/);
            assert.match(html, /#123456/);
            if (displayType === 'rating') {
                assert.match(html, /Rating Icon/);
                assert.match(html, /aria-label="Selected icon: favorite"/);
            } else {
                assert.doesNotMatch(html, /Rating Icon/);
            }
        });
    }

    test(`${outcomeStatTarget} nonnumeric outcomes expose color but not numeric display settings`, () => {
        const control = new Control({ type: 'statOutcome', statId: 'text', outcomeStatTarget });
        const stage = createStage(control);
        stage.getConfiguration().globalStats = [sourceStat('text', outcomeStatTarget === 'global' ? 'text' : 'number')];
        stage.getConfiguration().actorStats = [sourceStat('text', outcomeStatTarget === 'actor' ? 'text' : 'number')];
        const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
        assert.match(html, /Display Color/);
        assert.doesNotMatch(html, /<label[^>]*>Display<\/label>|Rating Icon/);
    });
}

for (const type of ['statEditor', 'settings'] as const) {
    test(`${type} does not expose read-only display settings`, () => {
        const control = new Control({ type, statId: 'score' });
        const stage = createStage(control);
        stage.getConfiguration().globalStats = [sourceStat('score', 'number')];
        const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
        assert.doesNotMatch(html, /<label[^>]*>Display<\/label>|Rating Icon|Display Color/);
    });
}

for (const type of ['button', 'statDisplay', 'statEditor', 'card', 'statOutcome'] satisfies ControlType[]) {
    test(`${type} exposes width weight only for top/bottom controls`, () => {
        const html = renderPanel(type, '', 2.5);
        if (type === 'card' || type === 'statOutcome') {
            assert.doesNotMatch(html, /Width Weight/);
        } else {
            assert.match(html, /Width Weight/);
            assert.match(html, /<input(?=[^>]*type="number")(?=[^>]*step="any")(?=[^>]*value="2.5")[^>]*>/);
            assert.match(html, /twice the space/);
        }
    });

    test(`${type} label icons use the picker with the configured selection`, () => {
        const html = renderPanel(type, 'favorite');
        assert.match(html, /Label Icon \(optional\)/);
        assert.match(html, /aria-label="Selected icon: favorite"/);
        assert.match(html, /data-testid="FavoriteIcon"/);
        assert.doesNotMatch(html, /MUI icon name/);
        assert.doesNotMatch(html, /<input[^>]*value="favorite"/);
    });

    test(`${type} label icons allow no icon without defaulting to star`, () => {
        const html = renderPanel(type, '');
        assert.match(html, /aria-label="Pick an icon"/);
        assert.match(html, /data-testid="DoNotDisturbIcon"/);
        assert.doesNotMatch(html, /aria-label="Selected icon: star"/);
    });
}

test('marker editors hide width weight and offer the bound entity in conditions and actions', () => {
    for (const kind of ['actor', 'item', 'location'] as const) {
        const control = new Control({
            type: 'marker', markerInputType: kind,
            availabilityConditions: [[{ type: 'contentStat', contentType: kind, targetId: 'variable', statId: 'score', comparison: 'equals', value: 1 }]],
            actions: [{ id: 'action', kind: 'stat', targetType: kind, targetId: `variable:${kind}`, statId: 'score', operation: 'set', value: 1 }],
        });
        const stage = createStage(control);
        stage.getConfiguration()[`${kind}Stats`] = [sourceStat('score', 'number')];
        const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
        assert.doesNotMatch(html, /Width Weight/);
        assert.equal((html.match(/>Variable</g) || []).length, 2);
    }
});

test('string and screen marker editors expose Variable for icon and text values', () => {
    for (const kind of ['string', 'screen'] as const) {
        const control = new Control({
            type: 'marker', markerInputType: kind, iconName: MARKER_VARIABLE_VALUE,
            availabilityConditions: [[{ type: 'globalStat', statId: 'text', comparison: 'equals', value: MARKER_VARIABLE_VALUE }]],
        });
        const stage = createStage(control);
        stage.getConfiguration().globalStats = [sourceStat('text', 'text')];
        const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => stage} />);
        assert.doesNotMatch(html, /Width Weight/);
        assert.equal((html.match(/>Variable</g) || []).length, 2);
    }
});

test('marker content below stays mixed and survives input type changes', () => {
    const control = new Control({ type: 'marker', markerInputType: 'actor', contentList: { kind: 'actor', values: ['actor-id'] } });
    const stage = createStage(control);
    const configuration = stage.getConfiguration();
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { setTimeout, clearTimeout }) });
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => { renderer = create(<ControlDetailPanel control={control} stage={() => stage} />); });
        const root = renderer!.root;
        const values = ['actor-id', 'item-id', 'location-id', functionReference('contents')];
        act(() => root.findByType(ReferenceMultiSelect).props.onChange(values));
        for (const kind of ['actor', 'item', 'location', 'string', 'screen']) {
            const inputType = root.findAllByType('select').find(select =>
                select.findAllByType('option').some(option => option.props.value === 'string'))!;
            act(() => inputType.props.onChange({ target: { value: kind } }));
            const picker = root.findByType(ReferenceMultiSelect);
            assert.equal(picker.props.kind, undefined);
            assert.deepEqual(picker.props.values, values);
        }
        act(() => renderer!.unmount());
        renderer = undefined;
        assert.deepEqual(configuration.controls[0].contentList, { kind: 'mixed', values });
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('marker card picker saves matching cards and clears them when input type changes', () => {
    const marker = new Control({ type: 'marker', markerInputType: 'actor' });
    const stage = createStage(marker);
    const configuration = stage.getConfiguration();
    configuration.controls.push(
        new Control({ id: 'actor-card', name: 'Actor card', type: 'card', contentType: 'actor' }),
        new Control({ id: 'item-card', name: 'Item card', type: 'card', contentType: 'item' }),
        new Control({ id: 'inactive-card', name: 'Inactive card', type: 'card', contentType: 'actor', active: false }),
        new Control({ id: 'popup', name: 'Popup', type: 'popup' }),
    );
    stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { setTimeout, clearTimeout }) });
    let renderer: ReturnType<typeof create> | undefined;
    try {
        act(() => { renderer = create(<ControlDetailPanel control={marker} stage={() => stage} />); });
        const picker = () => renderer!.root.findByProps({ id: `marker-card-${marker.id}` });
        const optionValues = picker().findAllByType('option').map(option => option.props.value);
        assert.ok(optionValues.includes('actor-card'));
        assert.ok(optionValues.includes('default-actor-card'));
        assert.ok(!optionValues.includes('item-card') && !optionValues.includes('inactive-card') && !optionValues.includes('popup'));
        act(() => picker().props.onChange({ target: { value: 'actor-card' } }));
        act(() => renderer!.unmount());
        renderer = undefined;
        assert.equal(configuration.controls[0].cardControlId, 'actor-card');

        act(() => { renderer = create(<ControlDetailPanel control={configuration.controls[0]} stage={() => stage} />); });
        const input = renderer!.root.findAllByType('select').find(select =>
            select.findAllByType('option').some(option => option.props.value === 'screen'))!;
        act(() => input.props.onChange({ target: { value: 'string' } }));
        assert.equal(picker().props.value, '');
        assert.equal(picker().props.disabled, true);
        act(() => renderer!.unmount());
        renderer = undefined;
        assert.equal(configuration.controls[0].cardControlId, '');
    } finally {
        if (renderer) act(() => renderer?.unmount());
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});

test('marker availability function parameters can select the matching input variable', () => {
    for (const kind of ['actor', 'item', 'location', 'string', 'screen'] as const) {
        const parameterType = kind === 'screen' || kind === 'string' ? 'text' : kind;
        const variable = parameterType === 'text' ? MARKER_VARIABLE_VALUE : `variable:${kind}`;
        const control = new Control({
            type: 'marker', markerInputType: kind,
            availabilityConditions: [[{ type: 'function', reference: functionReference('available'), comparison: 'equals', value: true }]],
        });
        const stage = createStage(control);
        const configuration = stage.getConfiguration();
        configuration.functions = [{
            id: 'available', name: 'Available', description: '', returnType: 'boolean', script: 'return true;',
            parameters: [sourceStat('input', parameterType)],
        }];
        stage.updateConfiguration = updates => { Object.assign(configuration, updates); };
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { setTimeout, clearTimeout }) });
        let renderer: ReturnType<typeof create> | undefined;
        try {
            act(() => { renderer = create(<ControlDetailPanel control={control} stage={() => stage} />); });
            const root = renderer!.root;
            Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { nodeType: 1, children: [] } } });
            const functionPicker = root.findAllByType(SearchableOptionPicker).find(picker => picker.props.title === 'Choose function')!;
            act(() => functionPicker.findByType('button').props.onClick());
            const functionOption = functionPicker.findAllByType('button').find(button =>
                !button.props['aria-label'] && button.findAllByType('span').some(span =>
                    typeof span.props.children === 'string' && span.props.children.startsWith('Available(')))!;
            act(() => functionOption.props.onClick());
            const parameter = functionPicker.findByType(StatValueInput);
            if (parameterType === 'text') {
                act(() => parameter.findAllByType('button').find(button => button.props.children === 'Use Variable')!.props.onClick());
            } else {
                const picker = parameter.findByType(SearchableOptionPicker);
                act(() => picker.findByType('button').props.onClick());
                const variableOption = picker.findAllByType('button').find(button =>
                    !button.props['aria-label'] && button.findAllByType('span').some(span => span.props.children === 'Variable'))!;
                assert.ok(variableOption, `${kind} parameter should offer Variable`);
                act(() => variableOption.props.onClick());
            }
            assert.equal(functionPicker.findByType(StatValueInput).props.value, variable);
            const confirm = functionPicker.findAllByType('button').find(button => button.props.children === 'Confirm')!;
            act(() => confirm.props.onClick());
            Reflect.deleteProperty(globalThis, 'document');
            act(() => renderer!.unmount());
            renderer = undefined;
            const condition = configuration.controls[0].availabilityConditions[0][0];
            assert.equal(condition.type, 'function');
            if (condition.type === 'function') assert.equal(functionReferenceArguments(condition.reference)?.input, variable);
        } finally {
            Reflect.deleteProperty(globalThis, 'document');
            if (renderer) act(() => renderer?.unmount());
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else Reflect.deleteProperty(globalThis, 'window');
            if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
        }
    }
});

test('new actions default to a global stat update, falling back to actor stats', () => {
    const globalStats = [sourceStat('score', 'number')];
    const actorStats = [sourceStat('mood', 'number')];
    const update = createDefaultStatUpdate(globalStats, actorStats);
    assert.equal(update.targetType, 'global');
    assert.equal(update.statId, 'score');
    const actorOnly = createDefaultStatUpdate([], actorStats);
    assert.equal(actorOnly.targetType, 'actor');
    assert.equal(actorOnly.statId, 'mood');
});
