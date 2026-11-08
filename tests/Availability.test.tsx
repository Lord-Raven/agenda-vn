import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GameConfiguration, Stage } from '../src/Stage';
import { Actor, ACTOR_SCHEDULE_UNAVAILABLE, resolveActorSchedule } from '../src/content/Actor';
import { ConditionContext, ContentStatCondition } from '../src/content/Condition';
import { isLocationAvailable, isLocationDisabled, isLocationInactive, Location } from '../src/content/Location';
import { cloneStat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ActorScheduleEditor } from '../src/components/ActorScheduleEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { LocationDetailPanel } from '../src/screens/LocationDetailPanel';
import { getMapLinkAvailability, MapLink } from '../src/content/Map';
import { Screen as GameMap } from '../src/content/Screen';
import { DefinedMapView } from '../src/screens/DefinedMapView';
import { ScreenDetailPanel } from '../src/screens/ScreenDetailPanel';
import { ConditionEditor } from '../src/components/ConditionEditor';
import { ReferenceMultiSelect } from '../src/components/UiComponents';

const stat = cloneStat({
    id: 'score', name: 'Local Score', type: 'number', default: 0, guidance: '',
    llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
});

const ownStatCondition = (contentType: 'actor' | 'location'): ContentStatCondition => ({
    type: 'contentStat', contentType, targetId: 'variable',
    statId: stat.id, comparison: 'greaterThanOrEqual', value: 5,
});

test('location availability binds Variable to each evaluated location, without mutating the context', () => {
    const first = new Location({ id: 'first', statMap: { score: 10 } });
    const second = new Location({ id: 'second', statMap: { score: 0 } });
    const context: ConditionContext = {
        locationStats: [stat], atlas: { first, second }, currentLocation: second,
        globalStats: [stat], globalStatValues: { score: 0 },
    };

    for (const location of [first, second]) {
        location.availabilityConditions = { unavailable: [[ownStatCondition('location')]], disabled: [] };
    }
    assert.equal(isLocationInactive(first, context), false);
    assert.equal(isLocationAvailable(first, context), true);
    assert.equal(isLocationInactive(second, context), true);
    assert.equal(isLocationAvailable(second, context), false);

    for (const location of [first, second]) {
        location.availabilityConditions = { unavailable: [], disabled: [[ownStatCondition('location')]] };
    }
    assert.equal(isLocationDisabled(first, context), true);
    assert.equal(isLocationAvailable(first, context), false);
    assert.equal(isLocationDisabled(second, context), false);
    assert.equal(isLocationAvailable(second, context), true);
    assert.equal(context.currentLocation, second);
});

test('location availability preserves defaults, global stats, and explicit location targets', () => {
    const location = new Location({ id: 'local', statMap: { score: 0 } });
    const other = new Location({ id: 'other', statMap: { score: 10 } });
    const context: ConditionContext = {
        locationStats: [stat], atlas: [location, other],
        globalStats: [stat], globalStatValues: { score: 10 },
    };
    assert.equal(isLocationAvailable(location, context), true);
    assert.equal(isLocationDisabled(location, context), false);
    location.availabilityConditions.unavailable = [[{
        type: 'globalStat', statId: stat.id, comparison: 'greaterThanOrEqual', value: 5,
    }]];
    assert.equal(isLocationAvailable(location, context), true);
    location.availabilityConditions.unavailable = [[{ ...ownStatCondition('location'), targetId: other.id }]];
    assert.equal(isLocationAvailable(location, context), true);
    location.active = false;
    assert.equal(isLocationAvailable(location, context), false);
});

test('actor schedule availability already evaluates Variable against the scheduled actor', () => {
    const first = new Actor({
        id: 'first', statMap: { score: 10 },
        schedule: { [ACTOR_SCHEDULE_UNAVAILABLE]: [[ownStatCondition('actor')]] },
    });
    const second = new Actor({ ...first, id: 'second', statMap: { score: 0 } });
    const context = { actorStats: [stat], actors: [first, second], currentActor: second };
    assert.equal(resolveActorSchedule(first, context), ACTOR_SCHEDULE_UNAVAILABLE);
    assert.notEqual(resolveActorSchedule(second, context), ACTOR_SCHEDULE_UNAVAILABLE);
    assert.equal(context.currentActor, second);
});

