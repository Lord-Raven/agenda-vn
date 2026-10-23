import { v4 as generateUuid } from 'uuid';
import { ContentTarget, ContentType, CONTENT_TYPES, ConditionCollection, ConditionContext, evaluateConditionCollections } from './Condition';
import type { FunctionInvocation, FunctionValueResolver } from './Function';
import { isValueReference } from './Function';
import { isNumericValueExpression } from './ValueExpression';

// A boolean field whose effective value can be gated by conditions instead of always being fixed. With no
// conditions, `value` always applies. With conditions, `value` applies only while at least one collection is
// satisfied; otherwise the opposite of `value` applies (e.g. used for a stat's llmSees/llmMaintained
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

// Reference stats hold content IDs rather than display values. List variants hold a set of IDs.
// 'optionList' holds a pool of options (Stat.options) whose value is the list of currently active option ids;
// 'option' stats may pull their choices from one via Stat.optionSourceStatId.
export type StatType = 'number' | 'option' | 'optionList' | 'text' | 'checkbox' | 'actor' | 'actorList' | 'item' | 'itemList' | 'location' | 'locationList';
export type StatValue = number | string | boolean | string[];

export const isNumericDisplayType = (type: StatType): boolean => type === 'number';

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
export type OptionListSourceResolver = (statId: string) => { stat: Stat; value?: StatValue; resolveValue?: FunctionValueResolver } | undefined;
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
    resolveValue?: FunctionValueResolver;
};

const resolveOptionListSource = (statId: string, context?: OptionListSourceContext): ReturnType<OptionListSourceResolver> => {
    const resolved = optionListSourceResolver?.(statId);
    const stat = context?.sourceStats?.find((candidate) => candidate.id === statId) || resolved?.stat;
    if (stat?.type !== 'optionList') {
        return undefined;
    }
    return { stat, value: context?.entityStatValues?.[statId] ?? context?.globalStatValues?.[statId] ?? resolved?.value,
        resolveValue: context?.resolveValue ?? resolved?.resolveValue };
};

export const isSourcedOptionStat = (stat: Stat | undefined): boolean => (
    (stat?.type === 'option' || stat?.type === 'optionList') && !!stat.optionSourceStatId?.trim()
);

// Ids are materialized so filtering the list later doesn't change index-derived fallback ids.
const materializeOptions = (options: StatOption[] | undefined): StatOption[] => (
    (options || []).map((option, index) => ({ ...option, id: resolveStatOptionId(option, index) }))
);

// Every option a stat's value may refer to: its own options, or (for a sourced option stat) the source
// optionList's full pool, including options not currently active.
export const resolveStatOptionPool = (stat: Stat | undefined, context?: OptionListSourceContext): StatOption[] => {
    const visited = new Set<string>();
    while (stat && isSourcedOptionStat(stat)) {
        if (visited.has(stat.id)) {
            return [];
        }
        visited.add(stat.id);
        stat = resolveOptionListSource(stat.optionSourceStatId!, context)?.stat;
    }
    return materializeOptions(stat?.options);
};

// The options currently offered for selection. For a sourced option stat, only those active in the source
// optionList's value; `currentValue`'s option is always kept so an existing selection still renders.
export const resolveAvailableStatOptions = (stat: Stat | undefined, currentValue?: unknown, context?: OptionListSourceContext): StatOption[] => {
    const pool = resolveStatOptionPool(stat, context);
    if (!stat || !isSourcedOptionStat(stat)) {
        return pool;
    }
    let available = pool;
    let current = stat;
    const visited = new Set<string>();
    while (isSourcedOptionStat(current) && !visited.has(current.id)) {
        visited.add(current.id);
        const source = resolveOptionListSource(current.optionSourceStatId!, context);
        if (!source) {
            break;
        }
        const activeIds = new Set(resolveStatValue(source.value, { ...source.stat, options: pool, optionSourceStatId: undefined }, source) as string[]);
        available = available.filter(option => activeIds.has(option.id!));
        current = source.stat;
    }
    const availableIds = new Set(available.map(option => option.id!));
    const currentIds = new Set((Array.isArray(currentValue) ? currentValue : [currentValue])
        .map(value => findStatOptionByValue(stat, value, context)?.value));
    return pool.filter(option => availableIds.has(option.id!) || currentIds.has(option.id!));
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

// An ordered default-value rule; the first rule whose conditions are satisfied wins.
export type StatValueRule = {
    id: string;
    value: StatValue;
    conditions: ConditionCollection[];
};

// A custom stat definition shared by global, actor, location, and item stats.
export type Stat = {
    id: string;
    name: string;
    // For global stats: rules used to resolve this stat's initial value when a new game starts, evaluated in
    // order (first matching wins); falls back to `default` if none match. See buildInitialGlobalStatValues.
    defaultValueRules?: StatValueRule[];
    llmSees: ConditionalFlag; // If true (the resolved value), this stat can be included in context provided to the LLM; if false, this stat is omitted from context (intended for purely mechanical use); if false, llmMaintained is also treated as false.
    llmMaintained: ConditionalFlag; // If true (the resolved value), this stat can be updated by the LLM in skit outcomes (see Skit.tsx).
    guidance: string; // Guidance for the LLM on how to handle this stat. If llmSees is false, the blank for editing this can be omitted from StatManagementPanel.
    default: StatValue;
    type: StatType;
    options?: StatOption[];
    // For 'option' and 'optionList': id of an 'optionList' stat to take options from instead of `options`.
    optionSourceStatId?: string;
    min?: number;
    max?: number;
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
    defaultValueRules: cloneStatValueRules(stat.defaultValueRules),
    llmSees: cloneConditionalFlag(stat.llmSees, true),
    llmMaintained: cloneConditionalFlag(stat.llmMaintained, true),
    guidance: stat.guidance,
    default: isValueReference(stat.default) ? stat.default : isReferenceListDisplayType(stat.type) || isOptionListStatType(stat.type)
        ? normalizeReferenceListValue(stat.default)
        : (typeof stat.default === 'boolean' ? stat.default : (typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : (stat.type === 'checkbox' ? false : 0))),
    type: stat.type,
    options: (stat.options || []).map((option) => ({
        id: option.id,
        name: option.name,
        description: option.description,
    })),
    optionSourceStatId: isSourcedOptionStat(stat) ? stat.optionSourceStatId : undefined,
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
});

