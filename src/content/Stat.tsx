import { v4 as generateUuid } from 'uuid';
import { ContentTarget, ContentType, CONTENT_TYPES, ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

// A boolean field whose effective value can be gated by conditions instead of always being fixed. With no
// conditions, `value` always applies. With conditions, `value` applies only while at least one collection is
// satisfied; otherwise the opposite of `value` applies (e.g. used for a stat's exposed/llmSees/llmMaintained
// flags, letting them flip on/off based on other stats, calendar state, etc.).
export type ConditionalFlag = {
    value: boolean;
    conditions: ConditionCollection[];
};

export const cloneConditionalFlag = (source: unknown, fallback: boolean): ConditionalFlag => {
    if (typeof source === 'boolean') {
        return { value: source, conditions: [] };
    }
    const flag = (source && typeof source === 'object') ? source as Partial<ConditionalFlag> : undefined;
    return {
        value: typeof flag?.value === 'boolean' ? flag.value : fallback,
        conditions: Array.isArray(flag?.conditions) ? flag.conditions.map((collection) => Array.isArray(collection) ? [...collection] : []) : [],
    };
};

// Resolves a conditional flag's effective boolean for the given context; see ConditionalFlag for semantics.
export const resolveConditionalFlag = (flag: ConditionalFlag | undefined, context: ConditionContext, fallback: boolean): boolean => {
    if (!flag) {
        return fallback;
    }
    if (!flag.conditions || flag.conditions.length === 0) {
        return flag.value;
    }
    return evaluateConditionCollections(flag.conditions, context) ? flag.value : !flag.value;
};

// Reference stats hold content IDs rather than display values. List variants hold a set of IDs. 'function'
// stats hold no value at all - they are a JavaScript snippet (Stat.script) invoked on demand, rather than
// something read/written as a scalar. See runFunctionScript.
// 'optionList' holds a pool of options (Stat.options) whose value is the list of currently active option ids;
// 'option' stats may pull their choices from one via Stat.optionSourceStatId.
export type StatType = 'number' | 'option' | 'optionList' | 'text' | 'checkbox' | 'actor' | 'actorList' | 'item' | 'itemList' | 'location' | 'locationList' | 'function';
export type StatDisplayType = 'straight' | 'percentage' | 'bar' | 'rating' | 'letter grade';
export type StatValue = number | string | boolean | string[];

export const isNumericDisplayType = (type: StatType): boolean => type === 'number';

export const isFunctionStatType = (type: StatType): boolean => type === 'function';

export const isOptionListStatType = (type: StatType): boolean => type === 'optionList';

export const isLocationDisplayType = (type: StatType): boolean => type === 'location';

export const isLocationListDisplayType = (type: StatType): boolean => type === 'locationList';

export const isActorDisplayType = (type: StatType): boolean => type === 'actor';

export const isActorListDisplayType = (type: StatType): boolean => type === 'actorList';

export const isItemDisplayType = (type: StatType): boolean => type === 'item';

export const isItemListDisplayType = (type: StatType): boolean => type === 'itemList';

export const isReferenceDisplayType = (type: StatType): boolean => type === 'actor' || type === 'item' || type === 'location';

export const isReferenceListDisplayType = (type: StatType): boolean => type === 'actorList' || type === 'itemList' || type === 'locationList';

// Any stat whose value is a string[] (reference lists and optionLists).
export const isListStatType = (type: StatType): boolean => isReferenceListDisplayType(type) || isOptionListStatType(type);

export const normalizeReferenceListValue = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

// The kind of content a reference stat (scalar or list) points to; shared by every place that needs to pick
// per-kind behavior (which entity collection, which UI select component, which portrait, etc.) instead of
// re-deriving it from a 6-way StatType comparison.
export type ReferenceKind = ContentType;

export const resolveReferenceKind = (type: StatType): ReferenceKind | undefined => {
    if (type === 'actor' || type === 'actorList') {
        return 'actor';
    }
    if (type === 'item' || type === 'itemList') {
        return 'item';
    }
    if (type === 'location' || type === 'locationList') {
        return 'location';
    }
    return undefined;
};

// Duck-typed collections used to resolve a reference id to its entity's display name; accepts either the
// Record<id, entity> shape (Actor/Location saves) or a plain array (e.g. an Item inventory).
export type ReferenceEntityLookup = {
    actors?: Record<string, { name?: string }> | Array<{ id?: string; name?: string }>;
    items?: Record<string, { name?: string }> | Array<{ id?: string; name?: string }>;
    locations?: Record<string, { name?: string }> | Array<{ id?: string; name?: string }>;
};

const findEntityName = (collection: Record<string, { name?: string }> | Array<{ id?: string; name?: string }> | undefined, id: string): string | undefined => {
    if (!collection || !id) {
        return undefined;
    }
    return Array.isArray(collection) ? collection.find((entry) => entry?.id === id)?.name : collection[id]?.name;
};

// Resolves a reference stat's target id to its entity's display name via whichever collection matches the
// stat's kind (see resolveReferenceKind); returns undefined (rather than a fallback) so callers can decide
// what "not found" should look like.
export const resolveReferenceEntityName = (type: StatType, id: string, lookup: ReferenceEntityLookup): string | undefined => {
    const kind = resolveReferenceKind(type);
    return kind ? findEntityName(lookup[`${kind}s` as keyof ReferenceEntityLookup], id) : undefined;
};

// Applies `resolveName` to the id(s) held by a reference-typed stat's value - a single id for scalar types,
// every id (joined with ", ") for list types - so callers only need to supply how to turn one id into text.
// Non-reference stats pass `value` through as plain text.
export const mapReferenceStatValue = (
    stat: { type: StatType },
    value: StatValue,
    resolveName: (kind: ReferenceKind, id: string) => string,
): string => {
    const kind = resolveReferenceKind(stat.type);
    if (!kind) {
        return typeof value === 'string' ? value : '';
    }
    if (isReferenceListDisplayType(stat.type)) {
        return normalizeReferenceListValue(value).map((id) => resolveName(kind, id)).filter(Boolean).join(', ');
    }
    return resolveName(kind, String(value ?? ''));
};

// Convenience wrapper over mapReferenceStatValue + resolveReferenceEntityName for the common case of a plain
// actors/items/locations lookup; `fallback` (literal or per-kind function) is used when an id isn't found.
export const formatReferenceStatText = (
    stat: { type: StatType },
    value: StatValue,
    lookup: ReferenceEntityLookup,
    fallback: string | ((kind: ReferenceKind) => string) = '',
): string => (
    mapReferenceStatValue(stat, value, (kind, id) => (
        resolveReferenceEntityName(stat.type, id, lookup) || (typeof fallback === 'function' ? fallback(kind) : fallback)
    ))
);

export const normalizeLocationListValue = normalizeReferenceListValue;

// Resolves the effective display style for a numeric stat, defaulting to a plain number.
export const resolveStatDisplayType = (stat: Stat): StatDisplayType => (stat.type === 'number' ? (stat.displayType || 'straight') : 'straight');

export type StatOption = {
    id?: string;
    name: string;
    description: string;
};

type StatValueOptions = {
    evaluateDiceNotation?: boolean;
};

const DICE_EXPRESSION_PATTERN = /^\s*[+-]?\s*(?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*\s*$/i;

const normalizeOptionIdText = (value: string): string => {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'option';
};

export const resolveStatOptionId = (option: StatOption | undefined, index: number): string => {
    const explicitId = option?.id?.trim();
    if (explicitId) {
        return explicitId;
    }
    return `${normalizeOptionIdText(option?.name || '')}-${index + 1}`;
};

export const getStatOptionValue = resolveStatOptionId;

// Supplies optionList stat definitions (from any stat category, looked up by id) to option stats that source
// their choices from one; `value` is only known for global lists. Registered by the Stage.
export type OptionListSourceResolver = (statId: string) => { stat: Stat; value?: StatValue } | undefined;
let optionListSourceResolver: OptionListSourceResolver | undefined;

export const setOptionListSourceResolver = (resolver: OptionListSourceResolver | undefined) => {
    optionListSourceResolver = resolver;
};

// Explicit source data: `sourceStats` for editors holding unsaved definitions, and the owning entity's
// statMap so an option stat sourced from a list on the same actor/location/item sees that entity's active list.
export type OptionListSourceContext = {
    sourceStats?: Stat[];
    globalStatValues?: { [statId: string]: StatValue };
    entityStatValues?: { [statId: string]: StatValue };
};

const resolveOptionListSource = (statId: string, context?: OptionListSourceContext): { stat: Stat; value?: StatValue } | undefined => {
    const resolved = optionListSourceResolver?.(statId);
    const stat = context?.sourceStats?.find((candidate) => candidate.id === statId) || resolved?.stat;
    if (stat?.type !== 'optionList') {
        return undefined;
    }
    return { stat, value: context?.entityStatValues?.[statId] ?? context?.globalStatValues?.[statId] ?? resolved?.value };
};

export const isSourcedOptionStat = (stat: Stat | undefined): boolean => (
    stat?.type === 'option' && !!stat.optionSourceStatId?.trim()
);

// Ids are materialized so filtering the list later doesn't change index-derived fallback ids.
const materializeOptions = (options: StatOption[] | undefined): StatOption[] => (
    (options || []).map((option, index) => ({ ...option, id: resolveStatOptionId(option, index) }))
);

// Every option a stat's value may refer to: its own options, or (for a sourced option stat) the source
// optionList's full pool, including options not currently active.
export const resolveStatOptionPool = (stat: Stat | undefined, context?: OptionListSourceContext): StatOption[] => {
    if (!stat) {
        return [];
    }
    if (isSourcedOptionStat(stat)) {
        return materializeOptions(resolveOptionListSource(stat.optionSourceStatId!, context)?.stat.options);
    }
    return materializeOptions(stat.options);
};

// The options currently offered for selection. For a sourced option stat, only those active in the source
// optionList's value; `currentValue`'s option is always kept so an existing selection still renders.
export const resolveAvailableStatOptions = (stat: Stat | undefined, currentValue?: unknown, context?: OptionListSourceContext): StatOption[] => {
    const pool = resolveStatOptionPool(stat, context);
    if (!stat || !isSourcedOptionStat(stat)) {
        return pool;
    }
    const source = resolveOptionListSource(stat.optionSourceStatId!, context);
    if (!source) {
        return pool;
    }
    const activeIds = new Set(normalizeStatValue(source.value, source.stat) as string[]);
    const currentId = findStatOptionByValue(stat, currentValue, context)?.value;
    return pool.filter((option) => activeIds.has(option.id!) || option.id === currentId);
};

export const findStatOptionByValue = (stat: Stat | undefined, value: unknown, context?: OptionListSourceContext): { option: StatOption; index: number; value: string } | undefined => {
    if (!stat || (stat.type !== 'option' && stat.type !== 'optionList') || typeof value !== 'string') {
        return undefined;
    }
    const options = resolveStatOptionPool(stat, context);
    const exactMatch = options
        .map((option, index) => ({ option, index, value: resolveStatOptionId(option, index) }))
        .find((entry) => entry.value === value || entry.option.name === value);
    if (exactMatch) {
        return exactMatch;
    }
    const loweredValue = value.toLowerCase();
    return options
        .map((option, index) => ({ option, index, value: resolveStatOptionId(option, index) }))
        .find((entry) => entry.value.toLowerCase() === loweredValue || entry.option.name.toLowerCase() === loweredValue);
};

const rollDie = (sides: number): number => Math.floor(Math.random() * sides) + 1;

export const evaluateNumericStatExpression = (value: unknown): number | undefined => {
    if (Number.isFinite(value)) {
        return Number(value);
    }

    if (typeof value !== 'string') {
        return undefined;
    }

    const expression = value.trim();
    if (!expression || !DICE_EXPRESSION_PATTERN.test(expression)) {
        return undefined;
    }

    const terms = expression.match(/[+-]?\s*(?:\d*d\d+|\d+)/gi) || [];
    let total = 0;

    for (const rawTerm of terms) {
        const compactTerm = rawTerm.replace(/\s+/g, '').toLowerCase();
        const sign = compactTerm.startsWith('-') ? -1 : 1;
        const unsignedTerm = compactTerm.replace(/^[+-]/, '');

        if (unsignedTerm.includes('d')) {
            const [countText, sidesText] = unsignedTerm.split('d');
            const count = countText === '' ? 1 : Number(countText);
            const sides = Number(sidesText);
            if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || sides < 1 || count > 100 || sides > 10000) {
                return undefined;
            }
            for (let rollIndex = 0; rollIndex < count; rollIndex += 1) {
                total += sign * rollDie(sides);
            }
            continue;
        }

        const numericValue = Number(unsignedTerm);
        if (!Number.isFinite(numericValue)) {
            return undefined;
        }
        total += sign * numericValue;
    }

    return total;
};

// A single rule used to resolve a per-actor stat's value for a given target actor; rules are evaluated in
// order and the first whose conditions are satisfied wins (conditions may reference the target via the
// 'variable' actor target so they can inspect the target actor's own stats).
export type StatValueRule = {
    id: string;
    value: StatValue;
    conditions: ConditionCollection[];
};

// An entity a function script's `target` (or a `getActor`/`getLocation`/`getItem`/`actors`/`locations`/`items`
// lookup) resolves to: its own stats can be read/written by name via `get`/`set`, scoped to whichever stat
// definitions (`kind`) apply. `getField`/`setField` read/write a small allowlist of simple metadata fields
// directly, bypassing the Stat system.
export type FunctionScriptEntity = {
    name: string;
    kind: ContentType;
    get: (statName: string) => StatValue | undefined;
    set: (statName: string, value: StatValue) => void;
    getField?: (fieldName: string) => string | undefined;
    setField?: (fieldName: string, value: string) => void;
};

// The bindings a function stat's script body executes with (via `new Function`, see runFunctionScript):
// `get`/`set` read/write global stats by name; `target` (when bound) is the entity this invocation concerns
// (e.g. the actor a StatUpdate targeted, or an Item's own stats); `getActor`/`getLocation`/`getItem` look up
// any other named entity's stats; `actors`/`locations`/`items` list every active (non-deleted) entity of that
// kind for looping; `call` invokes another function stat by name (global, or - if a target/explicit entity is
// given - one scoped to that entity's kind), returning its return value.
export type FunctionScriptBindings = {
    get: (statName: string) => StatValue | undefined;
    set: (statName: string, value: StatValue) => void;
    target?: FunctionScriptEntity;
    getActor: (name: string) => FunctionScriptEntity | undefined;
    getLocation: (name: string) => FunctionScriptEntity | undefined;
    getItem: (name: string) => FunctionScriptEntity | undefined;
    actors: () => FunctionScriptEntity[];
    locations: () => FunctionScriptEntity[];
    items: () => FunctionScriptEntity[];
    call: (name: string, target?: FunctionScriptEntity) => unknown;
};

// Compiles and runs a function stat's script body with the given bindings. Scripts are plain JavaScript
// (may `return` a value) and can only touch game state through the bound accessors - never through direct
// object references - so every mutation still goes through the normal normalize/clamp pipeline.
export type FunctionScriptTestResult = { value: unknown; errors: string[] };

export const runFunctionScript = (script: string | undefined, bindings: FunctionScriptBindings, onError?: (message: string) => void): unknown => {
    const body = `${script || ''}`.trim();
    if (!body) {
        return undefined;
    }
    try {
        const scriptFunction = new Function(
            'get', 'set', 'target', 'getActor', 'getLocation', 'getItem', 'actors', 'locations', 'items', 'call', body,
        );
        return scriptFunction(
            bindings.get, bindings.set, bindings.target, bindings.getActor, bindings.getLocation, bindings.getItem,
            bindings.actors, bindings.locations, bindings.items, bindings.call,
        );
    } catch (error) {
        const message = `Function stat script error: ${(error as Error)?.message || error}`;
        if (onError) {
            onError(message);
        } else {
            console.error(message);
        }
        return undefined;
    }
};

// Represents a custom stat that applies to all actors in the game.
export type Stat = {
    id: string;
    name: string;
    description: string;
    // When true, this stat's value on a given actor is a mapping of target actorId to a value of `type`
    // (e.g. the host actor's affinity toward each other actor), rather than a single scalar value.
    perActor?: boolean;
    // Rules used to resolve a default value for a given target actor when perActor is true and neither the
    // host actor's own perActorValueRules nor an explicit override provide a value. Evaluated in order.
    perActorDefaultRules?: StatValueRule[];
    // For global stats: rules used to resolve this stat's initial value when a new game starts, evaluated in
    // order (first matching wins); falls back to `default` if none match. See applyGlobalStatDefaults.
    defaultValueRules?: StatValueRule[];
    // Only meaningful when type is 'function': the JavaScript body run on invocation (see runFunctionScript).
    // Entities that own this stat (e.g. an Item) may override this default per-instance; see resolveFunctionScript.
    script?: string;
    llmSees: ConditionalFlag; // If true (the resolved value), this stat can be included in context provided to the LLM; if false, this stat is omitted from context (intended for purely mechanical use); if false, llmMaintained is also treated as false.
    llmMaintained: ConditionalFlag; // If true (the resolved value), this stat can be updated by the LLM in skit outcomes (see Skit.tsx).
    guidance: string; // Guidance for the LLM on how to handle this stat. If llmSees is false, the blank for editing this can be omitted from StatManagementPanel.
    default: StatValue;
    type: StatType;
    // Only meaningful when type is 'number'; controls how the numeric value is rendered (straight number, bar, etc).
    displayType?: StatDisplayType;
    options?: StatOption[];
    // Only meaningful when type is 'option': id of a global 'optionList' stat to take options from instead of `options`.
    optionSourceStatId?: string;
    min?: number;
    max?: number;
    setByPlayer: boolean;
    exposed: ConditionalFlag;
    iconName?: string;
    labelIconName?: string;
    displayColor?: string; // HTML color to use for display of this stat (stat bar or stat icons in a rating display; not for the label of the stat itself).
};

type StatTextContext = {
    getPlayerActor?: () => { name?: string } | undefined;
    primaryUser?: { name?: string };
};

export const applyUserPlaceholder = (rawText: string | undefined, playerName: string): string => (
    String(rawText || '').replace(/\{\{\s*user\s*\}\}/gi, playerName || 'the player')
);

export const resolveStatText = (
    rawText: string | undefined,
    stage?: StatTextContext | null,
): string => applyUserPlaceholder(rawText, stage?.getPlayerActor?.()?.name || stage?.primaryUser?.name || 'the player');

export const cloneStatValueRule = (rule: StatValueRule): StatValueRule => ({
    id: rule.id,
    value: Array.isArray(rule.value)
        ? normalizeReferenceListValue(rule.value)
        : (typeof rule.value === 'boolean' || typeof rule.value === 'number' || typeof rule.value === 'string' ? rule.value : 0),
    conditions: (rule.conditions || []).map((collection) => [...collection]),
});

export const cloneStatValueRules = (rules: StatValueRule[] | undefined): StatValueRule[] => (rules || []).map(cloneStatValueRule);

export const cloneStat = (stat: Stat): Stat => ({
    id: stat.id || generateUuid(),
    name: stat.name,
    description: stat.description,
    perActor: stat.perActor === true,
    perActorDefaultRules: cloneStatValueRules(stat.perActorDefaultRules),
    defaultValueRules: cloneStatValueRules(stat.defaultValueRules),
    script: `${stat.script || ''}`,
    llmSees: cloneConditionalFlag(stat.llmSees, true),
    llmMaintained: cloneConditionalFlag(stat.llmMaintained, true),
    guidance: stat.guidance,
    default: isReferenceListDisplayType(stat.type) || isOptionListStatType(stat.type)
        ? normalizeReferenceListValue(stat.default)
        : (typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0))),
    type: stat.type,
    displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
    options: (stat.options || []).map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description,
    })),
    optionSourceStatId: stat.type === 'option' && stat.optionSourceStatId ? stat.optionSourceStatId : undefined,
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true,
    exposed: cloneConditionalFlag(stat.exposed, false),
    iconName: stat.iconName || (stat.displayType === 'rating' ? 'star' : undefined),
    labelIconName: stat.labelIconName || undefined,
    displayColor: stat.displayColor || undefined,
});

