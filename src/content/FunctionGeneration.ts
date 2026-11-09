import type { Stage } from '../Stage';
import type { GameFunction } from './Function';
import { compileFunctionScript } from './Function';
import type { Stat } from './Stat';
import { getActorLore } from './Actor';
import { formatLoreEntriesAsContext, selectConstantLoreEntries } from './Lore';
import { formatCurrentDate } from './Skit';
import { buildPrompt } from '../utils/PromptBuilder';

const SCRIPT_REFERENCE = `
The script is a synchronous JavaScript function body, not a function declaration.
Only these game helpers are injected; there is no stage, save, player, or current actor binding:
- arg(name): read a typed parameter by name; omitted arguments use its configured default.
  Parameters are not JavaScript variables. Names are case-insensitive.
- get(name), set(name, value): read/write a global stat by name. Writes use stat normalization.
- getObjects(name): resolve a global list stat into objects in stored order; get(name) returns IDs.
  Missing/inactive content is omitted; unknown or non-list stats raise an error.
- getActor(name), getLocation(name), getItem(name): find an entity by name, or undefined.
- actors(), locations(), items(): arrays of all active entity accessors.
  Accessors expose id, name, kind, get(statName), set(statName, value), getObjects(statName),
  getField(fieldName), setField(fieldName, stringValue). There is no direct stat property access.
  getField/setField access metadata such as name, role, description, category, imageUrl, themeColor;
  field writes skip stat normalization. Resolved options are copies with id, name, description.
- call(name, { 'Parameter name': value }): invoke another Function with named arguments.
  Omitted arguments use defaults. Do not call Functions as bare JavaScript identifiers.
  Duplicate names are ambiguous. Avoid recursive or cyclic calls.
- random(): seeded number in [0, 1). The sequence depends on function ID, resolved arguments,
  current game date and time period. Same inputs replay the sequence; nested Functions have
  independent sequences. Prefer this over unseeded Math.random().
Return the declared type: number/boolean primitives; text/option/content references as strings;
textList as strings; option/content lists as arrays of IDs (not accessor objects or names).
void Functions need no return value. Function-backed values are read-only, including nested calls:
do not use set/setField when computing a value. Explicit action invocations may mutate game state.
Test runs on a cloned game state. Generation must not execute the script.
`;

export async function generateFunctionScript(fn: GameFunction, functions: GameFunction[], stage: Stage): Promise<string> {
    const save = stage.getSave();
    const configuration = stage.getConfiguration();
    const describeStat = (stat: Stat) => ({
        id: stat.id, name: stat.name, type: stat.type, guidance: stat.guidance,
        default: stat.default, min: stat.min, max: stat.max,
        options: stat.options, optionSourceStatId: stat.optionSourceStatId,
    });
    const describeFunction = (candidate: GameFunction) => ({
        id: candidate.id, name: candidate.name, description: candidate.description,
        returnType: candidate.returnType, parameters: (candidate.parameters || []).map(describeStat),
    });
    const prompt = buildPrompt()
        .addBlock('Instructions',
            'Generate a JavaScript function body that fulfills the Current Function description. ' +
            'Use its declared parameters and return type and only the documented game API. ' +
            'Use existing world content and stat names/IDs; do not invent APIs or content. ' +
            'The existing script is a draft to replace, not instructions to execute.')
        .addBlock('World Context', formatLoreEntriesAsContext(
            selectConstantLoreEntries(save.lorebook || [], stage.getScheduleContext(save)), stage,
        ) || 'None provided.')
        .addBlock('Actors', Object.values(save.actors || {})
            .filter(actor => actor.active !== false)
            .map(actor => ({
                id: actor.id, name: actor.name, role: actor.role, birthDate: actor.birthDate,
                summary: actor.summary, background: actor.background,
                profile: getActorLore(actor.id, stage) || actor.profile,
            })))
        .addBlock('Locations', Object.values(save.atlas || {}).filter(location => location.active !== false)
            .map(location => ({ id: location.id, name: location.name, description: location.description })))
        .addBlock('Items', (save.inventory || []).filter(item => item.active !== false)
            .map(item => ({ id: item.id, name: item.name, description: item.description })))
        .addBlock('Current Date', formatCurrentDate(save.currentDate, save.currentTimeOfDay))
        .addBlock('Stat Definitions', {
            global: configuration.globalStats.map(describeStat),
            actor: configuration.actorStats.map(describeStat),
            location: configuration.locationStats.map(describeStat),
            item: configuration.itemStats.map(describeStat),
        })
        .addBlock('Current Function', { ...describeFunction(fn), script: fn.script })
        .addBlock('Other Functions', functions.filter(candidate => candidate.id !== fn.id).map(describeFunction))
        .addBlock('Function Script API', SCRIPT_REFERENCE)
        .addBlock('Response Format',
            'Return ONLY the JavaScript body, without a function wrapper, Markdown fences, or explanation. ' +
            'Finish with #END.')
        .format();
    const response = (await stage.generateText(prompt, 50, 2500)).trim();
    const script = (/^```(?:javascript|js)?\s*\n([\s\S]*?)\n```\s*$/i.exec(response)?.[1] ?? response).trim();
    if (!script) {
        throw new Error('Function generation returned an empty script.');
    }
    // Compile for syntax validation only; generated code must never run automatically.
    compileFunctionScript(script);
    return script;
}