const createStage = (location: Location): Stage => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [location], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [stat], itemStats: [], locationStats: [stat],
        globalStats: [], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-21',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => ({
        playerId: '', actors: {}, atlas: { [location.id]: location }, inventory: [], screens: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    });
    return stage;
};

for (const isCreatorMode of [true, false]) {
    test(`location availability editor exposes local stats and Variable (creator mode: ${isCreatorMode})`, () => {
        const location = new Location({
            id: 'local', name: 'Test Location',
            availabilityConditions: { unavailable: [[ownStatCondition('location')]], disabled: [] },
        });
        const stage = createStage(location);
        const html = renderToStaticMarkup(<TooltipProvider>
            <LocationDetailPanel location={location} stage={() => stage} isCreatorMode={isCreatorMode} />
        </TooltipProvider>);
        assert.match(html, /value="contentStat:location" selected="">Location Stat/);
        assert.match(html, /value="score" selected="">Local Score/);
        assert.match(html, />Variable</);
    });
}

test('actor schedule editor exposes actor stats and Variable', () => {
    const html = renderToStaticMarkup(<TooltipProvider>
        <ActorScheduleEditor
            schedule={{ [ACTOR_SCHEDULE_UNAVAILABLE]: [[ownStatCondition('actor')]] }}
            locations={[]} globalStats={[]} actorStats={[stat]} onChange={() => {}} />
    </TooltipProvider>);
    assert.match(html, /value="contentStat:actor" selected="">Actor Stat/);
    assert.match(html, /value="score" selected="">Local Score/);
    assert.match(html, />Variable</);
});

const buttonCondition = (value: number): ContentStatCondition => ({
    ...ownStatCondition('location'), targetId: 'local', value,
});
const createMapButton = (patch: Partial<MapLink> = {}): MapLink => ({
    type: 'button', parentId: 'map', childId: '', name: 'Test Button',
    coordinates: { x: 0.5, y: 0.5 }, ...patch,
});
const buttonContext: ConditionContext = {
    locationStats: [stat], atlas: { local: new Location({ id: 'local', statMap: { score: 5 } }) },
};

test('legacy map buttons stay visible and use conditions only to enable clicks', () => {
    assert.deepEqual(getMapLinkAvailability(createMapButton(), buttonContext), { visible: true, enabled: true });
    const button = createMapButton({ conditionCollections: [[buttonCondition(10)]] });
    assert.deepEqual(getMapLinkAvailability(button, buttonContext), { visible: true, enabled: false });
    button.conditionCollections?.push([buttonCondition(5)]);
    assert.deepEqual(getMapLinkAvailability(button, buttonContext), { visible: true, enabled: true });
});

