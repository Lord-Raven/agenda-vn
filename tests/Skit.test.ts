import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { GameConfiguration, SaveType, Stage } from '../src/Stage';
import { Actor } from '../src/content/Actor';
import { Emotion } from '../src/content/Emotion';
import { Location } from '../src/content/Location';
import { OutcomeType } from '../src/content/Outcome';
import { generateSkitScript, Skit } from '../src/content/Skit';
import { cloneStat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';

beforeEach(() => {
    mock.method(console, 'log', () => {});
});
afterEach(() => mock.restoreAll());

const fixture = () => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], screens: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [cloneStat({
            id: 'resolve', name: 'Resolve', type: 'number', default: 0,
            llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
        })], itemStats: [], locationStats: [], globalStats: [cloneStat({
            id: 'gold', name: 'Gold', type: 'number', default: 0,
            llmSees: { value: true, conditions: [] }, llmMaintained: { value: true, conditions: [] },
        })], globalStatValues: {}, statUpdateRules: [], controls: [], functions: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-11-21',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const save: SaveType = {
        playerId: 'player', actors: {
            player: new Actor({ id: 'player', name: 'Player' }),
            ally: new Actor({
                id: 'ally', name: 'Ally',
                outfits: [{ id: 'casual', name: 'Casual' }, { id: 'formal', name: 'Formal' }],
            }),
        },
        atlas: {
            hall: new Location({ id: 'hall', name: 'Hall' }),
            park: new Location({ id: 'park', name: 'Park' }),
        },
        inventory: [], screens: [], universalSchedule: {}, timeline: [], timestamp: 0,
        globalStatValues: {}, currentDate: '2026-11-21', currentTimeOfDay: 'morning',
        lorebook: [], enableTextToSpeech: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => save;
    stage.pushMessage = mock.fn();
    const speak = mock.fn(async () => ({ url: 'audio-url' }));
    Object.defineProperty(stage, 'generator', { value: { speak } });
    const skit = new Skit({ guidance: 'Meet in the hall.', initialActors: ['ally'], initialLocationId: 'hall' });
    return { stage, skit, save, speak };
};

const originalScript = `
<Entry><Speaker>Ally</Speaker><Message>"Hello."</Message>
<Expression><Actor>Ally</Actor><Mood>sad</Mood></Expression>
<OutfitChange><Actor>Ally</Actor><Outfit>Casual</Outfit></OutfitChange>
<Movement><Scene/><Location>Park</Location></Movement>
<Movement><Actor>Ally</Actor><Location>Away</Location></Movement>
<StatChange><Actor>Ally</Actor><Stat>Resolve</Stat><Amount>+1</Amount></StatChange>
<StatChange><Stat>Gold</Stat><Amount>+1</Amount></StatChange>
<NewEvent><Name>Meeting</Name><Date>2026-11-22</Date></NewEvent>
</Entry>
<Entry><Speaker>Ally</Speaker><Message>"Goodbye."</Message>
<Expression><Actor>Ally</Actor><Mood>sad</Mood></Expression>
<OutfitChange><Actor>Ally</Actor><Outfit>Casual</Outfit></OutfitChange>
<Movement><Scene/><Location>Park</Location></Movement>
<Movement><Actor>Ally</Actor><Location>Away</Location></Movement>
<StatChange><Actor>Ally</Actor><Stat>Resolve</Stat><Amount>+1</Amount></StatChange>
</Entry>`;

const revisedCues = `
<Entry><Index>1</Index></Entry>
<Entry><Index>0</Index>
<Expression><Actor>Ally</Actor><Mood>happy</Mood></Expression>
<OutfitChange><Actor>Ally</Actor><Outfit>Formal</Outfit></OutfitChange>
<Movement><Scene/><Location>Here</Location></Movement>
<Movement><Actor>Ally</Actor><Location>Here</Location></Movement>
<StatChange><Actor>Ally</Actor><Stat>Resolve</Stat><Amount>+2</Amount></StatChange>
<StatChange><Stat>Gold</Stat><Amount>+3</Amount></StatChange>
</Entry>`;

test('cue revision replaces metadata by index, resets movement state, and preserves dialogue, audio, and other outcomes', async () => {
    const { stage, skit, speak } = fixture();
    const prompts: string[] = [];
    stage.generateText = async prompt => {
        prompts.push(prompt);
        return prompts.length === 1 ? originalScript : revisedCues;
    };
    const entries = await generateSkitScript(skit, stage);
    assert.equal(prompts.length, 2);
    assert.ok(prompts[1].replace(/\s+/g, '').includes(prompts[0].replace(/\s+/g, '')));
    assert.ok(prompts[1].replace(/\s+/g, '').includes(originalScript.replace(/\s+/g, '')));
    assert.match(prompts[1], /<Index>\s*0\s*<\/Index>/);
    assert.match(prompts[1], /<Index>\s*1\s*<\/Index>/);
    assert.deepEqual(entries.map(entry => [entry.speakerId, entry.message, entry.speechUrl]), [
        ['ally', '"Hello."', 'audio-url'], ['ally', '"Goodbye."', 'audio-url'],
    ]);
    assert.equal(speak.mock.callCount(), 2);
    assert.deepEqual(entries[0].actorEmotions, { ally: Emotion.joy });
    assert.deepEqual(entries[0].actorOutfits, { ally: 'formal' });
    assert.deepEqual(entries[0].updatedActors, ['ally']);
    assert.equal(entries[0].updatedLocationId, 'hall');
    assert.deepEqual(entries[0].outcomes.map(outcome => [outcome.type, outcome.details.changeValue]), [
        [OutcomeType.NEW_EVENT, undefined], [OutcomeType.ACTOR_STAT, 2], [OutcomeType.PLAYER_STAT, 3],
    ]);
    assert.deepEqual(entries[1].actorEmotions, {});
    assert.deepEqual(entries[1].actorOutfits, {});
    assert.equal(entries[1].updatedActors, undefined);
    assert.equal(entries[1].updatedLocationId, undefined);
    assert.deepEqual(entries[1].outcomes, []);
});

