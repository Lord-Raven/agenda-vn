import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, Stage } from '../src/Stage';
import { Actor, ACTOR_SCHEDULE_UNAVAILABLE, resolveActorSchedule } from '../src/content/Actor';
import { ConditionContext, ContentStatCondition } from '../src/content/Condition';
import { isLocationAvailable, isLocationDisabled, isLocationInactive, Location } from '../src/content/Location';
import { cloneStat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ActorScheduleEditor } from '../src/components/ActorScheduleEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { LocationDetailPanel } from '../src/screens/LocationDetailPanel';

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
        actors: [], items: [], locations: [location], maps: [], universalSchedule: {},
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
        playerId: '', actors: {}, atlas: { [location.id]: location }, inventory: [], maps: [],
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
