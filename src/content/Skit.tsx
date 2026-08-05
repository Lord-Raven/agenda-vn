import { Emotion, EMOTION_MAPPING } from "./Emotion";
import { v4 as generateUuid } from 'uuid';
import { Outcome, OutcomeType } from "./Outcome";
import { Stage } from "../Stage";
import { Actor, findBestNameMatch, getActorLore } from "./Actor";
import { getLocationDescription } from "./Location";
import { MAX_ENTRIES } from "./Lore";
import {buildPrompt, PromptBuilder} from "../utils/PromptBuilder.js";
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    parseStructuredResponse,
    parseXmlTagsToObjects,
    StructuredFieldDefinition,
} from "../utils/StructuredResponse.js";

function renderContextSegment(segment: any): string {
    if (typeof segment.body === 'string') {
        return segment.body;
    }
    if (Array.isArray(segment.body)) {
        return segment.body.map((child: any) => `${child.title}:\n${renderContextSegment(child)}`).join('\n\n');
    }
    return '';
}

const getDayDifference = (startDate: string, endDate: string): number => {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 0;
    }
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
};

export enum SkitType {
    INTRO = 'INTRO',
    SOCIAL = 'SOCIAL',
    EXPEDITION = 'EXPEDITION',
    DISCOVERY = 'DISCOVERY',
}

export class Skit {
    id: string = '';
    skitType: SkitType = SkitType.SOCIAL;
    guidance: string = ''; // Optional guidance for the goal of this skit.
    script: ScriptEntry[] = [];
    initialActors: string[] = []; // List of Actor IDs present in this skit
    initialLocationId: string = ''; // Initial location for the skit, can be used to set background or context
    summary: string = ''; // Final summary of this skit
    over: boolean = false; // Whether this skit has concluded. This flag is set upon closing a skit.
    currentIndex: number = 0;
    
    constructor(props: any) {
        Object.assign(this, props);
        // Generate ID if not provided, using the first non-host/non-player actor as context
        if (!this.id) {
            this.id = generateUuid();
        }
    }
}

export class ScriptEntry {
    speakerId: string = ''; // Actor ID of speaker
    message: string = ''; // Message content for this script entry
    speechUrl: string = ''; // Optional URL for text-to-speech audio
    actorEmotions: {[key: string]: Emotion} = {}; // Map of emotion changes by actor ID
    actorOutfits: {[key: string]: string} = {}; // Map of outfit changes by actor ID
    updatedActors?: string[]; // List of Actor IDs now in the skit as of this entry; if undefined, assume same as previous entry
    updatedLocationId?: string; // Updated location for this entry, if any; if undefined, assume same as previous entry
    outcomes: Outcome[] = []; // Optional array of outcomes or consequences resulting from this script entry; can be things like finding an item, maybe a stat or relationship change, etc.
    endScene?: boolean = false; // Optional flag to indicate if this entry ends the scene

    constructor(props: any) {
        Object.assign(this, props);
    }
}

const SKIT_GUIDANCE_FIELDS: StructuredFieldDefinition[] = [
    {
        key: 'guidance',
        label: 'GUIDANCE',
        description: 'A concise guidance summary for the upcoming scene: plot goals, challenges, slice-of-life vignettes, or intimate moments.',
    },
    {
        key: 'participants',
        label: 'PARTICIPANTS',
        description: 'Comma-separated character names selected from Available Characters who will participate in the scene.',
    },
];

    
// Returns the last emotion for the given actor in the skit up to the current index, or neutral if none found.
export const determineEmotion = (actorId: string, skit: Skit, index: number): Emotion => {
    let emotion = Emotion.neutral;
    for (let i = index; i >= 0; i--) {
        const line = skit.script[i];
        if (line && line.actorEmotions && line.actorEmotions[actorId]) {
            emotion = line.actorEmotions[actorId];
            break;
        }
    }
    return emotion;
}

export const determineOutfit = (actorId: string, skit: Skit, index: number): string => {
    let outfitId = '';
    for (let i = index; i >= 0; i--) {
        const line = skit.script[i];
        if (line && line.actorOutfits && line.actorOutfits[actorId]) {
            outfitId = line.actorOutfits[actorId];
            break;
        }
    }
    return outfitId;
}

export function getCurrentActors(skit: Skit, upToEntryIndex: number): string[] {
    let currentActors: string[] = [...skit.initialActors];
    for (let i = 0; i <= upToEntryIndex && i < skit.script.length; i++) {
        const entry = skit.script[i];
        if (entry.updatedActors) {
            currentActors = [...entry.updatedActors];
        }
    }
    return currentActors;
}

export function getCurrentOutfits(skit: Skit, stage: Stage, upToEntryIndex: number): {[actorId: string]: string} {

    return getCurrentActors(skit, upToEntryIndex).reduce((outfits, actorId) => {
        outfits[actorId] = determineOutfit(actorId, skit, upToEntryIndex);
        return outfits;
    }, {} as {[actorId: string]: string});
}

export function getCurrentLocation(skit: Skit, upToEntryIndex: number): string {
    let currentLocation: string = skit.initialLocationId;
    for (let i = 0; i <= upToEntryIndex && i < skit.script.length; i++) {
        const entry = skit.script[i];
        if (entry.updatedLocationId) {
            currentLocation = entry.updatedLocationId;
        }
    }
    return currentLocation;
}