export const isStatExposed = (stat: Stat, context: ConditionContext): boolean => resolveConditionalFlag(stat.exposed, context, false);
export const isStatLlmSeen = (stat: Stat, context: ConditionContext): boolean => resolveConditionalFlag(stat.llmSees, context, true);
export const isStatLlmMaintained = (stat: Stat, context: ConditionContext): boolean => (
    isStatLlmSeen(stat, context) && resolveConditionalFlag(stat.llmMaintained, context, true)
);

export const resolveStatDefault = (stat: Stat, options: StatValueOptions = {}): StatValue => {
    if (isFunctionStatType(stat.type)) {
        return ''; // function stats are a callable definition, not a scalar value
    }

    if (stat.type === 'option') {
        const defaultOption = findStatOptionByValue(stat, stat.default);
        if (defaultOption) {
            return defaultOption.value;
        }
        const firstOption = resolveAvailableStatOptions(stat)[0] || resolveStatOptionPool(stat)[0];
        return firstOption?.id || '';
    }

    if (isOptionListStatType(stat.type)) {
        // No explicit default list means every option starts active.
        return Array.isArray(stat.default)
            ? normalizeOptionListIds(stat.default, stat)
            : resolveStatOptionPool(stat).map((option) => option.id!);
    }

    if (isReferenceListDisplayType(stat.type)) {
        return normalizeReferenceListValue(stat.default);
    }

    if (stat.type === 'text' || isReferenceDisplayType(stat.type)) {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    if (options.evaluateDiceNotation) {
        return evaluateNumericStatExpression(stat.default) ?? 0;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

export const normalizeStatValue = (value: unknown, stat: Stat, options: StatValueOptions = {}): StatValue => {
    if (isFunctionStatType(stat.type)) {
        return ''; // function stats are a callable definition, not a scalar value
    }

    if (stat.type === 'option') {
        const selectedOption = findStatOptionByValue(stat, value);
        if (selectedOption) {
            return selectedOption.value;
        }
        // Keep the stored id if the source list can't be resolved yet rather than wiping it.
        if (isSourcedOptionStat(stat) && typeof value === 'string' && value && resolveStatOptionPool(stat).length === 0) {
            return value;
        }
        const fallback = resolveStatDefault(stat, options);
        return typeof fallback === 'string' ? fallback : '';
    }

    if (isOptionListStatType(stat.type)) {
        if (typeof value === 'string') {
            // e.g. an LLM outcome value like "Wealth, Fame"
            return normalizeOptionListIds(value.split(',').map((entry) => entry.trim()).filter(Boolean), stat);
        }
        return Array.isArray(value) ? normalizeOptionListIds(value, stat) : resolveStatDefault(stat, options);
    }

    if (isReferenceListDisplayType(stat.type)) {
        return Array.isArray(value) ? normalizeReferenceListValue(value) : normalizeReferenceListValue(resolveStatDefault(stat, options));
    }

    if (stat.type === 'text' || isReferenceDisplayType(stat.type)) {
        if (typeof value === 'string') {
            return value;
        }
        const fallback = resolveStatDefault(stat, options);
        return typeof fallback === 'string' ? fallback : '';
    }

    if (stat.type === 'checkbox') {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lower = value.trim().toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
        }
        return typeof resolveStatDefault(stat, options) === 'boolean' ? resolveStatDefault(stat, options) : false;
    }

    const expressionValue = options.evaluateDiceNotation ? evaluateNumericStatExpression(value) : undefined;
    let resolved = Number.isFinite(value)
        ? Number(value)
        : expressionValue !== undefined
            ? expressionValue
            : Number(resolveStatDefault(stat, options)) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

// Maps option ids/names to canonical ids of an optionList's pool, dropping unknown entries and duplicates.
const normalizeOptionListIds = (values: unknown[], stat: Stat): string[] => {
    const ids = values
        .map((entry) => findStatOptionByValue(stat, entry)?.value)
        .filter((id): id is string => !!id);
    return Array.from(new Set(ids));
};

// Display label(s) for an option/optionList stat's value (never raw ids); undefined for other stat types.
export const formatStatOptionValueText = (stat: Stat, value: StatValue | undefined): string | undefined => {
    if (stat.type === 'option') {
        return findStatOptionByValue(stat, value)?.option.name;
    }
    if (isOptionListStatType(stat.type)) {
        return (normalizeStatValue(value, stat) as string[])
            .map((id) => findStatOptionByValue(stat, id)?.option.name)
            .filter(Boolean)
            .join(', ') || 'None';
    }
    return undefined;
};

// A stored optionList value only lists options that existed when it was written; options added to the pool since
// `previousStat` join it if they're active in `nextStat`'s default. Other values are returned unchanged.
export const includeNewOptionListOptions = (value: StatValue | undefined, previousStat: Stat | undefined, nextStat: Stat): StatValue | undefined => {
    if (!isOptionListStatType(nextStat.type) || !previousStat || !isOptionListStatType(previousStat.type) || !Array.isArray(value)) {
        return value;
    }
    const previousIds = new Set(resolveStatOptionPool(previousStat).map((option) => option.id!));
    const defaultIds = new Set(resolveStatDefault(nextStat) as string[]);
    const addedIds = resolveStatOptionPool(nextStat)
        .map((option) => option.id!)
        .filter((id) => !previousIds.has(id) && defaultIds.has(id) && !value.includes(id));
    return addedIds.length ? [...value, ...addedIds] : value;
};

// Finds the first rule in an ordered list whose conditions are satisfied by the given context (e.g. with
// context.currentActor set to the target actor so 'variable' actor-stat conditions inspect the target).
// Returns undefined if no rule matches, so callers can continue to the next fallback tier.
export const resolvePerActorValueRule = (
    rules: StatValueRule[] | undefined,
    stat: Stat,
    context: ConditionContext,
): StatValue | undefined => {
    const matchedRule = (rules || []).find((rule) => evaluateConditionCollections(rule.conditions, context));
    return matchedRule ? normalizeStatValue(matchedRule.value, stat) : undefined;
};

// Generic alias for resolvePerActorValueRule; used wherever an ordered StatValueRule list needs to be
// resolved but there is no per-actor target involved (e.g. a global stat's defaultValueRules at game start).
export const resolveStatValueRule = resolvePerActorValueRule;

export type StatUpdateTargetType = 'global' | ContentType;
// For optionList stats, 'adjust' adds the given options to the active list and 'remove' removes them.
export type StatUpdateOperation = 'set' | 'adjust' | 'remove';

// Whether a StatUpdateRule action writes a stat directly ('stat', the original/default behavior) or invokes
// a 'function' typed stat instead (running that stat's script, see runFunctionScript).
export type StatUpdateActionKind = 'stat' | 'function';

// A single action performed by a StatUpdateRule: either a stat write ('stat', the original behavior) or a
// function stat invocation ('function'). Shares StatValue (and, for numeric stats, the same dice/relative
// expression support) with StatValueRule so both rule flavors can use the same editors.
export type StatUpdate = {
    id: string;
    // Defaults to 'stat' when absent (back-compat with existing saved rules/actions).
    kind?: StatUpdateActionKind;
    targetType: StatUpdateTargetType;
    // Which entity owns the target stat ('stat' kind) or the function stat being invoked ('function' kind).
    // Meaningful for 'actor'/'location'/'item' updates: 'any' targets every active entity of that type,
    // otherwise a specific actor/location/item id. Ignored for 'global' updates.
    targetId: ContentTarget;
    // Only meaningful when kind is 'stat': the stat being written. When kind is 'function': the function-typed
    // stat being invoked (its script is bound the resolved actor, or no target for a 'player' invocation).
    statId: string;
    operation: StatUpdateOperation;
    value: StatValue;
};

export const isFunctionInvocationUpdate = (update: StatUpdate): boolean => update.kind === 'function';

// A recurring "every <calendar condition> do these things" rule; conditions are the same ConditionCollections
// used by schedules and per-actor default rules, and are re-evaluated for each in-game period entered.
export type StatUpdateRule = {
    id: string;
    conditions: ConditionCollection[];
    updates: StatUpdate[];
};

export const cloneStatUpdate = (update: any): StatUpdate => ({
    id: update?.id || generateUuid(),
    kind: update?.kind === 'function' ? 'function' : 'stat',
    targetType: update?.targetType === 'global' ? 'global' : (CONTENT_TYPES.find(type => type === update?.targetType) || 'actor'),
    targetId: `${update?.targetId || 'any'}`,
    statId: `${update?.statId || ''}`,
    operation: update?.operation === 'set' || update?.operation === 'remove' ? update.operation : 'adjust',
    value: Array.isArray(update?.value)
        ? normalizeReferenceListValue(update.value)
        : (typeof update?.value === 'boolean' || typeof update?.value === 'number' || typeof update?.value === 'string' ? update.value : 0),
});

export const cloneStatUpdateRule = (rule: any): StatUpdateRule => ({
    id: rule?.id || generateUuid(),
    conditions: Array.isArray(rule?.conditions)
        ? rule.conditions.map((collection: unknown) => Array.isArray(collection) ? [...collection] : [])
        : [],
    updates: Array.isArray(rule?.updates) ? rule.updates.map(cloneStatUpdate) : [],
});

export const cloneStatUpdateRules = (rules: unknown): StatUpdateRule[] => (Array.isArray(rules) ? rules : []).map(cloneStatUpdateRule);

// A per-instance override of a function stat's script, keyed by the function stat's id (e.g.
// Item.functionScriptOverrides['onUse-stat-id'] holds one item's own implementation of that item stat's
// "onUse" function). Mirrors the ActorStat.perActor override pattern (see PerActorValueRuleMap).
export type FunctionScriptOverrideMap = { [statId: string]: string };

export const cloneFunctionScriptOverrideMap = (map: unknown): FunctionScriptOverrideMap => {
    const source = (map && typeof map === 'object') ? map as Record<string, unknown> : {};
    const next: FunctionScriptOverrideMap = {};
    for (const statId of Object.keys(source)) {
        if (typeof source[statId] === 'string') {
            next[statId] = source[statId] as string;
        }
    }
    return next;
};

// Resolves the effective script for invoking a function stat on a given entity instance: an explicit,
// non-empty override on that instance takes precedence, otherwise the stat definition's own script.
export const resolveFunctionScript = (stat: Stat, overrides: FunctionScriptOverrideMap | undefined): string => {
    const override = overrides?.[stat.id];
    return override && override.trim() ? override : (stat.script || '');
};

// Resolves the value a stat update writes, given the target's current value. Numeric stats evaluate the
// update's value as a dice/relative expression, so 'adjust' adds the rolled amount while 'set' replaces with
// it; non-numeric stats always write a literal value.
export const applyStatUpdateValue = (currentValue: StatValue | undefined, update: StatUpdate, stat: Stat): StatValue => {
    if (isOptionListStatType(stat.type)) {
        const changed = normalizeStatValue(Array.isArray(update.value) ? update.value : [update.value], stat) as string[];
        if (update.operation === 'set') {
            return changed;
        }
        const current = normalizeStatValue(currentValue, stat) as string[];
        return update.operation === 'remove'
            ? current.filter((id) => !changed.includes(id))
            : Array.from(new Set([...current, ...changed]));
    }

    if (!isNumericDisplayType(stat.type)) {
        return normalizeStatValue(update.value, stat);
    }

    const amount = evaluateNumericStatExpression(update.value);
    if (amount === undefined) {
        return normalizeStatValue(currentValue, stat);
    }

    if (update.operation === 'set') {
        return normalizeStatValue(amount, stat);
    }

    const base = Number.isFinite(currentValue) ? Number(currentValue) : Number(resolveStatDefault(stat)) || 0;
    return normalizeStatValue(base + amount, stat);
};