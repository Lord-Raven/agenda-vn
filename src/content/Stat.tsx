import { v4 as generateUuid } from 'uuid';
import { ActorConditionTarget, ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';

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
export type StatType = 'number' | 'option' | 'text' | 'checkbox' | 'actor' | 'actorList' | 'item' | 'itemList' | 'location' | 'locationList' | 'function';
export type StatDisplayType = 'straight' | 'percentage' | 'bar' | 'rating' | 'letter grade';
export type StatValue = number | string | boolean | string[];

export const isNumericDisplayType = (type: StatType): boolean => type === 'number';

export const isFunctionStatType = (type: StatType): boolean => type === 'function';

export const isLocationDisplayType = (type: StatType): boolean => type === 'location';

export const isLocationListDisplayType = (type: StatType): boolean => type === 'locationList';

export const isActorDisplayType = (type: StatType): boolean => type === 'actor';

export const isActorListDisplayType = (type: StatType): boolean => type === 'actorList';

export const isItemDisplayType = (type: StatType): boolean => type === 'item';

export const isItemListDisplayType = (type: StatType): boolean => type === 'itemList';

export const isReferenceDisplayType = (type: StatType): boolean => type === 'actor' || type === 'item' || type === 'location';

export const isReferenceListDisplayType = (type: StatType): boolean => type === 'actorList' || type === 'itemList' || type === 'locationList';

export const normalizeReferenceListValue = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

// The kind of content a reference stat (scalar or list) points to; shared by every place that needs to pick
// per-kind behavior (which entity collection, which UI select component, which portrait, etc.) instead of
// re-deriving it from a 6-way StatType comparison.
export type ReferenceKind = 'actor' | 'item' | 'location';

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

export const findStatOptionByValue = (stat: Stat | undefined, value: unknown): { option: StatOption; index: number; value: string } | undefined => {
    if (!stat || stat.type !== 'option' || typeof value !== 'string') {
        return undefined;
    }
    const options = stat.options || [];
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

// An entity a function script's `target` (or a `getActor`/`getLocation`/`getItem` lookup) resolves to: its
// own stats can be read/written by name via `get`/`set`, scoped to whichever stat definitions (`kind`) apply.
export type FunctionScriptEntity = {
    name: string;
    kind: 'actor' | 'location' | 'item';
    get: (statName: string) => StatValue | undefined;
    set: (statName: string, value: StatValue) => void;
};

// The bindings a function stat's script body executes with (via `new Function`, see runFunctionScript):
// `get`/`set` read/write global stats by name; `target` (when bound) is the entity this invocation concerns
// (e.g. the actor a StatUpdate targeted, or an Item's own stats); `getActor`/`getLocation`/`getItem` look up
// any other named entity's stats; `call` invokes another function stat by name (global, or - if a target/
// explicit entity is given - one scoped to that entity's kind), returning its return value.
export type FunctionScriptBindings = {
    get: (statName: string) => StatValue | undefined;
    set: (statName: string, value: StatValue) => void;
    target?: FunctionScriptEntity;
    getActor: (name: string) => FunctionScriptEntity | undefined;
    getLocation: (name: string) => FunctionScriptEntity | undefined;
    getItem: (name: string) => FunctionScriptEntity | undefined;
    call: (name: string, target?: FunctionScriptEntity) => unknown;
};

// Compiles and runs a function stat's script body with the given bindings. Scripts are plain JavaScript
// (may `return` a value) and can only touch game state through the bound accessors - never through direct
// object references - so every mutation still goes through the normal normalize/clamp pipeline.
export const runFunctionScript = (script: string | undefined, bindings: FunctionScriptBindings): unknown => {
    const body = `${script || ''}`.trim();
    if (!body) {
        return undefined;
    }
    try {
        const scriptFunction = new Function('get', 'set', 'target', 'getActor', 'getLocation', 'getItem', 'call', body);
        return scriptFunction(bindings.get, bindings.set, bindings.target, bindings.getActor, bindings.getLocation, bindings.getItem, bindings.call);
    } catch (error) {
        console.error(`Function stat script error: ${(error as Error)?.message || error}`);
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
    default: isReferenceListDisplayType(stat.type)
        ? normalizeReferenceListValue(stat.default)
        : (typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0))),
    type: stat.type,
    displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
    options: (stat.options || []).map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description,
    })),
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
        return stat.options?.[0] ? resolveStatOptionId(stat.options[0], 0) : '';
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
        const fallback = resolveStatDefault(stat, options);
        return typeof fallback === 'string' ? fallback : '';
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

export type StatUpdateTargetType = 'player' | 'actor';
export type StatUpdateOperation = 'set' | 'adjust';

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
    // Only meaningful for 'actor' updates: 'any' targets every active actor, otherwise a specific actor id.
    actorId: ActorConditionTarget;
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
    targetType: update?.targetType === 'player' ? 'player' : 'actor',
    actorId: `${update?.actorId || 'any'}`,
    statId: `${update?.statId || ''}`,
    operation: update?.operation === 'set' ? 'set' : 'adjust',
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