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
import { ControlRenderer } from '../src/components/ControlRenderer';
import { OutcomeDisplay } from '../src/components/OutcomeDisplay';
import { OutcomeType } from '../src/content/Outcome';
import { functionReference } from '../src/content/Function';

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
    stage.getPublishedConfiguration = () => configuration;
    stage.getSave = () => save;
    const render = () => renderToStaticMarkup(<TooltipProvider><ActorCard actor={actor} stage={() => stage} /></TooltipProvider>);
    return { actor, configuration, save, stage, render };
};

test('button and stat controls substitute labels and descriptions on each render without changing templates', () => {
    const { configuration, save, stage } = fixture();
    configuration.globalStats = [
        makeStat('Gold', { default: 3 }),
        makeStat('Summary', { type: 'text', default: functionReference('summary') }),
    ];
    configuration.functions = [{ id: 'summary', name: 'Score summary', description: '', returnType: 'text', script: 'return `Gold: ${get("Gold")}`;' }];
    save.globalStatValues = { Gold: 5 };
    const control = new Control({
        label: '{{ Gold }} / {{Summary}} / {{Score summary}}',
        description: '{{user}} has {{global:Gold}} gold. {{Unknown}}',
        statId: 'Gold',
    });
    const render = () => renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
    for (const type of ['button', 'statDisplay', 'statEditor'] as const) {
        control.type = type;
        const html = render();
        assert.match(html, /5 \/ Gold: 5 \/ Gold: 5/);
        assert.match(html, /title="Alice has 5 gold. \{\{Unknown\}\}"/);
    }
    save.globalStatValues.Gold = 0;
    assert.match(render(), /0 \/ Gold: 0 \/ Gold: 0/);
    assert.equal(control.label, '{{ Gold }} / {{Summary}} / {{Score summary}}');
    assert.equal(control.description, '{{user}} has {{global:Gold}} gold. {{Unknown}}');
});

test('button name and stat name fallbacks support tags while empty evaluated labels stay empty', () => {
    const { configuration, stage } = fixture();
    configuration.globalStats = [makeStat('Empty', { type: 'text', default: '' }), makeStat('value', { name: '{{user}} value' })];
    const render = (control: Control) => renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />);
    assert.match(render(new Control({ name: 'Hello {{user}}' })), /Hello Alice/);
    assert.match(render(new Control({ type: 'statDisplay', statId: 'value' })), /Alice value/);
    assert.doesNotMatch(render(new Control({ label: '{{Empty}}', name: 'Do not fall back' })), /Empty|Do not fall back|Button</);
});

test('actor-card controls substitute tags with the displayed actor as char', () => {
    const { configuration, render } = fixture();
    configuration.globalStats = [makeStat('Gold', { default: 3 })];
    configuration.controls = [new Control({
        type: 'actorStatDisplay', statId: 'Health',
        label: '{{char}}: {{char:Health}} / {{Gold}}',
        description: '{{user}} sees {{char}}',
    })];
    const html = render();
    assert.match(html, /Alice: 7 \/ 3/);
    assert.match(html, /title="Alice sees Alice"/);
});

test('settings and outcome controls substitute labels and settings descriptions', () => {
    const { configuration, stage } = fixture();
    configuration.globalStats = [makeStat('Gold', { default: 3 })];
    configuration.controls = [
        new Control({ type: 'settings', statId: 'Gold', label: 'Setting {{Gold}}', description: '{{user}} has {{Gold}}' }),
        new Control({ type: 'statOutcome', statId: 'Gold', label: 'Result {{Gold}}' }),
        new Control({ type: 'statOutcome', outcomeStatTarget: 'actor', statId: 'Health', label: '{{char}} health {{char:Health}}' }),
    ];
    const html = renderToStaticMarkup(<TooltipProvider><SettingsScreen stage={() => stage} onCancel={() => {}} onConfirm={() => {}} setScreenType={() => {}} /></TooltipProvider>);
    assert.match(html, /Setting 3/);
    assert.match(html, /Alice has 3/);
    const outcomes = [
        { type: OutcomeType.PLAYER_STAT, description: '', details: { statName: 'Gold', changeValue: 1 } },
        { type: OutcomeType.ACTOR_STAT, description: '', details: { actorId: 'alice', statName: 'Health', changeValue: 1 } },
    ];
    const outcomeHtml = renderToStaticMarkup(<OutcomeDisplay outcomes={outcomes} stage={() => stage} />);
    assert.match(outcomeHtml, /World · Result 3/);
    assert.match(outcomeHtml, /Alice health 7/);
});