export const isStatLlmSeen = (stat: Stat, context: ConditionContext): boolean => resolveConditionalFlag(stat.llmSees, context, true);
export const isStatLlmMaintained = (stat: Stat, context: ConditionContext): boolean => (
    isStatLlmSeen(stat, context) && resolveConditionalFlag(stat.llmMaintained, context, true)
);

export const resolveStatDefault = (stat: Stat, options: StatValueOptions = {}): StatValue => {
    if (isValueReference(stat.default) || (stat.type === 'number' && isNumericValueExpression(stat.default) && !options.evaluateDiceNotation)) {
        return stat.default;
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
    if (value == null && (isValueReference(stat.default) || (stat.type === 'number' && isNumericValueExpression(stat.default) && !options.evaluateDiceNotation))) {
        return stat.default;
    }
    if (isValueReference(value)) {
        return value;
    }
    if (stat.type === 'number' && isNumericValueExpression(value) && !options.evaluateDiceNotation) {
        return value;
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

export const resolveStatValue = (value: unknown, stat: Stat, context: { resolveValue?: FunctionValueResolver }): StatValue => {
    if (!context.resolveValue) {
        return normalizeStatValue(value, stat);
    }
    const resolved = context.resolveValue(value ?? stat.default, stat.type);
    return normalizeStatValue(resolved, { ...stat, default: resolved });
};

// Maps option ids/names to canonical ids of an optionList's pool, dropping unknown entries and duplicates.
const normalizeOptionListIds = (values: unknown[], stat: Stat): string[] => {
    if (isSourcedOptionStat(stat) && resolveStatOptionPool(stat).length === 0) {
        return Array.from(new Set(normalizeReferenceListValue(values)));
    }
    const ids = values
        .map((entry) => isValueReference(entry) ? entry : findStatOptionByValue(stat, entry)?.value)
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
    const defaultValue = resolveStatDefault(nextStat);
    const defaultIds = new Set(Array.isArray(defaultValue) ? defaultValue : []);
    const addedIds = resolveStatOptionPool(nextStat)
        .map((option) => option.id!)
        .filter((id) => !previousIds.has(id) && defaultIds.has(id) && !value.includes(id));
    return addedIds.length ? [...value, ...addedIds] : value;
};

// Returns the first matching rule's value, or undefined so the caller can use the stat's default.
export const resolveStatValueRule = (
    rules: StatValueRule[] | undefined,
    stat: Stat,
    context: ConditionContext,
): StatValue | undefined => {
    const matchedRule = (rules || []).find((rule) => evaluateConditionCollections(rule.conditions, context));
    return matchedRule ? normalizeStatValue(matchedRule.value, stat) : undefined;
};

export const buildInitialGlobalStatValues = (
    stats: Stat[],
    selectedValues: Record<string, StatValue> = {},
    context: ConditionContext = {},
    values: Record<string, StatValue> = {},
): Record<string, StatValue> => {
    const initialContext = { ...context, globalStats: stats, globalStatValues: values };
    stats.filter(stat => stat?.id && stat.name?.trim()).forEach(stat => {
        const selectedValue = selectedValues[stat.id];
        const value = selectedValue !== undefined
            ? normalizeStatValue(selectedValue, stat)
            : resolveStatValueRule(stat.defaultValueRules, stat, initialContext) ?? normalizeStatValue(undefined, stat);
        values[stat.id] = resolveStatValue(value, stat, initialContext);
    });
    return values;
};

export type StatUpdateTargetType = 'global' | ContentType;
// For optionList stats, 'adjust' adds the given options to the active list and 'remove' removes them.
export type StatUpdateOperation = 'set' | 'adjust' | 'remove';

// A stat write, sharing the same value and expression support as StatValueRule.
export type StatUpdate = {
    id: string;
    // Defaults to 'stat' when absent (back-compat with existing saved rules/actions).
    kind?: 'stat';
    targetType: StatUpdateTargetType;
    // Which entity owns the target stat.
    // Meaningful for 'actor'/'location'/'item' updates: 'any' targets every active entity of that type,
    // otherwise a specific actor/location/item id. Ignored for 'global' updates.
    targetId: ContentTarget;
    statId: string;
    operation: StatUpdateOperation;
    value: StatValue;
};

export type GameAction = StatUpdate | FunctionInvocation;

export type SkitStatReference = {
    targetType: StatUpdateTargetType;
    targetId: string;
    statId: string;
};

export type SkitActionValue = StatValue | SkitStatReference;

export type StartSkitAction = {
    id: string;
    kind: 'skit';
    locationId: SkitActionValue;
    actorIds: SkitActionValue;
    guidance?: SkitActionValue;
};

export type StatUpdateAction = GameAction | StartSkitAction;

// Conditions use the same collections as schedules and default-value rules. Missing triggers retain
// the original recurring behavior; startup rules run only when a new save is initialized.
export type StatUpdateRule = {
    id: string;
    trigger?: 'timePeriod' | 'startup';
    conditions: ConditionCollection[];
    updates: StatUpdateAction[];
};

export const cloneStatUpdate = (update: any): StatUpdate => ({
    id: update?.id || generateUuid(),
    kind: 'stat',
    targetType: update?.targetType === 'global' ? 'global' : (CONTENT_TYPES.find(type => type === update?.targetType) || 'actor'),
    targetId: `${update?.targetId || 'any'}`,
    statId: `${update?.statId || ''}`,
    operation: update?.operation === 'set' || update?.operation === 'remove' ? update.operation : 'adjust',
    value: Array.isArray(update?.value)
        ? normalizeReferenceListValue(update.value)
        : (typeof update?.value === 'boolean' || typeof update?.value === 'number' || typeof update?.value === 'string' ? update.value : 0),
});

export const cloneGameAction = (source: unknown): GameAction => {
    const action = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    return action.kind === 'function'
        ? { id: typeof action.id === 'string' && action.id ? action.id : generateUuid(), kind: 'function', functionId: typeof action.functionId === 'string' ? action.functionId : '' }
        : cloneStatUpdate(action);
};

const cloneSkitActionValue = (value: unknown, fallback: StatValue): SkitActionValue => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const reference = value as Partial<SkitStatReference>;
        return {
            targetType: reference.targetType === 'global' ? 'global' : CONTENT_TYPES.find(type => type === reference.targetType) || 'actor',
            targetId: typeof reference.targetId === 'string' ? reference.targetId : '',
            statId: typeof reference.statId === 'string' ? reference.statId : '',
        };
    }
    return Array.isArray(value) ? normalizeReferenceListValue(value)
        : typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' ? value : fallback;
};

export const cloneStatUpdateAction = (source: unknown): StatUpdateAction => {
    const action = source && typeof source === 'object' ? source as Record<string, unknown> : {};
    if (action.kind !== 'skit') {
        return cloneGameAction(source);
    }
    return {
        id: typeof action.id === 'string' && action.id ? action.id : generateUuid(),
        kind: 'skit',
        locationId: cloneSkitActionValue(action.locationId, ''),
        actorIds: cloneSkitActionValue(action.actorIds, []),
        ...(action.guidance === undefined ? {} : { guidance: cloneSkitActionValue(action.guidance, '') }),
    };
};

export const cloneStatUpdateRule = (rule: any): StatUpdateRule => ({
    id: rule?.id || generateUuid(),
    trigger: rule?.trigger === 'startup' ? 'startup' : 'timePeriod',
    conditions: Array.isArray(rule?.conditions)
        ? rule.conditions.map((collection: unknown) => Array.isArray(collection) ? [...collection] : [])
        : [],
    updates: Array.isArray(rule?.updates) ? rule.updates.map(cloneStatUpdateAction) : [],
});

export const cloneStatUpdateRules = (rules: unknown): StatUpdateRule[] => (Array.isArray(rules) ? rules : []).map(cloneStatUpdateRule);

// Resolves the value a stat update writes, given the target's current value. Numeric stats evaluate the
// update's value as a dice/relative expression, so 'adjust' adds the rolled amount while 'set' replaces with
// it; value references must be resolved by the caller before applying the update.
export const applyStatUpdateValue = (currentValue: StatValue | undefined, update: StatUpdate, stat: Stat): StatValue => {
    if (update.operation === 'set' && isValueReference(update.value)) {
        return update.value;
    }
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