function buildScriptLog(skit: Skit, additionalEntries: ScriptEntry[] = [], stage?: Stage): string {
    return ((skit.script && skit.script.length > 0) || additionalEntries.length > 0) ?
        [...skit.script, ...additionalEntries].map(e => {
            const emotionText = Object.entries(e.actorEmotions || {}).map(([actorId, emotion]) => {
                const actor = stage?.getSave().actors?.[actorId];
                return actor ? `<Expression><Actor>${actor.name}</Actor><Mood>${emotion}</Mood></Expression>` : '';
            }).join('');
            const wearsText = Object.entries(e.actorOutfits || {}).map(([actorId, outfitId]) => {
                const actor = stage?.getSave().actors?.[actorId];
                const outfit = actor?.outfits.find(o => o.id === outfitId);
                return actor && outfit ? `<OutfitChange><Actor>${actor.name}</Actor><Outfit>${outfit.name}</Outfit></OutfitChange>` : '';
            }).join('');
            return `<Entry><Speaker>${stage?.getSave().actors?.[e.speakerId]?.name.toUpperCase() || e.speakerId || 'NARRATOR'}</Speaker>${emotionText}${wearsText}<Message>${e.message}</Message></Entry>`;
        }).join('\n')
        : '(None so far)';
}

function flattenContextSegments(segments: Array<{ title: string; body: string | any[] }> = [], depth = 0): string {
    const prefix = '  '.repeat(Math.max(depth, 0));
    return segments.map(segment => {
        const titleLine = `${prefix}${segment.title}:`;
        if (typeof segment.body === 'string') {
            return `${titleLine}\n${prefix}${segment.body}`;
        }

        if (Array.isArray(segment.body)) {
            const nested = flattenContextSegments(segment.body as Array<{ title: string; body: string | any[] }>, depth + 1);
            return `${titleLine}\n${nested}`;
        }

        return titleLine;
    }).join('\n');
}

export function buildPremise(playerName: string, stage?: any): string {
    // Build world context from configuration if stage is provided
    let worldContext = '';
    if (stage) {
        const contextSegments = (stage.getConfiguration?.()?.context || []);
        worldContext = contextSegments.map((segment: any) => renderContextSegment(segment)).join('\n\n');
    }
    
    // Fallback generic premise if no configuration context available
    if (!worldContext) {
        worldContext = `This is a science-fantasy game set in a unique world. The player is one of many characters navigating this world, interacting with others and embarking on expeditions to discover artifacts and remnants of the old world.`;
    }
    
    return `${worldContext}\n\nThe player of this game, ${playerName}, is one of the citizens of this world. ` +
            `This game revolves around ${playerName}'s journey through this world, as they interact with other characters or embark on dangerous or intriguing expeditions.`;
}

export function generateContext(skit: Skit|undefined, stage: Stage, historyLength: number): ((b: PromptBuilder) => any) {
    const playerName = stage.getPlayerActor()?.name || 'J. Doe';
    const save = stage.getSave();
    const location = skit ? save.atlas[skit.initialLocationId] : undefined;
    const pastEvents = (save.timeline ? save.timeline.slice(-historyLength) : []).filter(e => e.skit !== skit);
    const currentActors = skit ? getCurrentActors(skit, skit.script.length - 1).map(actorId => save.actors?.[actorId]).filter(actor => actor !== undefined && actor !== stage.getPlayerActor()) as Actor[] : [];
    const lorebook = save.lorebook || [];
    const agendaConfig = save.agendaConfig;
    const agendaContext = flattenContextSegments(agendaConfig?.context || []);
    const selectedSettingContext = (agendaConfig?.settings || []).map(setting => {
        const selectedOptionName = agendaConfig?.selectedSettings?.[setting.title] || '';
        if (!selectedOptionName) {
            return '';
        }

        const selectedSegment = setting.options?.[selectedOptionName];
        if (!selectedSegment) {
            return '';
        }

        const renderedSegment = flattenContextSegments([selectedSegment]);
        return `${setting.title}: ${selectedOptionName}\n${renderedSegment}`;
    }).filter(Boolean).join('\n\n');

    // For lorebook context, we go through lorebook entries and add them 
    let triggeredLore = lorebook.filter(lore => {
            if (!lore.enabled || (!['character', 'location', 'other'].includes(lore.type) && !currentActors.some(actor => actor.name.toLowerCase() === lore.type.toLowerCase()))) {
                return false;
            }

            if (lore.type === 'character' && currentActors.some(actor => actor.name.toLowerCase() === lore.title.toLowerCase())) {
                return false; // Skip inclusion of lore entries for characters currently present in the scene, as they are included in that character's content.
            }

            if (lore.constant) {
                return true;
            }

            return lore.triggers.some(trigger => {
                    // Scan lore.scanDepth entries of the current skit for details that match this trigger
                    for (let i = skit ? skit.script.length - 1 : 0; i >= Math.max(0, (skit ? skit.script.length - lore.scanDepth : 0)); i--) {
                        if((skit?.script[i]?.message || '').toLowerCase().includes(trigger.toLowerCase())) {
                            return true;
                        }
                    }
                    return false;
            });
    }).sort((a, b) => a.insertionOrder - b.insertionOrder);

    // Run probabilities on triggeredLore, and remove entries that don't pass. For each record, look at the entry's prorobability (100 by default) and run a calculation to determine whether to keep it in the context or not. This adds an element of variability and surprise to the lore that can be included in the context, while still prioritizing important lore with higher probability and insertion order.
    triggeredLore = triggeredLore.filter(lore => Math.random() * 100 <= lore.probability);

    // Remove (if present) lore entry for the current location (which is referenced in detail below):
    if (location) {
        const locationLoreId = findBestNameMatch(location.name, triggeredLore, ['title'])?.id || '';
        triggeredLore = triggeredLore.filter(lore => lore.id !== locationLoreId);
    }
    // Remove (if present) lore entries for current actors (which are referenced in detail below):
    if (currentActors.length > 0) {
        const currentActorLoreIds = currentActors.map(actor => findBestNameMatch(actor.name, triggeredLore.filter(lore => lore.type === 'character'), ['title'])?.id || '');
        triggeredLore = triggeredLore.filter(lore => !currentActorLoreIds.includes(lore.id));
    }

    // If triggeredLore has more than MAX_ENTRIES entries, we cut it down to MAX_ENTRIES based on priority (higher priority wins).
    if (triggeredLore.length > MAX_ENTRIES) {
        triggeredLore = triggeredLore.sort((a, b) => b.priority - a.priority).slice(0, MAX_ENTRIES);
    }

    // Finally, order the triggeredLore list by insertion order, so that earlier lore entries appear first in the context.
    triggeredLore = triggeredLore.sort((a, b) => a.insertionOrder - b.insertionOrder);

    return (builder: PromptBuilder) => builder.addBlock(`Premise`, buildPremise(playerName, stage))
        .addBlock(`Agenda Context`, agendaContext || 'None.')
        .addBlock(`Selected Custom Settings`, selectedSettingContext || 'None.')
        .addBlock(`Lore Entries`, (builder) => {
            // Add each lore entry as a separate block, with the title and content.
            triggeredLore.forEach(lore => {
                builder.addBlock(`${lore.type}_${lore.title}`, lore.content);
            });
        }).addBlock(`Recent Events`, (builder) => {
            pastEvents.forEach((event, index) => {
                if (event.skit) {
                    const locationName = (event.skit.initialLocationId ? save.atlas[event.skit.initialLocationId]?.name : '') ?? 'Unknown Location';
                    const daysAgo = event.date && save.currentDate
                        ? getDayDifference(event.date, save.currentDate)
                        : Math.max(1, index + 1);
                    builder.addBlock(`Event_${index + 1}`, `Scene in ${locationName} (${daysAgo} days ago):\n` +
                        (event.skit.summary ? `Summary: ${event.skit.summary}` : `Script:\n${buildScriptLog(event.skit, [], stage)}`));
                }
            });
        }).addBlock(`Current Location`, `The following scene is set in ` +
            `${location?.name || 'Unknown Location'}. ${getLocationDescription(location?.id || '', stage) || 'No description available.'}`
        ).addBlock(`Player Profile`,
            `${playerName}:\n  ${stage.getPlayerActor().profile}`
        ).addBlock(`Characters Present`, (builder) => {
            if (skit) {
                currentActors.forEach(actor => {
                    const currentOutfit = actor.outfits.find(a => a.id === determineOutfit(actor.id, skit, skit.script.length - 1)) ?? actor.outfits[0];
                    const otherOutfits = actor.outfits.filter(o => o.id !== currentOutfit?.id && o.emotionPack['neutral']);
                    builder.addBlock(`${actor.name}`, `  Current Outfit (${currentOutfit.name}): ${currentOutfit.description}\n` +
                        (otherOutfits.length > 0 ? `  Other Outfits: ${otherOutfits.map(o => o.name).join(', ')}\n` : '') +
                        `  Profile: ${actor.profile}\n` +
                        `  Lore: ${getActorLore(actor.id, stage)}`
                    );
                })
            }
        });
}