test('control tag evaluation surfaces errors and cannot mutate game state', () => {
    const { configuration, save, stage } = fixture();
    configuration.globalStats = [makeStat('Gold', { default: 3 })];
    configuration.functions = [{ id: 'bad', name: 'Bad', description: '', returnType: 'text', script: 'set("Gold", 100); return "Done";' }];
    const control = new Control({ label: '{{Bad}}' });
    assert.throws(() => renderToStaticMarkup(<ControlRenderer control={control} stage={() => stage} onActivate={() => {}} />), /read-only/);
    assert.deepEqual(save.globalStatValues, {});
});

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

test('actor cards show source attribution with a link icon after all other card content', () => {
    const { actor, configuration, render } = fixture();
    actor.sourcePath = 'SomeAuthor/a-character-with-id-aca19a976af2';
    actor.summary = 'Character summary';
    configuration.controls = [new Control({ type: 'actorStatDisplay', statId: 'Health', label: 'Health' })];

    const html = render();
    assert.match(html, /href="https:\/\/chub.ai\/characters\/SomeAuthor\/a-character-with-id-aca19a976af2"/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /data-testid="LinkIcon"[^]*<\/svg>SomeAuthor<\/a><\/div>$/);
    assert.ok(html.indexOf('Character summary') < html.indexOf('href="https://chub.ai/characters/'));
    assert.ok(html.indexOf('Health') < html.indexOf('href="https://chub.ai/characters/'));
});

test('actor cards omit source attribution when the path is empty or absent in an older save', () => {
    const { actor, render } = fixture();
    assert.doesNotMatch(render(), /chub\.ai\/characters\/|data-testid="LinkIcon"/);

    const restored = Actor.fromSave({ id: actor.id, name: actor.name });
    assert.equal(restored.sourcePath, '');
    Object.assign(actor, restored);
    assert.doesNotMatch(render(), /chub\.ai\/characters\/|data-testid="LinkIcon"/);
});

test('actor source attribution survives construction, cloning, and save round trips', () => {
    const sourcePath = 'SomeAuthor/a-character-with-id-aca19a976af2';
    const actor = new Actor({ name: 'Alice', sourcePath });
    assert.equal(actor.sourcePath, sourcePath);
    assert.equal(new Actor(actor).sourcePath, sourcePath);
    assert.equal(Actor.fromSave(JSON.parse(JSON.stringify(actor))).sourcePath, sourcePath);
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

test('actor stat displays support option labels, checkboxes, references, and numbers', () => {
    const { actor, configuration, render } = fixture();
    configuration.actorStats = [
        makeStat('Mood', { type: 'option', default: 'happy', options: [{ id: 'happy', name: 'Happy', description: '' }] }),
        makeStat('Ready', { type: 'checkbox', default: true }),
        makeStat('Friends', { type: 'actorList', default: [actor.id] }),
        makeStat('Relationship', { default: 7 }),
    ];
    configuration.controls = configuration.actorStats.map(stat => new Control({ type: 'actorStatDisplay', statId: stat.id }));
    const html = render();
    assert.match(html, /Happy/);
    assert.match(html, /True/);
    assert.match(html, /Friends/);
    assert.match(html, /Alice/);
    assert.match(html, /Relationship/);
    assert.match(html, />7</);
});

test('cloning legacy stats drops exposure without creating controls', () => {
    const legacy = { ...makeStat('Legacy'), exposed: { value: true, conditions: [] } };
    assert.equal(Object.hasOwn(cloneStat(legacy), 'exposed'), false);
});