test('variable actor properties gate stat visibility and stat changes during skits', async () => {
    for (const [role, allowed] of [['Ranger', true], ['Scholar', false]] as const) {
        const { stage, skit, save } = fixture();
        save.actors.ally.role = role;
        const condition = { type: 'contentStat', contentType: 'actor', targetId: 'variable', statId: '', property: 'role', comparison: 'equals', value: 'Ranger' } as const;
        const stat = stage.getConfiguration().actorStats[0];
        stat.llmSees = { value: true, conditions: [[condition]] };
        stat.llmMaintained = { value: true, conditions: [[condition]] };
        const prompts: string[] = [];
        stage.generateText = async prompt => {
            prompts.push(prompt);
            return prompts.length === 1 ? originalScript : revisedCues;
        };
        const entries = await generateSkitScript(skit, stage);
        assert.equal(prompts[0].includes('These are the established actor-level stats'), allowed);
        assert.equal(entries[0].outcomes.some(outcome => outcome.type === OutcomeType.ACTOR_STAT), allowed);
    }
});

for (const finishFirst of ['speech', 'cues']) {
    test(`speech and cue revision run concurrently and are both awaited (${finishFirst} completes first)`, async () => {
        const { stage, skit, speak } = fixture();
        const speech = Promise.withResolvers<{ url: string }>();
        const cues = Promise.withResolvers<string>();
        const cuesStarted = Promise.withResolvers<void>();
        speak.mock.mockImplementation(() => speech.promise);
        let calls = 0;
        stage.generateText = async () => {
            if (++calls === 1) return originalScript;
            assert.equal(speak.mock.callCount(), 2);
            cuesStarted.resolve();
            return cues.promise;
        };
        let finished = false;
        const pending = generateSkitScript(skit, stage).then(entries => {
            finished = true;
            return entries;
        });
        await cuesStarted.promise;
        if (finishFirst === 'speech') speech.resolve({ url: 'parallel-audio' });
        else cues.resolve(revisedCues);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(finished, false);
        speech.resolve({ url: 'parallel-audio' });
        cues.resolve(revisedCues);
        const entries = await pending;
        assert.equal(entries[0].speechUrl, 'parallel-audio');
        assert.deepEqual(entries[0].actorEmotions, { ally: Emotion.joy });
    });
}

test('failed or unalignable cue revisions log an error and retain the original cues and generated audio', async () => {
    const errors = mock.method(console, 'error', () => {});
    for (const response of [
        new Error('Text service unavailable'),
        '',
        '<Entry><Index>0</Index></Entry>',
        '<Entry><Index>0</Index></Entry><Entry><Index>0</Index></Entry>',
        '<Entry><Index>0</Index></Entry><Entry><Index>2</Index></Entry>',
        '<Entry><Index>0</Index></Entry><Entry></Entry>',
        '<Entry><Index>0</Index><Expression></Entry><Entry><Index>1</Index></Entry>',
        '<Entry><Index>0</Index><Message>Changed dialogue</Message></Entry><Entry><Index>1</Index></Entry>',
    ]) {
        const { stage, skit } = fixture();
        let calls = 0;
        stage.generateText = async () => {
            if (++calls === 1) return originalScript;
            if (response instanceof Error) throw response;
            return response;
        };
        const entries = await generateSkitScript(skit, stage);
        assert.equal(entries[0].speechUrl, 'audio-url');
        assert.deepEqual(entries[0].actorEmotions, { ally: Emotion.sadness });
        assert.deepEqual(entries[0].actorOutfits, { ally: 'casual' });
        assert.deepEqual(entries[0].updatedActors, []);
        assert.equal(entries[0].updatedLocationId, 'park');
        assert.deepEqual(entries[0].outcomes.map(outcome => outcome.details.changeValue), [1, 1, undefined]);
        assert.deepEqual(entries[1].actorEmotions, { ally: Emotion.sadness });
    }
    assert.equal(errors.mock.callCount(), 8);
});

test('only retained entries are indexed, and cue revision still runs with TTS disabled', async () => {
    const { stage, skit, save, speak } = fixture();
    save.enableTextToSpeech = false;
    let calls = 0;
    stage.generateText = async prompt => {
        if (++calls === 1) return `
            <Entry><Speaker>Narrator</Speaker><Message></Message></Entry>
            <Entry><Speaker>Ally</Speaker><Message>Ally smiles.</Message></Entry>
            <Entry><Speaker>Player</Speaker><Message>"Cut this."</Message></Entry>
            <Entry><Speaker>Ally</Speaker><Message>"Also cut."</Message></Entry>`;
        assert.match(prompt, /<Index>\s*0\s*<\/Index>/);
        assert.doesNotMatch(prompt, /<Index>\s*1\s*<\/Index>/);
        return '<Entry><Index>0</Index><Expression><Actor>Ally</Actor><Mood>happy</Mood></Expression></Entry>';
    };
    const entries = await generateSkitScript(skit, stage);
    assert.equal(calls, 2);
    assert.equal(speak.mock.callCount(), 0);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, 'Ally smiles.');
    assert.deepEqual(entries[0].actorEmotions, { ally: Emotion.joy });
});