export async function generateSkitScript(skit: Skit, stage: Stage): Promise<ScriptEntry[]> {
    const playerName = stage.getPlayerActor()?.name || 'J. Doe';
    const save = stage.getSave();

    if (!skit.guidance) {
        // Generate guidance and initial actors for this skit based on its type and the current context
        console.log('Generating skit guidance...');
        let attempts = 3;
        const availableActors = Object.values(stage.getSave().actors)
            .filter(actor => actor.id !== stage.getSave().playerId && actor.active);
        while (attempts > 0) {
            const response = await stage.generateText(
                buildPrompt()
                    .addBlock(`Instructions`,
                        `This is a request for structured content for a game. Given the context and location, ` +
                        `use the format below to output guidance for the upcoming scene: plot goals, challenges, slice-of-life vignettes, or intimate moments. ` +
                        `Then, name the characters from the Available Characters list that will participate.`)
                    .addBlock('Location',
                        `  ${skit.initialLocationId ? (save.atlas?.[skit.initialLocationId]?.name || 'Unknown Location') : 'Unknown Location'}\n` +
                        `    ${getLocationDescription(skit.initialLocationId, stage) || 'No description available.'}`)
                    .addBlock('Available Characters',
                        skit.initialActors.map(actorId => {
                            const actor = stage.getSave().actors?.[actorId];
                            return actor ? `  ${actor.name}\n    ${getActorLore(actor.id, stage)}` : '';
                        }))
                    .addBlock('Response Format',
                        buildStructuredResponseFormat(SKIT_GUIDANCE_FIELDS, { includeEndTag: true }))
                    .addBlock('Example Response',
                        buildStructuredExampleResponse(
                            SKIT_GUIDANCE_FIELDS,
                            {
                                guidance: `${playerName} is relaxing at the Amber Drop when Cyanea walks in. Persephone hovers nearby, pretending not to listen to their exchange, but inevitably cutting in when things take an unexpected turn.`,
                                participants: 'Cyanea, Persephone',
                            },
                            { includeEndTag: true }
                        ))
                    .addBlock('Additional Context',
                        generateContext(skit, stage, 5))
                    .format(),
                10, 400
            ).catch(err => {
                console.error('Error generating skit guidance: ', err);
            });
            attempts--;
            if (response && response.trim().length > 0) {
                console.log('Generated skit guidance: ', response.trim());
                const parsedResponse = parseStructuredResponse(response, SKIT_GUIDANCE_FIELDS);
                const guidanceText = parsedResponse.guidance?.trim();
                const participantsText = parsedResponse.participants?.trim();
                if (guidanceText && participantsText) {
                    skit.guidance = guidanceText;
                    skit.initialActors = participantsText.split(',').map(name => findBestNameMatch(name.trim(), availableActors, ['name'])?.id).filter(id => id !== undefined) as string[];
                    break;
                }
            }
        }
    }

    let retry = 0;
    while (retry < 3) {

        const prompt =
            buildPrompt()
                .addBlock(`Instructions`,
                    `${skit.script.length == 0 ? 'Produce the initial moments of a scene (perhaps joined in medias res)' : 'Extend or conclude the current scene script'} with three to five entries, ` +
                    `based upon the Premise and the specified Scene Prompt. Primarily involve the Present Characters, although Absent Characters may be moved to this location using appropriate tags, if warranted. ` +
                    `The script should tacitly consider characters motives, relationships, and past events. ` +
                    `\n\nFollow the structure of the strict Example Script formatting; ` +
                    `actions are depicted in prose and character dialogue in quotation marks. ` +
                    `Characters present their own actions and dialogue, while other events within the scene are attributed to NARRATOR. ` +
                    `Although a script format is employed, the actual content should be professionally edited narrative prose. ` +
                    (save.disableImpersonation ?
                        `New entries refer to the player, ${playerName}, in second-person; all other characters are referred to in third-person, even in their own entries.` :
                        (`Entries from the player, ${playerName}, are written in first-person, while other entries consistently refer to ${playerName} in second-person; all other characters are referred to in third-person, even in their own entries.`)) +
                    `This scene is a brief visual novel skit within a video game; as such, the scene avoids major developments or concrete details which would fundamentally alter or subvert the mechanics of the game. ` +
                    (skit.script.length == 0 ? 'As this is the initial, establishing moment of a new scene, evaluate the current outfit and alternative outfits of each character and use Outfit ("wears") tags to update the characters to the most appropriate outfit for the moment. Begin the scene with appropriate tags at the "System:" prompt.' : 'Continue the scene at the "System:" prompt.') +
                    `Generally, focus upon interpersonal dynamics, character growth, and discovery or trials within this strange world.` +
                    ((save.language || 'English').toLowerCase() !== 'english' ? `\n\nNote: The game is now being played in ${save.language}. Regardless of historic language use, generate this skit content in ${save.language} accordingly. Special emotion, outfit, and movement tags continue to use English (these are invisible to the user).` : '')
                )
                .addBlock('Script Format',
                    `<Entry><Speaker>SPEAKER NAME</Speaker>[Appropriate Tags]<Message>Prose with "embedded dialogue" and actions.</Message></Entry>`)
                .addBlock('Tags', (builder) =>
                    builder.addBlock('Tag Instruction',
                        `Embedded within this script, you may employ special tags to trigger various game mechanics. These tags are not presented to users, so the narrative content of the script should also organically mention characters entering, exiting, or relocating. Character names in tags or in the script are ALL CAPS.`)
                        .addBlock('Emotion Tags',
                        `Emotion tags ("<Expression><Actor>[Character Name]</Actor><Mood>[EMOTION]</Mood></Expression>") should be used to indicate visible emotional shifts in a character's appearance using a single-word emotion name.`)
                        .addBlock('Outfit Tags',
                        `Outfit tags ("<OutfitChange><Actor>[Character Name]</Actor><Outfit>[OUTFIT NAME]</Outfit></OutfitChange>") should be used when a character changes outfit. ` +
                            `When establishing a character at the beginning of a scene or when moving to this location with a movement tag, give special consideration to the inclusion of a 'wears' tag to explicitly call out an appropriate look. ` +
                            `OUTFIT NAME must be found under the specified character—either their current outfit or one of their listed alternatives.`)
                        .addBlock('Movement Tags',
                            `\n\nA Character movement element ("<Movement><Actor>[Character Name]</Actor><Location>[HERE|location name|location ID]</Location></Movement>") must be used when an Absent Character engages in the scene (even if they are already narratively present). ` +
                            `\n\nCharacter movement tags must also be included when a character leaves the scene or moves to another location. ` +
                            `\n\nA Scene movement tag ("<Movement><Scene/><Location>[HERE|location name|location ID]</Location></Movement>") may be used when the scene itself transitions to another location. ` +
                            `When this tag is used, all characters currently present in the scene are treated as relocating together; if anyone splits up, they will require a separate movement tag. ` +
                            `\n\nFor movement tags, LOCATION should be the name of an existing location, or simply "HERE" to move to the scene's location, or "AWAY" to leave this area. ` +
                            `The game engine relies upon movement tags to update character locations and visually display character presence in scenes, so it is essential to use these tags when Absent Characters enter the scene, Present Characters leave, or the scene itself relocates.`)
                        
                ).addBlock('Example Script',
                    `<Entry><Speaker>NARRATOR</Speaker><Message>The sun sets over the horizon, casting a warm glow across the abandoned city. The air is thick with anticipation as the group gathers in the central plaza.</Message></Entry>\n` +
                    `<Entry><Speaker>CYANEA</Speaker><Message>"I can't believe we're finally here. It's been a long journey."</Message></Entry>\n` +
                    `<Entry><Speaker>PERSEPHONE</Speaker><Message>"Yes, but the real challenge is just beginning. We must stay vigilant." Persephone gently chides Cyanea.</Message></Entry>\n` +
                    `<Entry><Speaker>CYANEA</Speaker><Expression><Actor>Cyanea</Actor><Mood>Determination</Mood></Expression><Message>Cyanea frowns uncharacteristically with determination, "Of course." She nods with almost comical sobriety.</Message></Entry>\n` +
                    (!save.disableImpersonation ? `<Entry><Speaker>${playerName.toUpperCase()}</Speaker><Message>I smile warmly at the two women, "I agree. We need to be careful and work together."</Message></Entry>\n` : '') +
                    `<Entry><Speaker>RED HOOD</Speaker><Movement><Actor>Red Hood</Actor><Location>Here</Location></Movement><Message>A crimson-clad figure approaches with supplies."</Message></Entry>\n`
                )
                .addBlock('Scene Prompt',
                    `Scene Prompt: ${skit.guidance}`)
                .addBlock('Context',
                    generateContext(skit, stage, 7 - retry * 2))
                .format();
        console.log(prompt);
        const response = await stage.generateText(prompt, 10, 600)

        if (response && response.trim().length > 0) {
            // Strip all double asterisks; this is a temporary measure due to current model behavior.
            let text = response.replace(/\*\*/g, '').trim();
            let endScene = false;
            const outcomes: Outcome[] = [];
            let summary = '';
            let parsedSceneLocationId = getCurrentLocation(skit, -1);
            let parsedCurrentActors = getCurrentActors(skit, -1);
            const parsedCurrentOutfits = getCurrentOutfits(skit, stage, -1);

            // Remove any initial "System:" prefix
            if (text.toLowerCase().startsWith('system:')) {
                text = text.slice(7).trim();
            }

            // Prepare list of all actors (not just present)
            const allActors: Actor[] = Object.values(stage.getSave().actors);
            const allLocations = Object.values(stage.getSave().atlas || {});
            const resolveLocationId = (locationNameOrId: string): string | undefined => {
                const locationText = locationNameOrId.trim();
                if (!locationText) return undefined;

                if (stage.getSave().atlas?.[locationText]) {
                    return locationText;
                }

                const matchedLocation = findBestNameMatch(locationText, allLocations);
                return matchedLocation?.id;
            };

            const resolveEmotion = (emotionName: string, actorName: string): Emotion | undefined => {
                const normalizedEmotion = emotionName.trim().toLowerCase();
                if (!normalizedEmotion) return undefined;

                if (normalizedEmotion in Emotion) {
                    return normalizedEmotion as Emotion;
                }

                const closestEmotion = findBestNameMatch(normalizedEmotion, Object.keys(EMOTION_MAPPING).map(e => ({ name: e })));
                if (closestEmotion) {
                    console.log(`Emotion "${normalizedEmotion}" for ${actorName} mapped to emotion "${EMOTION_MAPPING[closestEmotion.name]}".`);
                    return EMOTION_MAPPING[closestEmotion.name];
                }

                console.warn(`Unrecognized emotion "${normalizedEmotion}" for ${actorName}; skipping tag.`);
                return undefined;
            };

            const parseXmlScriptEntries = (input: string): ScriptEntry[] => {
                const entries: ScriptEntry[] = [];
                const entryMatches = [...input.matchAll(/<Entry>([\s\S]*?)<\/Entry>/gi)];
                if (entryMatches.length === 0) {
                    return entries;
                }

                for (const entryMatch of entryMatches) {
                    const entryBody = entryMatch[1];
                    const speakerName = (/<Speaker>([\s\S]*?)<\/Speaker>/i.exec(entryBody)?.[1] || '').trim();
                    const messageBlock = (/<Message>([\s\S]*?)<\/Message>/i.exec(entryBody)?.[1] || '').trim();
                    const message = messageBlock
                        .replace(/[“”]/g, '"')
                        .replace(/[‘’]/g, '\'')
                        .replace(/<[^>]+>/g, '')
                        .trim();

                    const speakerMatch = findBestNameMatch(speakerName, save.actors ? Object.values(save.actors) : [], ['name']);
                    const speakerId = speakerMatch ? speakerMatch.id : '';

                    const actorEmotions: {[key: string]: Emotion} = {};
                    const actorOutfits: {[actorId: string]: string} = {};
                    let updatedActors: string[] | undefined;
                    let updatedLocationId: string | undefined;

                    for (const expressionMatch of entryBody.matchAll(/<Expression>\s*<Actor>([\s\S]*?)<\/Actor>\s*<Mood>([\s\S]*?)<\/Mood>\s*<\/Expression>/gi)) {
                        const actorName = expressionMatch[1].trim();
                        const moodName = expressionMatch[2].trim();
                        const matchedActor = findBestNameMatch(actorName, allActors, ['name']);
                        if (!matchedActor) continue;

                        const finalEmotion = resolveEmotion(moodName, matchedActor.name);
                        if (!finalEmotion) continue;
                        actorEmotions[matchedActor.id] = finalEmotion;
                    }

                    for (const outfitMatch of entryBody.matchAll(/<OutfitChange>\s*<Actor>([\s\S]*?)<\/Actor>\s*<Outfit>([\s\S]*?)<\/Outfit>\s*<\/OutfitChange>/gi)) {
                        const actorName = outfitMatch[1].trim();
                        const outfitName = outfitMatch[2].trim();
                        const matchedActor = findBestNameMatch(actorName, allActors, ['name']);
                        if (!matchedActor) continue;

                        const matchedOutfit = findBestNameMatch(outfitName, matchedActor.outfits || []);
                        if (!matchedOutfit) {
                            console.warn(`Outfit "${outfitName}" not found for ${matchedActor.name}; skipping tag.`);
                            continue;
                        }
                        actorOutfits[matchedActor.id] = matchedOutfit.id;
                    }

                    for (const movementMatch of entryBody.matchAll(/<Movement>([\s\S]*?)<\/Movement>/gi)) {
                        const movementBody = movementMatch[1];
                        const sceneMovementMatch = /<Scene\s*\/>\s*<Location>([\s\S]*?)<\/Location>/i.exec(movementBody);
                        if (sceneMovementMatch) {
                            const destinationText = sceneMovementMatch[1].trim();
                            const destinationUpper = destinationText.toUpperCase();
                            if (destinationUpper !== 'AWAY') {
                                const resolvedSceneLocationId = destinationUpper === 'HERE'
                                    ? parsedSceneLocationId
                                    : resolveLocationId(destinationText);
                                if (resolvedSceneLocationId) {
                                    parsedSceneLocationId = resolvedSceneLocationId;
                                    updatedLocationId = resolvedSceneLocationId;
                                }
                            }
                            continue;
                        }

                        const actorMovementMatch = /<Actor>([\s\S]*?)<\/Actor>\s*<Location>([\s\S]*?)<\/Location>/i.exec(movementBody);
                        if (!actorMovementMatch) continue;

                        const moverName = actorMovementMatch[1].trim();
                        const destinationText = actorMovementMatch[2].trim();
                        const destinationUpper = destinationText.toUpperCase();

                        const matchedActor = findBestNameMatch(moverName, allActors, ['name']);
                        if (!matchedActor) continue;

                        const isMoveToCurrentScene = destinationUpper === 'HERE' ||
                            (destinationUpper !== 'AWAY' && !!parsedSceneLocationId && resolveLocationId(destinationText) === parsedSceneLocationId);

                        if (isMoveToCurrentScene) {
                            if (!parsedCurrentActors.includes(matchedActor.id)) {
                                parsedCurrentActors = [...parsedCurrentActors, matchedActor.id];
                            }
                        } else {
                            parsedCurrentActors = parsedCurrentActors.filter(actorId => actorId !== matchedActor.id);
                        }

                        updatedActors = [...parsedCurrentActors];
                    }

                    entries.push(new ScriptEntry({
                        speakerId,
                        message,
                        speechUrl: '',
                        actorEmotions,
                        actorOutfits,
                        updatedActors,
                        updatedLocationId,
                        outcomes: [],
                    }));
                }

                return entries;
            };

            let scriptEntries = parseXmlScriptEntries(text);

            // Fallback for non-conforming model output.
            if (scriptEntries.length === 0) {
                const speakerLineRegex = /^([A-Z][A-Z0-9 '&.-]*):\s*(.*)$/s;
                scriptEntries = text
                    .split('\n')
                    .map(line => line.trim().replace(/[“”]/g, '"').replace(/[‘’]/g, '\''))
                    .filter(Boolean)
                    .map(line => {
                        const speakerLineMatch = speakerLineRegex.exec(line);
                        const speakerName = speakerLineMatch?.[1]?.trim() || 'NARRATOR';
                        const speakerMatch = findBestNameMatch(speakerName, save.actors ? Object.values(save.actors) : [], ['name']);
                        const speakerId = speakerMatch ? speakerMatch.id : '';
                        const message = (speakerLineMatch?.[2] || line).trim();
                        return new ScriptEntry({ speakerId, message, speechUrl: '', actorEmotions: {}, actorOutfits: {}, outcomes: [] });
                    });
            }

            // Drop empty entries from scriptEntries and adjust speaker to any matching actor's name:
            for (const entry of scriptEntries) {
                if (!entry.message || entry.message.trim().length === 0) {
                    const updatedActors = entry.updatedActors;
                    const emotions = entry.actorEmotions || {};
                    const outfitChanges = entry.actorOutfits || {};
                    const nextEntry = scriptEntries[scriptEntries.indexOf(entry) + 1];
                    if (nextEntry) {
                        if (updatedActors) {
                            nextEntry.updatedActors = [...updatedActors];
                        }
                        nextEntry.actorEmotions = {...(nextEntry.actorEmotions || {}), ...emotions};
                        nextEntry.actorOutfits = {...(nextEntry.actorOutfits || {}), ...outfitChanges};
                    }
                    scriptEntries.splice(scriptEntries.indexOf(entry), 1);
                    continue;
                }
            }

            // If impersonation is disabled, find any player entries and remove it and everything that follows:
            if (save.disableImpersonation) {
                // If impersonation is undesired, find any entry where the speaker matches the player's name and drop all messages beyond that point.
                const playerEntryIndex = scriptEntries.findIndex(entry => entry.speakerId === stage.getPlayerActor().id);
                if (playerEntryIndex !== -1) {
                    console.log(`Player entry found at index ${playerEntryIndex}. Removing all subsequent entries to disable impersonation.`);
                    scriptEntries.splice(playerEntryIndex);
                }
            }
        

            // TTS for each entry's dialogue
            const ttsPromises = scriptEntries.map(async (entry) => {
                const actor = entry.speakerId ? save.actors[entry.speakerId] : null;
                // Only TTS if entry.speaker matches an actor from stage().getSave().actors and entry.message includes dialogue in quotes.
                if (!actor || actor.id === save.playerId || !entry.message.includes('"') || !save.textToSpeech) {
                    console.log(`Skipping TTS: ${(!actor || actor.id === save.playerId) ? "No matching non-player actor" : (!entry.message.includes('"') ? "No dialogue in quotes" : "Text-to-speech disabled")}.`);
                    entry.speechUrl = '';
                    return;
                }
                let transcript = entry.message.split('"').filter((_, i) => i % 2 === 1).join('.........').trim();
                // Strip asterisks or other markdown-like emphasis characters
                transcript = transcript.replace(/[\*_~`]+/g, '');
                try {
                    const ttsResponse = await stage.generator.speak({
                        transcript: transcript,
                        voice_id: actor.voiceId ?? undefined
                    });
                    if (ttsResponse && ttsResponse.url) {
                        entry.speechUrl = ttsResponse.url;
                    } else {
                        entry.speechUrl = '';
                    }
                } catch (err) {
                    console.error('Error generating TTS:', err);
                    entry.speechUrl = '';
                }
            });

            // If this response contains an endScene, we will analyze the script for stat changes or other game mechanics to be applied. Add this to the ttsPromises to run in parallel.
            console.log('Perform additional analysis.');
            ttsPromises.push((async () => {
                let endResponse = await stage.generateText(
                    buildPrompt()
                        .addBlock(`Instructions`,
                            `Analyze the provided script and determine whether the depicted scene has run its course. ` +
                            `Respond using XML tags. If complete, use <SceneStatus>END</SceneStatus>; otherwise use <SceneStatus>CONTINUE</SceneStatus>. ` +
                            `Always include <Summary>...</Summary> with a concise explanation of the scene state and key developments. ` +
                            `\n\nIf the scene is complete, include optional lore update tags to flag follow-up game mechanics.`
                        )
                        .addBlock('Stat Changes',
                            `Indicate stat changes for any characters affected by the scene.\n` +
                            `<StatChange><Actor>[Character Name]</Actor><Stat>[Stat Name]</Stat><Amount>+/-x</Amount></StatChange>`
                        )
                        .addBlock('Lore Updates',
                            `Indicate lore entries that may need to be updated as a result of the skit. Actual updates happen elsewhere; this only flags entries for review.\n` +
                            `<LoreUpdate><Entry>Lore Entry Name</Entry></LoreUpdate>`
                        )
                        .addBlock('New Event',
                            `Create a new calendar event if the scene specified or implied a future event. Include the event name, date, a location (ID or name), required characters (IDs or names), a brief user-facing description, and secret additional guidance.\n` +
                            `Optional recurrence can be included if this should repeat for a finite period.\n` +
                            `<NewEvent><Name>Event Name</Name><Date>YYYY-MM-DD</Date><Location>Location ID or Name</Location><RequiredCharacters><Character>[Character ID or Name]</Character><Character>[Another Character ID or Name]</Character></RequiredCharacters><Description>Brief user-facing description</Description><Secret>Additional secret guidance</Secret><Recurrence><Frequency>DAILY|WEEKLY|MONTHLY</Frequency><Interval>1</Interval><UntilDate>YYYY-MM-DD</UntilDate></Recurrence></NewEvent>`
                        )
                        .addBlock('Example Response',
                            `<SceneAnalysis><SceneStatus>END</SceneStatus><Summary>This expedition took ${playerName} and Cyanea to the Shells, where they encountered Red Hood and uncovered a new forma: the Coral Razor. Red Hood vehemently disagreed with ${playerName} and Cyanea on how to handle this new threat.</Summary><LoreUpdate><Entry>The Shells</Entry></LoreUpdate><LoreUpdate><Entry>Cyanea</Entry></LoreUpdate><LoreUpdate><Entry>Red Hood</Entry></LoreUpdate></SceneAnalysis>\n#END#` +
                            `\nExample Response:\n` +
                            `<SceneAnalysis><SceneStatus>CONTINUE</SceneStatus><Summary>The scene is developing well, but it would be more satisfying with a clearer moment of resolution at the end. Consider whether ${playerName} could discover a clue or have a significant interaction with another character to create a more compelling ending.</Summary></SceneAnalysis>\n#END#`
                        )
                        .addBlock('Scene Script for Analysis',
                            buildScriptLog(skit, scriptEntries, stage))
                        .addBlock('Additional Context',
                            generateContext(skit, stage, 0))
                        .format(),
                    1, 1000
                );

                if (endResponse) {
                    // Strip double-asterisks. TODO: Remove this once other model issue is resolved.
                    endResponse = endResponse.replace(/\*\*/g, '');

                    const normalizedEndResponse = endResponse.replace(/[“”]/g, '"').replace(/[‘’]/g, '\'');
                    const hasEndSceneTag = normalizedEndResponse.includes('<END SCENE>') || /<SceneStatus>\s*END\s*<\/SceneStatus>/i.test(normalizedEndResponse);

                    if (hasEndSceneTag) {
                        endScene = true;
                        const parsedAnalysis = parseXmlTagsToObjects(normalizedEndResponse);
                        const sceneAnalysis = parsedAnalysis?.SceneAnalysis || parsedAnalysis;
                        const summaryText = typeof sceneAnalysis?.Summary === 'string'
                            ? sceneAnalysis.Summary
                            : typeof sceneAnalysis?.summary === 'string'
                                ? sceneAnalysis.summary
                                : '';
                        summary = summaryText.trim();
                        console.log('Model determined scene should end. Summary:', summary);

                        const statChanges = Array.isArray(sceneAnalysis?.StatChange)
                            ? sceneAnalysis.StatChange
                            : sceneAnalysis?.StatChange
                                ? [sceneAnalysis.StatChange]
                                : [];

                        for (const statChange of statChanges) {
                            const actorName = typeof statChange?.Actor === 'string'
                                ? statChange.Actor
                                : typeof statChange?.actor === 'string'
                                    ? statChange.actor
                                    : '';
                            const changeValue = parseInt(`${statChange?.Amount ?? statChange?.amount ?? ''}`, 10);
                            const matchedActor = findBestNameMatch(actorName, Object.values(save.actors), ['name']);
                            if (matchedActor && !isNaN(changeValue) && changeValue !== 0) {
                                outcomes.push(new Outcome({
                                    type: OutcomeType.STAT_CHANGE,
                                    description: `Stat for ${matchedActor.name} changes by ${changeValue > 0 ? '+' : ''}${changeValue}.`,
                                    details: {
                                        actorId: matchedActor.id,
                                        actorName: matchedActor.name,
                                        changeValue,
                                    },
                                }));
                            }
                        }

                        const loreUpdates = Array.isArray(sceneAnalysis?.LoreUpdate)
                            ? sceneAnalysis.LoreUpdate
                            : sceneAnalysis?.LoreUpdate
                                ? [sceneAnalysis.LoreUpdate]
                                : [];

                        for (const loreUpdate of loreUpdates) {
                            const loreName = typeof loreUpdate?.Entry === 'string'
                                ? loreUpdate.Entry
                                : typeof loreUpdate?.entry === 'string'
                                    ? loreUpdate.entry
                                    : '';
                            const matchedLore = findBestNameMatch(loreName, save.lorebook || [], ['title']);
                            if (matchedLore) {
                                console.log(`Lore update flagged for "${matchedLore.title}".`);
                                outcomes.push(new Outcome({
                                    type: OutcomeType.LORE_UPDATE,
                                    description: `Lore entry \"${matchedLore.title}\" should be reviewed for updates.`,
                                    details: {
                                        loreId: matchedLore.id,
                                        loreTitle: matchedLore.title,
                                    },
                                }));
                            }
                        }

                        const newEvents = Array.isArray(sceneAnalysis?.NewEvent)
                            ? sceneAnalysis.NewEvent
                            : sceneAnalysis?.NewEvent
                                ? [sceneAnalysis.NewEvent]
                                : [];

                        for (const newEvent of newEvents) {
                            const eventName = typeof newEvent?.Name === 'string'
                                ? newEvent.Name
                                : typeof newEvent?.name === 'string'
                                    ? newEvent.name
                                    : '';
                            const eventDate = typeof newEvent?.Date === 'string'
                                ? newEvent.Date
                                : typeof newEvent?.date === 'string'
                                    ? newEvent.date
                                    : '';
                            const eventLocation = typeof newEvent?.Location === 'string'
                                ? newEvent.Location
                                : typeof newEvent?.location === 'string'
                                    ? newEvent.location
                                    : '';
                            const eventDescription = typeof newEvent?.Description === 'string'
                                ? newEvent.Description
                                : typeof newEvent?.description === 'string'
                                    ? newEvent.description
                                    : '';
                            const eventSecret = typeof newEvent?.Secret === 'string'
                                ? newEvent.Secret
                                : typeof newEvent?.secret === 'string'
                                    ? newEvent.secret
                                    : '';
                            const recurrence = newEvent?.Recurrence || newEvent?.recurrence;
                            const recurrenceFrequency = typeof recurrence?.Frequency === 'string'
                                ? recurrence.Frequency
                                : typeof recurrence?.frequency === 'string'
                                    ? recurrence.frequency
                                    : '';
                            const recurrenceInterval = typeof recurrence?.Interval === 'string' || typeof recurrence?.Interval === 'number'
                                ? recurrence.Interval
                                : typeof recurrence?.interval === 'string' || typeof recurrence?.interval === 'number'
                                    ? recurrence.interval
                                    : '';
                            const recurrenceUntilDate = typeof recurrence?.UntilDate === 'string'
                                ? recurrence.UntilDate
                                : typeof recurrence?.untilDate === 'string'
                                    ? recurrence.untilDate
                                    : '';

                            const requiredCharactersRaw = newEvent?.RequiredCharacters || newEvent?.requiredCharacters;
                            let requiredCharacters: string[] = [];
                            if (Array.isArray(requiredCharactersRaw?.Character)) {
                                requiredCharacters = requiredCharactersRaw.Character
                                    .map((character: any) => `${character || ''}`.trim())
                                    .filter(Boolean);
                            } else if (typeof requiredCharactersRaw?.Character === 'string') {
                                requiredCharacters = [requiredCharactersRaw.Character.trim()].filter(Boolean);
                            } else if (Array.isArray(requiredCharactersRaw?.character)) {
                                requiredCharacters = requiredCharactersRaw.character
                                    .map((character: any) => `${character || ''}`.trim())
                                    .filter(Boolean);
                            } else if (typeof requiredCharactersRaw?.character === 'string') {
                                requiredCharacters = [requiredCharactersRaw.character.trim()].filter(Boolean);
                            }

                            if (eventName) {
                                outcomes.push(new Outcome({
                                    type: OutcomeType.NEW_EVENT,
                                    description: `New calendar event \"${eventName}\" was flagged.`,
                                    details: {
                                        event: {
                                            name: eventName,
                                            date: eventDate,
                                            location: eventLocation,
                                            requiredCharacters,
                                            description: eventDescription,
                                            secret: eventSecret,
                                            recurrence: recurrenceFrequency
                                                ? {
                                                    frequency: recurrenceFrequency,
                                                    interval: recurrenceInterval,
                                                    untilDate: recurrenceUntilDate,
                                                }
                                                : undefined,
                                        },
                                    },
                                }));
                            }
                        }
                    }
                }
            })());

            // Wait for all TTS generation to complete
            await Promise.all(ttsPromises);

            // Attach endScene and endProperties to the final entry if the scene ended
            if (endScene && scriptEntries.length > 0) {
                console.log('Updating final entry');
                const finalEntry = scriptEntries[scriptEntries.length - 1];
                finalEntry.endScene = true;
                finalEntry.outcomes = outcomes;
                console.log(finalEntry.outcomes);
            }

            if (endScene && !summary) {
                console.log('Scene ended without a summary.');
            }
            skit.summary = summary;

            stage.pushMessage(text);

            return scriptEntries;
        } else {
            retry++;
        }
    }

    return [];


}

