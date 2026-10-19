import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActorCard } from '../src/components/ActorCard';
import { Stage, GameConfiguration, SaveType } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { Control } from '../src/content/Control';
import { cloneStat, Stat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { TooltipProvider } from '../src/components/TooltipContext';

const makeStat = (id: string, extra: Partial<Stat> = {}): Stat => cloneStat({
    id, name: id, type: 'number', default: 10, guidance: '',
    llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    ...extra,
});

const fixture = () => {
    const actor = new Actor({ id: 'alice', name: 'Alice', statMap: { Health: 7 } });
    const configuration: GameConfiguration = {
        actors: [actor], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [makeStat('Health'), makeStat('Energy')],
        itemStats: [], locationStats: [], globalStats: [], globalStatValues: {}, statUpdateRules: [],
        controls: [], uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-08',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: actor.id, actors: { [actor.id]: actor }, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    const render = () => renderToStaticMarkup(<ActorCard actor={actor} stage={() => stage} />);
    return { actor, configuration, save, stage, render };
};

test('actor cards show age only in calendar mode and retain other metadata in day mode', () => {
    const { actor, configuration, render } = fixture();
    actor.birthDate = '2000-10-09';
    actor.role = 'Friend';
    assert.match(render(), /Friend • Age 25/);

    configuration.dateMode = 'turnBased';
    const html = render();
    assert.doesNotMatch(html, /Age/);
    assert.match(html, /Friend/);
    assert.equal(actor.birthDate, '2000-10-09');
});

for (const isNewGame of [false, true]) {
    for (const birthDate of ['', '2000-10-09']) {
        test(`settings show the birth-date field only in calendar mode (new game: ${isNewGame}, birth date: ${birthDate})`, () => {
            const { actor, configuration, stage } = fixture();
            actor.birthDate = birthDate;
            const renderSettings = () => renderToStaticMarkup(
                <TooltipProvider>
                    <SettingsScreen stage={() => stage} isNewGame={isNewGame}
                        onCancel={() => {}} onConfirm={() => {}} setScreenType={() => {}} />
                </TooltipProvider>,
            );
            const calendarHtml = renderSettings();
            assert.match(calendarHtml, /id="player-birth-date"/);
            assert.match(calendarHtml, birthDate ? /Birth Date \(25 years old\)/ : /Birth Date/);

            configuration.dateMode = 'turnBased';
            const dayHtml = renderSettings();
            assert.doesNotMatch(dayHtml, /player-birth-date|Birth Date|YYYY-MM-DD/);
            assert.match(dayHtml, /id="player-name"/);
            assert.equal(actor.birthDate, birthDate);
        });
    }
}

test('actor cards show only configured controls in priority order with actor values and defaults', () => {
    const { configuration, render } = fixture();
    assert.doesNotMatch(render(), /Health|Energy/);
    configuration.controls = [
        new Control({ type: 'actorStatDisplay', statId: 'Energy', priority: 2 }),
        new Control({ type: 'actorStatDisplay', statId: 'Health', priority: 1 }),
        new Control({ type: 'statDisplay', statId: 'Health', placement: 'top' }),
        new Control({ type: 'actorStatDisplay', statId: 'Missing' }),
    ];
    const html = render();
    assert.ok(html.indexOf('Health') < html.indexOf('Energy'));
    assert.match(html, />7</);
    assert.match(html, />10</);
});

test('actor-card rules react to stat changes, global state, actor identity, and deactivation', () => {
    const { actor, configuration, save, stage, render } = fixture();
    const control = new Control({
        type: 'actorStatDisplay', statId: 'Health',
        availabilityConditions: [[
            { type: 'contentIdentity', contentType: 'actor', comparison: 'equals', value: 'alice' },
            { type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: 'Health', comparison: 'greaterThan', value: 5 },
            { type: 'globalStat', statId: 'Visible', comparison: 'equals', value: true },
        ]],
    });
    configuration.controls = [control];
    save.globalStatValues = { Visible: true };
    assert.match(render(), /Health/);
    actor.statMap.Health = 3;
    assert.doesNotMatch(render(), /Health/);
    actor.statMap.Health = 7;
    save.globalStatValues.Visible = false;
    assert.doesNotMatch(render(), /Health/);
    save.globalStatValues.Visible = true;
    const other = new Actor({ id: 'bob', statMap: { Health: 7 } });
    assert.deepEqual(stage.getVisibleControls('actorCard', other), []);
    assert.deepEqual(stage.getVisibleControls('top'), []);
    assert.deepEqual(stage.getVisibleControls('bottom'), []);
    control.active = false;
    assert.doesNotMatch(render(), /Health/);
});

test('actor stat displays support option labels, checkboxes, references, and reject per-actor stats', () => {
    const { actor, configuration, render } = fixture();
    configuration.actorStats = [
        makeStat('Mood', { type: 'option', default: 'happy', options: [{ id: 'happy', name: 'Happy', description: '' }] }),
        makeStat('Ready', { type: 'checkbox', default: true }),
        makeStat('Friends', { type: 'actorList', default: [actor.id] }),
        makeStat('Relationship', { perActor: true }),
    ];
    configuration.controls = configuration.actorStats.map(stat => new Control({ type: 'actorStatDisplay', statId: stat.id }));
    const html = render();
    assert.match(html, /Happy/);
    assert.match(html, /True/);
    assert.match(html, /Friends/);
    assert.match(html, /Alice/);
    assert.doesNotMatch(html, /Relationship/);
});

test('cloning legacy stats drops exposure without creating controls', () => {
    const legacy = { ...makeStat('Legacy'), exposed: { value: true, conditions: [] } };
    assert.equal(Object.hasOwn(cloneStat(legacy), 'exposed'), false);
});