for (const [isCreatorMode, hasLegacyGroup] of [[false, false], [false, true], [true, false], [true, true]] as const) {
    test(`new map button conditions default to visible (creator: ${isCreatorMode}, legacy group: ${hasLegacyGroup})`, () => {
        const stage = createStage(new Location({ id: 'local' }));
        const map = new GameMap({ id: 'map', links: [createMapButton({
            conditionCollections: hasLegacyGroup ? [[buttonCondition(10)]] : [],
        })] });
        stage.getConfiguration().screens = [map];
        const save = { ...stage.getSave(), screens: [map] };
        stage.getSave = () => save;
        stage.updateConfiguration = mock.fn();
        stage.saveGame = mock.fn();
        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
        let renderer: ReactTestRenderer | undefined;
        try {
            act(() => {
                renderer = create(<TooltipProvider><ScreenDetailPanel screen={map} stage={() => stage}
                    isCreatorMode={isCreatorMode} onChange={() => {}} onDeactivate={() => {}} /></TooltipProvider>);
            });
            assert.ok(renderer);
            act(() => renderer!.root.findByProps({ 'aria-label': 'Expand Links' }).props.onClick());
            act(() => renderer!.root.findByProps({ 'aria-label': 'Expand Test Button' }).props.onClick());
            const editor = renderer.root.findAllByType(ConditionEditor).find(node => node.props.collectionCategories);
            assert.ok(editor);
            assert.deepEqual(editor.props.collectionCategoryValues, hasLegacyGroup ? ['enabled'] : []);
            assert.equal(editor.props.collectionCategories[0].value, 'visible');
            const add = renderer.root.findAllByType('button').find(node => node.props['aria-label'] === 'Add condition');
            assert.ok(add);
            act(() => add.props.onClick());
            const expectedModes = hasLegacyGroup ? ['enabled', 'visible'] : ['visible'];
            assert.deepEqual(map.links[0].availabilityModes, expectedModes);
            assert.equal(map.links[0].conditionCollections?.length, hasLegacyGroup ? 2 : 1);
            const restored = new GameMap(JSON.parse(JSON.stringify(map)));
            assert.deepEqual(restored.links[0].availabilityModes, expectedModes);
        } finally {
            if (renderer) act(() => renderer?.unmount());
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
}

for (const isCreatorMode of [true, false]) {
    for (const kind of [undefined, 'location', 'mixed'] as const) {
        test(`map button contents always use the mixed picker (creator: ${isCreatorMode}, kind: ${kind})`, () => {
            const stage = createStage(new Location({ id: 'local' }));
            const map = new GameMap({ id: 'map', links: [createMapButton({
                ...(kind ? { contentList: { kind, values: ['local'] } } : {}),
            })] });
            stage.getConfiguration().screens = [map];
            const save = { ...stage.getSave(), screens: [map] };
            stage.getSave = () => save;
            stage.updateConfiguration = mock.fn();
            stage.saveGame = mock.fn();
            const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
            Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
            let renderer: ReactTestRenderer | undefined;
            try {
                act(() => {
                    renderer = create(<TooltipProvider><ScreenDetailPanel screen={map} stage={() => stage}
                        isCreatorMode={isCreatorMode} onChange={() => {}} onDeactivate={() => {}} /></TooltipProvider>);
                });
                assert.ok(renderer);
                act(() => renderer!.root.findByProps({ 'aria-label': 'Expand Links' }).props.onClick());
                act(() => renderer!.root.findByProps({ 'aria-label': 'Expand Test Button' }).props.onClick());
                assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Button content type' }).length, 0);
                const picker = renderer.root.findByType(ReferenceMultiSelect);
                assert.equal(picker.props.kind, undefined);
                assert.deepEqual(picker.props.values, kind ? ['local'] : []);
                const values = [...picker.props.values, 'actor-id', 'item-id'];
                act(() => picker.props.onChange(values));
                assert.deepEqual(map.links[0].contentList, { kind: 'mixed', values });
                assert.deepEqual(new GameMap(JSON.parse(JSON.stringify(map))).links[0].contentList, { kind: 'mixed', values });
                act(() => picker.props.onChange([]));
                assert.deepEqual(map.links[0].contentList, { kind: 'mixed', values: [] });
            } finally {
                if (renderer) act(() => renderer?.unmount());
                if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
                else Reflect.deleteProperty(globalThis, 'window');
            }
        });
    }
}

test('map buttons evaluate visibility and enabled groups independently', () => {
    for (const enabled of [false, true]) {
        for (const visible of [false, true]) {
            const button = createMapButton({
                conditionCollections: [[buttonCondition(enabled ? 5 : 10)], [buttonCondition(visible ? 5 : 10)]],
                availabilityModes: ['enabled', 'visible'],
            });
            assert.deepEqual(getMapLinkAvailability(button, buttonContext), { enabled, visible });
        }
    }
    const button = createMapButton({
        conditionCollections: [[buttonCondition(10)], [buttonCondition(5)]],
        availabilityModes: ['visible', 'visible'],
    });
    assert.deepEqual(getMapLinkAvailability(button, buttonContext), { enabled: true, visible: true });
    button.conditionCollections = [[buttonCondition(5), buttonCondition(10)]];
    assert.deepEqual(getMapLinkAvailability(button, buttonContext), { enabled: true, visible: false });
});

test('map navigation links retain their existing condition behavior', () => {
    const link = createMapButton({
        type: 'target', childId: 'local',
        conditionCollections: [[buttonCondition(10)]], availabilityModes: ['visible'],
    });
    assert.deepEqual(getMapLinkAvailability(link, buttonContext), { visible: true, enabled: false });
    delete link.type;
    assert.deepEqual(getMapLinkAvailability(link, buttonContext), { visible: true, enabled: false });
});

test('map cloning and JSON round trips preserve independent button availability modes', () => {
    const original = new GameMap({ links: [createMapButton({
        conditionCollections: [[buttonCondition(10)]], availabilityModes: ['visible'],
    })] });
    const cloned = new GameMap(original);
    assert.notEqual(cloned.links[0].availabilityModes, original.links[0].availabilityModes);
    cloned.links[0].availabilityModes![0] = 'enabled';
    assert.deepEqual(original.links[0].availabilityModes, ['visible']);
    const restored = new GameMap(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(getMapLinkAvailability(restored.links[0], buttonContext), { visible: false, enabled: true });
});

test('map rendering hides invisible buttons and their content while keeping disabled buttons', () => {
    const stage = createStage(new Location({ id: 'local', name: 'Hidden Content Location', statMap: { score: 0 } }));
    const map = new GameMap({ id: 'map', links: [
        createMapButton({ name: 'Hidden Button', conditionCollections: [[buttonCondition(10)]], availabilityModes: ['visible'],
            contentList: { kind: 'location', values: ['local'] } }),
        createMapButton({ name: 'Disabled Button', conditionCollections: [[buttonCondition(10)]] }),
        createMapButton({ name: 'Enabled Button', conditionCollections: [[buttonCondition(0)]], availabilityModes: ['visible'] }),
    ] });
    const html = renderToStaticMarkup(<TooltipProvider>
        <DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={false} />
    </TooltipProvider>);
    assert.doesNotMatch(html, /Hidden Button/);
    assert.doesNotMatch(html, /Hidden Content Location/);
    assert.match(html, /aria-label="Disabled Button" disabled=""/);
    assert.match(html, /aria-label="Enabled Button"/);
    assert.doesNotMatch(html, /aria-label="Enabled Button" disabled/);
});

for (const isVerticalLayout of [false, true]) {
    test(`map button contents use unique, overlapping portraits in ${isVerticalLayout ? 'vertical' : 'horizontal'} layouts`, () => {
        const stage = createStage(new Location({ id: 'local', name: 'Local', statMap: {} }));
        const map = new GameMap({ id: 'map', links: [
            createMapButton({ name: 'Locations', contentList: { kind: 'location', values: ['local', 'local', 'other', 'local'] } }),
        ] });
        const html = renderToStaticMarkup(<TooltipProvider>
            <DefinedMapView stage={() => stage} maps={[map]} onAction={() => {}} setScreenType={() => {}} isVerticalLayout={isVerticalLayout} />
        </TooltipProvider>);
        const size = isVerticalLayout ? 28 : 40;
        const markerSize = isVerticalLayout ? 48 : 64;
        assert.equal((html.match(/role="group" aria-label="Locations contents"/g) || []).length, 1);
        assert.equal((html.match(/<div[^>]*role="listitem"/g) || []).length, 2);
        assert.equal((html.match(/data-has-image="false"/g) || []).length, 1);
        assert.ok(html.includes(`translate(-50%, calc(-50% + ${markerSize / 2 + size / 3}px))`));
        assert.ok(html.includes(`width:${size}px;height:${size}px`));
        assert.ok(html.includes(`margin-left:-${Math.round(size * 0.32)}px`));
        assert.doesNotMatch(html, /container-type:inline-size/);
    });
}
