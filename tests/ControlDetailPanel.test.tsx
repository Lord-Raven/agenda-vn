import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage, GameConfiguration } from '../src/Stage';
import { Control, ControlType } from '../src/content/Control';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';
import { ControlDetailPanel } from '../src/screens/ControlDetailPanel';
import { ControlRenderer } from '../src/components/ControlRenderer';
import { cloneStat, StatType } from '../src/content/Stat';
import { globalStatReference } from '../src/content/Function';
import { SearchableOptionPicker } from '../src/components/SearchableOptionPicker';
import { StatValueInput } from '../src/components/StatValueInput';
import { normalizeStatShape } from '../src/components/StatEntryEditor';
import { IconPicker, resolveIcon } from '../src/components/StatRating';
import { ContentListPortraits } from '../src/components/ContentListControl';
import { ActorPortrait } from '../src/components/ActorPortrait';
import { ItemPortrait } from '../src/components/ItemPortrait';
import { LocationPortrait } from '../src/components/LocationPortrait';
import { Actor } from '../src/content/Actor';
import { getThumbnailUrl } from '../src/utils/ImageCache';

const createStage = (control: Control) => {
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
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
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
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
    for (const type of ['number', 'checkbox', 'option', 'optionList', 'actorList', 'locationList', 'itemList'] as const) {
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
    assert.match(picker, /data-testid="BuildIcon"/);
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

test('settings controls use the Settings placement and own a description', () => {
    const control = new Control({ type: 'settings', placement: 'top', description: 'Player-facing guidance' });
    assert.equal(control.placement, 'settings');

    const html = renderToStaticMarkup(<ControlDetailPanel control={control} stage={() => createStage(control)} />);
    assert.match(html, /Description/);
    assert.doesNotMatch(html, /Width Weight|Label Icon/);
});

for (const type of ['button', 'statDisplay', 'statEditor', 'actorStatDisplay', 'statOutcome'] satisfies ControlType[]) {
    test(`${type} exposes width weight only for top/bottom controls`, () => {
        const html = renderPanel(type, '', 2.5);
        if (type === 'actorStatDisplay' || type === 'statOutcome') {
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
