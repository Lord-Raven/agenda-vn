import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameConfiguration, Stage } from '../src/Stage';
import { StatEntryCategory, StatEntryEditor } from '../src/components/StatEntryEditor';
import { TooltipProvider } from '../src/components/TooltipContext';
import { cloneStat } from '../src/content/Stat';
import { DEFAULT_UI_SETTINGS } from '../src/content/Style';

const renderOptions = (type: 'option' | 'optionList', category: StatEntryCategory) => {
    const stat = cloneStat({
        id: 'setting', name: 'Setting', type, guidance: '',
        default: type === 'option' ? 'first-option' : ['first-option'],
        options: [
            { id: 'first-option', name: 'First option', description: 'First description' },
            { id: 'second-option', name: '', description: '' },
        ],
        llmSees: { value: true, conditions: [] },
        llmMaintained: { value: true, conditions: [] },
    });
    const configuration: GameConfiguration = {
        actors: [], items: [], locations: [], maps: [], universalSchedule: {},
        lorebook: [], calendarEvents: [], actorStats: [], itemStats: [], locationStats: [],
        globalStats: [stat], functions: [], globalStatValues: {}, statUpdateRules: [], controls: [],
        uiSettings: DEFAULT_UI_SETTINGS, title: '', titleImageUrl: '', titleImagePrompt: '',
        backgroundImageUrl: '', backgroundImagePrompt: '', startingDate: '2026-10-18',
        artStyle: '', creatorNotes: '', versionNotes: '', castActorIds: [], slideshowLocationIds: [],
        dateMode: 'calendar', timeMode: 'timeOfDay', useEvents: true,
    };
    const stage: Stage = Object.create(Stage.prototype);
    stage.getConfiguration = () => configuration;
    stage.getSave = () => ({
        playerId: '', actors: {}, atlas: {}, inventory: [], maps: [],
        universalSchedule: {}, timeline: [], timestamp: 0, globalStatValues: {},
    });
    return renderToStaticMarkup(
        <TooltipProvider>
            <StatEntryEditor
                stat={stat} index={0} total={1} typeLabel="Stat" category={category}
                collapsed={false} onToggleCollapse={() => {}} onMove={() => {}}
                onRemove={() => {}} onPatch={() => {}}
                selfStats={[stat]} globalStats={[stat]} actorStats={[]}
                conditionActors={[]} valueActors={[]} items={[]} locations={[]}
                stage={() => stage} fieldLabelStyle={{}} inlineFieldStyle={{}}
                inlineFieldTopStyle={{}} compactChipLabelStyle={{}}
            />
        </TooltipProvider>,
    );
};

for (const category of ['global', 'actor', 'location', 'item'] as const) {
    for (const type of ['option', 'optionList'] as const) {
        test(`${category} ${type} options show read-only IDs and accessible bin buttons above their names`, () => {
            const html = renderOptions(type, category);
            assert.match(html, /ID: first-option<\/div><button[^>]*aria-label="Remove option"[^>]*>.*?data-testid="DeleteIcon".*?<\/button><\/div><div[^>]*><label[^>]*>Option Name<\/label>/);
            assert.match(html, /ID: second-option<\/div>/);
            assert.doesNotMatch(html, /Remove Option/);
            assert.doesNotMatch(html, /<input[^>]*value="(?:first|second)-option"/);
            assert.equal((html.match(/aria-label="Remove option"/g) || []).length, 2);
            assert.match(html, /value="First option"/);
            assert.match(html, /First description/);
            assert.doesNotMatch(html, /Per Actor|Maps other actors|target actor being considered/);
            if (category === 'global') {
                assert.match(html, /Default Value Rules/);
            } else {
                assert.doesNotMatch(html, /Default Value Rules/);
                assert.match(html, type === 'option' ? /Default Option/ : /Initially Active/);
            }
        });
    }
}
