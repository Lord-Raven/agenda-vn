import { FC } from 'react';
import { Add, AllInclusive, ArrowDownward, ArrowUpward, Delete, DoNotDisturb, LinkOffRounded, LinkRounded, SwapHoriz } from '@mui/icons-material';
import { findStatOptionByValue, isContentListDisplayType, isOptionListStatType, isReferenceDisplayType, isReferenceListDisplayType, resolveReferenceKind, resolveStatOptionPool, Stat, StatType } from '../content/Stat';
import { Actor, getEmotionImage } from '../content/Actor';
import { CONTENT_TYPES, ContentType, Condition, ConditionCollection, ConditionComparison, FunctionCondition, GlobalStatCondition, functionConditionValueType, variableContentValue } from '../content/Condition';
import { CALENDAR_TIME_OF_DAY_ORDER, formatTimeSlot, timeSlotTerm } from '../content/CalendarEvent';
import { ActorLike, Button, ReferenceSelect, TextInput } from './UiComponents';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';
import { Stage } from '../Stage';
import { functionReference, functionReferenceId, functionSignature, GameFunction, isFunctionReference, isListValueType, isValueReference, listElementType, valuePickerOptions } from '../content/Function';
import { StatValueInput } from './StatValueInput';

interface ConditionEditorProps {
    conditionCollections: ConditionCollection[];
    globalStats: Stat[];
    actorStats?: Stat[];
    locationStats?: Stat[];
    itemStats?: Stat[];
    actors?: ActorLike[];
    items?: ItemLike[];
    locations?: LocationLike[];
    stage?: Stage | (() => Stage);
    // The content type whose context-bound entity can be targeted as 'Variable' (e.g. a scheduled actor);
    // omitted where no such entity is bound.
    variableContentType?: ContentType;
    onChange: (conditionCollections: ConditionCollection[]) => void;
    // When provided, renders a dropdown per condition collection (on its first row) letting the caller
    // tag each collection with an arbitrary category (e.g. which availability state it applies to).
    collectionCategories?: Array<{ value: string; label: string }>;
    collectionCategoryValues?: string[];
    onCollectionCategoryValuesChange?: (values: string[]) => void;
    showAddConditionButton?: boolean;
}

const COMPARISONS: Array<{ value: ConditionComparison; label: string }> = [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'greaterThanOrEqual', label: 'at least' },
    { value: 'greaterThan', label: 'more than' },
    { value: 'lessThanOrEqual', label: 'at most' },
    { value: 'lessThan', label: 'less than' },
];

const IDENTITY_COMPARISONS: Array<{ value: ConditionComparison; label: string }> = [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
];

const LIST_COMPARISONS: Array<{ value: ConditionComparison; label: string }> = [
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' },
];

const TEXT_COMPARISONS: Array<{ value: ConditionComparison; label: string }> = [
    ...IDENTITY_COMPARISONS,
    ...LIST_COMPARISONS,
];

const isListStat = (stat?: Stat): boolean => !!stat && (isReferenceListDisplayType(stat.type) || isOptionListStatType(stat.type));

const comparisonsForStat = (stat?: Stat): Array<{ value: ConditionComparison; label: string }> => {
    if (isListStat(stat)) {
        return LIST_COMPARISONS;
    }
    return stat?.type === 'text' ? TEXT_COMPARISONS : COMPARISONS;
};

const getDefaultComparison = (stat: Stat | undefined, current?: ConditionComparison): ConditionComparison => {
    const allowed = comparisonsForStat(stat);
    return current && allowed.some(comparison => comparison.value === current) ? current : allowed[0].value;
};

// Comparisons offered for a function condition, driven by the function's return type: list results compare
// per-element, and option ids compare like text (a function result carries no option pool).
const comparisonsForFunctionReturnType = (type?: StatType): Array<{ value: ConditionComparison; label: string }> => {
    if (!type) {
        return COMPARISONS;
    }
    if (isListValueType(type)) {
        return LIST_COMPARISONS;
    }
    return type === 'text' || type === 'option' ? TEXT_COMPARISONS : COMPARISONS;
};

const getDefaultFunctionConditionValue = (fn?: GameFunction): string | number | boolean => {
    const type = functionConditionValueType(fn);
    return type === 'number' ? 0 : type === 'checkbox' ? false : '';
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
    actor: 'Actor',
    location: 'Location',
    item: 'Item',
};

// Built per render rather than hoisted, since the time-of-day label depends on the active time mode.
const buildCalendarFields = () => [
    { value: 'timeOfDay', label: timeSlotTerm() },
    { value: 'dayOfWeek', label: 'Day of week' },
    { value: 'day', label: 'Day of month' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
];

const selectStyle = {
    minHeight: 38,
    width: '100%',
    maxWidth: '100%',
    background: 'var(--agenda-surface-base)',
    color: 'var(--agenda-text-primary)',
    border: '1px solid var(--agenda-line-subtle)',
    borderRadius: 6,
    padding: '0 8px',
};

const iconButtonStyle = {
    display: 'grid',
    placeItems: 'center',
    minWidth: 30,
    minHeight: 30,
    padding: 0,
};

const getConditionRowTemplate = (condition: Condition, hasCollectionCategories: boolean) => {
    const parameterColumns = condition.type === 'contentStat'
        ? ['minmax(120px, 1fr)', 'minmax(120px, 1fr)']
        : condition.type === 'calendar' || condition.type === 'globalStat' || condition.type === 'function'
            ? ['minmax(120px, 1fr)']
            : [];
    return [
        '32px',
        '32px',
        ...(hasCollectionCategories ? ['150px'] : []),
        'minmax(110px, 130px)',
        ...parameterColumns,
        'minmax(100px, 110px)',
        'minmax(120px, 1fr)',
        'auto',
    ].join(' ');
};

const getDefaultConditionValue = (stat?: Stat): string | number | boolean => {
    if (!stat) {
        return 0;
    }
    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }
    if (stat.type === 'option' || stat.type === 'optionList') {
        const defaultOption = stat.type === 'option' ? findStatOptionByValue(stat, stat.default) : undefined;
        return defaultOption?.value || resolveStatOptionPool(stat)[0]?.id || '';
    }
    if (isReferenceDisplayType(stat.type) || isReferenceListDisplayType(stat.type) || stat.type === 'text') {
        return typeof stat.default === 'string' ? stat.default : '';
    }
    return typeof stat.default === 'number' ? stat.default : 0;
};

export const createDefaultCondition = (globalStats: Stat[]): GlobalStatCondition => {
    const stat = globalStats[0];
    return { type: 'globalStat', statId: stat?.id || '', comparison: getDefaultComparison(stat), value: getDefaultConditionValue(stat) };
};

type ContentTargetEntity = { id: string; name: string; category?: string; imageUrl?: string; outfitId?: string; outfits?: Actor['outfits'] };

const resolveContentTargetImage = (contentType: ContentType, entity: ContentTargetEntity): string => {
    if (entity.imageUrl || contentType !== 'actor' || !entity.outfits?.length) {
        return entity.imageUrl || '';
    }
    return getEmotionImage(entity as Actor, 'neutral', undefined, entity.outfitId || '') || getEmotionImage(entity as Actor, 'base', undefined, entity.outfitId || '') || '';
};

// Target picker options for any content type: the meta-targets ('variable' when allowed, 'any', and 'none'
// unless disabled) followed by each concrete entity.
export const buildContentTargetOptions = (
    contentType: ContentType,
    entities: ContentTargetEntity[],
    { allowVariable = false, allowNone = true }: { allowVariable?: boolean; allowNone?: boolean } = {},
) => {
    const options: Array<{ key: string; label: string; category?: string; icon?: typeof AllInclusive; imageUrl?: string }> = [];
    if (allowVariable) {
        options.push({ key: 'variable', label: 'Variable', icon: SwapHoriz });
    }
    options.push({ key: 'any', label: 'Any', icon: AllInclusive });
    if (allowNone) {
        options.push({ key: 'none', label: 'None', icon: DoNotDisturb });
    }
    options.push(...entities.map((entity) => ({
        key: entity.id,
        label: entity.name,
        category: entity.category?.trim() || 'Uncategorized',
        imageUrl: resolveContentTargetImage(contentType, entity),
    })));
    return options;
};

const META_TARGET_KEYS = ['variable', 'any', 'none'];

export const ConditionEditor: FC<ConditionEditorProps> = ({ conditionCollections, globalStats: globalStats, actorStats = [], locationStats = [], itemStats = [], actors = [], items = [], locations = [], stage, variableContentType, onChange, collectionCategories, collectionCategoryValues, onCollectionCategoryValuesChange, showAddConditionButton = true }) => {
    const stageInstance = typeof stage === 'function' ? stage() : stage;
    const playerId = stageInstance?.getSave().playerId;
    actors = actors.filter(actor => actor.id !== playerId);
    const conditionCount = conditionCollections.reduce((total, collection) => total + collection.length, 0);
    const statsByContentType: Record<ContentType, Stat[]> = { actor: actorStats, location: locationStats, item: itemStats };
    const entitiesByContentType: Record<ContentType, ContentTargetEntity[]> = { actor: actors, location: locations, item: items };
    const targetOptionsFor = (contentType: ContentType) => buildContentTargetOptions(contentType, entitiesByContentType[contentType], { allowVariable: variableContentType === contentType });
    const concreteTargetOptionsFor = (contentType: ContentType) => targetOptionsFor(contentType).filter((option) => !META_TARGET_KEYS.includes(option.key));
    const conditionFunctions = (stageInstance?.getConfiguration().functions || []).filter(fn => fn.returnType !== 'void');
    const functionOptions = conditionFunctions.map(fn => ({ key: functionReference(fn.id), label: functionSignature(fn), category: 'Functions', description: fn.description }));
    const conditionFunction = (condition: FunctionCondition): GameFunction | undefined => conditionFunctions.find(fn => fn.id === functionReferenceId(condition.reference));
    const functionReturnTypeFor = (condition: FunctionCondition): StatType | undefined => {
        const fn = conditionFunction(condition);
        return fn && fn.returnType !== 'void' ? fn.returnType : undefined;
    };
    // A pseudo-stat letting a function condition's value input reuse the stat value machinery; option results
    // compare as plain text since a function result carries no option pool.
    const functionConditionStat = (condition: FunctionCondition): Stat | undefined => {
        const fn = conditionFunction(condition);
        if (!fn || fn.returnType === 'void') {
            return undefined;
        }
        const type = fn.returnType === 'option' || fn.returnType === 'optionList' ? 'text' : fn.returnType;
        return { id: fn.id, name: fn.name, type, default: getDefaultFunctionConditionValue(fn), guidance: fn.description, llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] } };
    };

    const updateCondition = (collectionIndex: number, conditionIndex: number, condition: Condition) => {
        onChange(conditionCollections.map((collection, currentCollectionIndex) => currentCollectionIndex === collectionIndex
            ? collection.map((current, currentConditionIndex) => currentConditionIndex === conditionIndex ? condition : current)
            : collection));
    };

    const toggleLinkedToPrevious = (collectionIndex: number, conditionIndex: number) => {
        const nextCollections = conditionCollections.map((collection) => [...collection]);
        const nextCategoryValues = collectionCategoryValues ? [...collectionCategoryValues] : undefined;
        if (conditionIndex > 0) {
            const collection = nextCollections[collectionIndex];
            nextCollections.splice(collectionIndex, 1, collection.slice(0, conditionIndex), collection.slice(conditionIndex));
            nextCategoryValues?.splice(collectionIndex, 0, nextCategoryValues[collectionIndex]);
        } else if (collectionIndex > 0) {
            nextCollections.splice(collectionIndex - 1, 2, [
                ...nextCollections[collectionIndex - 1],
                ...nextCollections[collectionIndex],
            ]);
            nextCategoryValues?.splice(collectionIndex, 1);
        }
        onChange(nextCollections);
        if (nextCategoryValues) {
            onCollectionCategoryValuesChange?.(nextCategoryValues);
        }
    };

    const moveCondition = (collectionIndex: number, conditionIndex: number, offset: -1 | 1) => {
        const flattened = conditionCollections.flatMap((collection) => collection);
        const flatIndex = conditionCollections
            .slice(0, collectionIndex)
            .reduce((total, collection) => total + collection.length, 0) + conditionIndex;
        const targetIndex = flatIndex + offset;
        if (targetIndex < 0 || targetIndex >= flattened.length) {
            return;
        }
        [flattened[flatIndex], flattened[targetIndex]] = [flattened[targetIndex], flattened[flatIndex]];

        let nextIndex = 0;
        onChange(conditionCollections.map((collection) => collection.map(() => flattened[nextIndex++])));
    };

    const deleteCondition = (collectionIndex: number, conditionIndex: number) => {
        const updatedCollections = conditionCollections.map((collection, currentCollectionIndex) => currentCollectionIndex === collectionIndex
            ? collection.filter((_, currentConditionIndex) => currentConditionIndex !== conditionIndex)
            : collection);
        const keptIndices = updatedCollections.reduce<number[]>((indices, collection, index) => {
            if (collection.length > 0) {
                indices.push(index);
            }
            return indices;
        }, []);
        onChange(keptIndices.map((index) => updatedCollections[index]));
        if (collectionCategoryValues) {
            onCollectionCategoryValuesChange?.(keptIndices.map((index) => collectionCategoryValues[index]));
        }
    };

    const statsForCondition = (condition: Condition): Stat[] => (
        condition.type === 'globalStat' ? globalStats : condition.type === 'contentStat' ? statsByContentType[condition.contentType] : []
    );

    // Encodes condition type + content type into one select value (e.g. 'contentStat:location').
    const conditionKindValue = (condition: Condition): string => (
        condition.type === 'contentStat' || condition.type === 'contentIdentity' ? `${condition.type}:${condition.contentType}` : condition.type
    );

    const createConditionOfKind = (kind: string): Condition => {
        const [type, rawContentType] = kind.split(':');
        const contentType = (CONTENT_TYPES.includes(rawContentType as ContentType) ? rawContentType : 'actor') as ContentType;
        if (type === 'globalStat') {
            return createDefaultCondition(globalStats);
        }
        if (type === 'contentIdentity') {
            return { type: 'contentIdentity', contentType, comparison: 'equals', value: concreteTargetOptionsFor(contentType)[0]?.key || '' };
        }
        if (type === 'contentStat') {
            const stat = statsByContentType[contentType][0];
            return { type: 'contentStat', contentType, targetId: targetOptionsFor(contentType)[0]?.key || 'any', statId: stat?.id || '', comparison: getDefaultComparison(stat), value: getDefaultConditionValue(stat) };
        }
        if (type === 'function') {
            const fn = conditionFunctions[0];
            return { type: 'function', reference: fn ? functionReference(fn.id) : '', comparison: comparisonsForFunctionReturnType(fn?.returnType as StatType | undefined)[0].value, value: getDefaultFunctionConditionValue(fn) };
        }
        return { type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' };
    };

    const valueTypeFor = (condition: Condition) => {
        if (condition.type === 'calendar') {
            return condition.field === 'timeOfDay' || condition.field === 'dayOfWeek' ? 'text' : 'number';
        }
        if (condition.type === 'contentIdentity') {
            return condition.contentType;
        }
        if (condition.type === 'function') {
            return functionConditionValueType(conditionFunction(condition));
        }
        const stat = statsForCondition(condition).find(candidate => candidate.id === condition.statId);
        return stat ? listElementType(stat.type) || stat.type : undefined;
    };

    const isValidSourceFor = (value: string, type: StatType, previousType?: StatType): boolean => {
        // Mixed contentList conditions compare one element, which may reference any scalar content kind.
        const types: StatType[] = type === 'contentList' ? ['actor', 'item', 'location'] : [type];
        return types.some(candidate => valuePickerOptions(stageInstance?.getConfiguration() || { globalStats }, candidate).some(option => option.key === value))
            || (!stageInstance && isFunctionReference(value) && previousType === type);
    };

    // Conditions on lists compare a single element, so scalar and list stats share a value type.
    const isValidValueFor = (value: Condition['value'], next: Condition, previous: Condition): boolean => {
        const type = valueTypeFor(next);
        if (isValueReference(value) && type) {
            return isValidSourceFor(value, type, valueTypeFor(previous));
        }
        if (next.type === 'calendar') {
            if (next.field === 'timeOfDay') {
                return CALENDAR_TIME_OF_DAY_ORDER.some(slot => slot === value);
            }
            if (next.field === 'dayOfWeek') {
                return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(String(value));
            }
        }
        if (type === 'actor' || type === 'location' || type === 'item') {
            return typeof value === 'string' && (
                concreteTargetOptionsFor(type).some(option => option.key === value)
                || (next.type !== 'contentIdentity' && (value === '' || (variableContentType === type && value === variableContentValue(type))))
            );
        }
        if (type === 'contentList') {
            return typeof value === 'string' && (
                value === ''
                || (['actor', 'item', 'location'] as const).some(kind => concreteTargetOptionsFor(kind).some(option => option.key === value))
                || (!!variableContentType && value === variableContentValue(variableContentType))
            );
        }
        if (type === 'option' && (next.type === 'globalStat' || next.type === 'contentStat')) {
            const { statId } = next;
            const stat = statsForCondition(next).find(candidate => candidate.id === statId);
            return !!findStatOptionByValue(stat, value);
        }
        if (type === 'checkbox') {
            return typeof value === 'boolean';
        }
        if (type === 'text') {
            return typeof value === 'string';
        }
        return type === 'number' && (
            (typeof value === 'number' && Number.isFinite(value))
            || (typeof value === 'string' && (valueTypeFor(previous) === 'number' || (value.trim() !== '' && Number.isFinite(Number(value)))))
        );
    };

    const retainValidSelections = (previous: Condition, next: Condition, preserveStatId = false): Condition => {
        if (next.type === 'globalStat' || next.type === 'contentStat') {
            if (preserveStatId && (previous.type === 'globalStat' || previous.type === 'contentStat')
                && statsForCondition(next).some(stat => stat.id === previous.statId)) {
                next = { ...next, statId: previous.statId };
            }
            if (next.type === 'contentStat' && previous.type === 'contentStat'
                && (targetOptionsFor(next.contentType).some(option => option.key === previous.targetId)
                    || (isValueReference(previous.targetId) && isValidSourceFor(previous.targetId, next.contentType, previous.contentType)))) {
                next = { ...next, targetId: previous.targetId };
            }
            const { statId } = next;
            const stat = statsForCondition(next).find(candidate => candidate.id === statId);
            return {
                ...next,
                comparison: getDefaultComparison(stat, previous.comparison),
                value: isValidValueFor(previous.value, next, previous) ? previous.value : getDefaultConditionValue(stat),
            };
        }
        if (next.type === 'contentIdentity') {
            return {
                ...next,
                comparison: previous.comparison === 'equals' || previous.comparison === 'notEquals' ? previous.comparison : next.comparison,
                value: typeof previous.value === 'string' && isValidValueFor(previous.value, next, previous) ? previous.value : next.value,
            };
        }
        if (next.type === 'function') {
            if (preserveStatId && previous.type === 'function' && conditionFunctions.some(fn => fn.id === functionReferenceId(previous.reference))) {
                next = { ...next, reference: previous.reference };
            }
            const fn = conditionFunction(next);
            const comparisons = comparisonsForFunctionReturnType(functionReturnTypeFor(next));
            return {
                ...next,
                comparison: comparisons.some(option => option.value === previous.comparison) ? previous.comparison : comparisons[0].value,
                value: isValidValueFor(previous.value, next, previous) ? previous.value : getDefaultFunctionConditionValue(fn),
            };
        }
        return {
            ...next,
            comparison: COMPARISONS.some(option => option.value === previous.comparison) ? previous.comparison : next.comparison,
            value: typeof previous.value !== 'boolean' && isValidValueFor(previous.value, next, previous) ? previous.value : next.value,
        };
    };

    const renderValueInput = (condition: Condition, collectionIndex: number, conditionIndex: number) => {
        const updateValue = (value: string | number | boolean) => updateCondition(collectionIndex, conditionIndex, { ...condition, value } as Condition);
        if (condition.type === 'calendar') {
            const type = condition.field === 'timeOfDay' || condition.field === 'dayOfWeek' ? 'text' : 'number';
            if (type === 'text') {
                const values = condition.field === 'timeOfDay' ? CALENDAR_TIME_OF_DAY_ORDER : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                return <SearchableOptionPicker value={String(condition.value)}
                    onChange={next => { if (typeof next === 'string') updateValue(next); }}
                    options={values.map(value => ({ key: value, label: condition.field === 'timeOfDay' ? formatTimeSlot(value) : value }))}
                    functionType="text" stage={stage} title="Choose calendar value" />;
            }
            return <StatValueInput stat={{
                id: condition.field, name: condition.field, type: 'number', default: 1, guidance: '',
                llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
            }} value={condition.value} onChange={value => { if (!Array.isArray(value)) updateValue(value); }} stage={stage} />;
        }
        if (condition.type === 'contentIdentity') {
            const concreteOptions = concreteTargetOptionsFor(condition.contentType);
            const label = CONTENT_TYPE_LABELS[condition.contentType].toLowerCase();
            return (
                <SearchableOptionPicker
                    value={condition.value}
                    onChange={(nextValue) => updateValue((Array.isArray(nextValue) ? nextValue[0] : nextValue) || concreteOptions[0]?.key || '')}
                    options={concreteOptions}
                    allowClear={false}
                    emptyLabel="None"
                    title={`Choose ${label}`}
                    placeholder={`Search ${label}s`}
                    functionType={condition.contentType}
                    stage={stage}
                />
            );
        }
        const stat = condition.type === 'globalStat' || condition.type === 'contentStat'
            ? statsForCondition(condition).find(candidate => candidate.id === condition.statId)
            : condition.type === 'function' ? functionConditionStat(condition)
                : undefined;
        // Mixed contentList conditions compare one id of any content kind; offer every concrete entity
        // (plus the Variable target when one is bound), grouped by kind.
        if (stat && isContentListDisplayType(stat.type)) {
            const options = [
                ...(variableContentType ? [{ key: variableContentValue(variableContentType), label: 'Variable', icon: SwapHoriz }] : []),
                ...(['actor', 'item', 'location'] as const).flatMap(kind =>
                    concreteTargetOptionsFor(kind).map(option => ({ ...option, category: `${CONTENT_TYPE_LABELS[kind]}s` }))),
            ];
            return (
                <SearchableOptionPicker
                    value={String(condition.value ?? '')}
                    onChange={(nextValue) => updateValue((Array.isArray(nextValue) ? nextValue[0] : nextValue) || '')}
                    options={options}
                    defaultOptionKeys={variableContentType ? [variableContentValue(variableContentType)] : []}
                    emptyLabel="None"
                    title="Choose content"
                    placeholder="Search content"
                    functionType="contentList"
                    stage={stage}
                />
            );
        }
        if (stat && !resolveReferenceKind(stat.type)) {
            return <StatValueInput stat={{ ...stat, type: listElementType(stat.type) || stat.type }} value={condition.value}
                onChange={value => {
                    if (!Array.isArray(value)) updateValue(value);
                }} stage={stage} allowExpression />;
        }
        const referenceKind = stat ? resolveReferenceKind(stat.type) : undefined;
        if (referenceKind && referenceKind === variableContentType) {
            const label = CONTENT_TYPE_LABELS[referenceKind].toLowerCase();
            const options = [
                { key: variableContentValue(referenceKind), label: 'Variable', icon: SwapHoriz },
                ...concreteTargetOptionsFor(referenceKind),
            ];
            return (
                <SearchableOptionPicker
                    value={String(condition.value ?? '')}
                    onChange={(nextValue) => updateValue((Array.isArray(nextValue) ? nextValue[0] : nextValue) || '')}
                    options={options}
                    defaultOptionKeys={[variableContentValue(referenceKind)]}
                    emptyLabel="None"
                    title={`Choose ${label}`}
                    placeholder={`Search ${label}s`}
                    functionType={referenceKind}
                    stage={stage}
                />
            );
        }
        if (referenceKind) {
            return <ReferenceSelect kind={referenceKind} value={String(condition.value ?? '')} onChange={(id) => updateValue(id)} actors={actors} items={items} locations={locations} stage={stage} style={{ width: '100%', minWidth: 0 }} />;
        }
        return <TextInput type="text" value={condition.value as number | string} placeholder="e.g. 3 or 1d6+1" onChange={(event) => {
            const raw = event.target.value;
            const numeric = Number(raw);
            updateValue(raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw);
        }} />;
    };

    let flatIndex = 0;
    return (
        <div style={{ display: 'grid', gap: 8, width: '100%', overflowX: 'hidden', minWidth: 0 }}>
            {conditionCollections.flatMap((collection, collectionIndex) => collection.map((condition, conditionIndex) => {
                const currentFlatIndex = flatIndex++;
                const isLinked = conditionIndex > 0;
                const isGrouped = collection.length > 1;
                return (
                    <div key={`${collectionIndex}-${conditionIndex}`} style={{ display: 'grid', gridTemplateColumns: getConditionRowTemplate(condition, Boolean(collectionCategories)), gap: 8, alignItems: 'center', width: '100%', minWidth: 0 }}>
                        <div style={{ alignSelf: 'stretch', borderLeft: isGrouped ? '2px solid var(--agenda-accent-primary)' : undefined, borderTop: isGrouped && conditionIndex === 0 ? '2px solid var(--agenda-accent-primary)' : undefined, borderBottom: isGrouped && conditionIndex === collection.length - 1 ? '2px solid var(--agenda-accent-primary)' : undefined }} />
                        <Button
                            variant="secondary"
                            disabled={currentFlatIndex === 0}
                            onClick={() => toggleLinkedToPrevious(collectionIndex, conditionIndex)}
                            style={{ ...iconButtonStyle, opacity: currentFlatIndex === 0 ? 0.35 : 1 }}
                            aria-label={isLinked ? 'Unlink condition from the condition above' : 'Join condition to the condition above'}
                        >
                            {isLinked ? <LinkRounded fontSize="small" /> : <LinkOffRounded fontSize="small" />}
                        </Button>
                        {collectionCategories && (
                            conditionIndex === 0 ? (
                                <select
                                    style={selectStyle}
                                    value={collectionCategoryValues?.[collectionIndex] ?? collectionCategories[0]?.value}
                                    onChange={(event) => {
                                        if (!collectionCategoryValues) {
                                            return;
                                        }
                                        const nextValues = [...collectionCategoryValues];
                                        nextValues[collectionIndex] = event.target.value;
                                        onCollectionCategoryValuesChange?.(nextValues);
                                    }}
                                >
                                    {collectionCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                                </select>
                            ) : <div />
                        )}
                        <select
                            style={selectStyle}
                            value={conditionKindValue(condition)}
                            onChange={(event) => updateCondition(collectionIndex, conditionIndex, retainValidSelections(condition, createConditionOfKind(event.target.value), true))}
                        >
                            <option value="calendar">Calendar</option>
                            <option value="globalStat">Global Stat</option>
                            {CONTENT_TYPES
                                .filter((contentType) => statsByContentType[contentType].length > 0 || conditionKindValue(condition) === `contentStat:${contentType}`)
                                .map((contentType) => <option key={contentType} value={`contentStat:${contentType}`}>{CONTENT_TYPE_LABELS[contentType]} Stat</option>)}
                            {variableContentType && <option value={`contentIdentity:${variableContentType}`}>{CONTENT_TYPE_LABELS[variableContentType]} Identity</option>}
                            {(conditionFunctions.length > 0 || condition.type === 'function') && <option value="function">Function</option>}
                        </select>
                        {condition.type === 'calendar' ? (
                            <select style={selectStyle} value={condition.field} onChange={(event) => updateCondition(collectionIndex, conditionIndex, retainValidSelections(condition, { ...condition, field: event.target.value as typeof condition.field, value: event.target.value === 'timeOfDay' ? 'morning' : event.target.value === 'dayOfWeek' ? 'monday' : 1 }))}>
                                {buildCalendarFields().map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
                            </select>
                        ) : condition.type === 'contentStat' ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                                <SearchableOptionPicker
                                    value={condition.targetId}
                                    onChange={(nextValue) => updateCondition(collectionIndex, conditionIndex, { ...condition, targetId: (Array.isArray(nextValue) ? nextValue[0] : nextValue) || (variableContentType === condition.contentType ? 'variable' : 'any') })}
                                    options={targetOptionsFor(condition.contentType)}
                                    defaultOptionKeys={variableContentType === condition.contentType ? META_TARGET_KEYS : ['any', 'none']}
                                    allowClear={false}
                                    emptyLabel="None"
                                    title={`Choose ${CONTENT_TYPE_LABELS[condition.contentType].toLowerCase()} target`}
                                    placeholder={`Search ${CONTENT_TYPE_LABELS[condition.contentType].toLowerCase()}s`}
                                    functionType={condition.contentType}
                                    stage={stage}
                                />
                            </div>
                        ) : condition.type === 'function' ? (
                            <SearchableOptionPicker
                                value={condition.reference}
                                onChange={(nextValue) => {
                                    const reference = (Array.isArray(nextValue) ? nextValue[0] : nextValue) || '';
                                    updateCondition(collectionIndex, conditionIndex, retainValidSelections(condition, { ...condition, reference }));
                                }}
                                options={functionOptions}
                                allowClear={false}
                                emptyLabel="None"
                                title="Choose function"
                                placeholder="Search functions"
                                stage={stage}
                            />
                        ) : null}
                        {(condition.type === 'globalStat' || condition.type === 'contentStat') && (
                            <select style={selectStyle} value={condition.statId} onChange={(event) => {
                                const stat = statsForCondition(condition).find(candidate => candidate.id === event.target.value);
                                updateCondition(collectionIndex, conditionIndex, retainValidSelections(condition, { ...condition, statId: event.target.value, comparison: getDefaultComparison(stat), value: getDefaultConditionValue(stat) }));
                            }}>
                                {statsForCondition(condition).map(stat => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                            </select>
                        )}
                        {condition.type === 'calendar' && (
                            <select style={selectStyle} value={condition.comparison} onChange={(event) => updateCondition(collectionIndex, conditionIndex, { ...condition, comparison: event.target.value as ConditionComparison } as Condition)}>
                                {COMPARISONS.map(comparison => <option key={comparison.value} value={comparison.value}>{comparison.label}</option>)}
                            </select>
                        )}
                        {condition.type !== 'calendar' && (
                            <select style={selectStyle} value={condition.comparison} onChange={(event) => updateCondition(collectionIndex, conditionIndex, { ...condition, comparison: event.target.value as ConditionComparison } as Condition)}>
                                {(condition.type === 'contentIdentity'
                                    ? IDENTITY_COMPARISONS
                                    : condition.type === 'function'
                                        ? comparisonsForFunctionReturnType(functionReturnTypeFor(condition))
                                        : comparisonsForStat(statsForCondition(condition).find(candidate => candidate.id === condition.statId))
                                ).map(comparison => <option key={comparison.value} value={comparison.value}>{comparison.label}</option>)}
                            </select>
                        )}
                        {renderValueInput(condition, collectionIndex, conditionIndex)}
                        <div style={{ display: 'flex', gap: 4 }}>
                            <Button variant="secondary" disabled={currentFlatIndex === 0} onClick={() => moveCondition(collectionIndex, conditionIndex, -1)} style={iconButtonStyle} aria-label="Move condition up"><ArrowUpward fontSize="small" /></Button>
                            <Button variant="secondary" disabled={currentFlatIndex === conditionCount - 1} onClick={() => moveCondition(collectionIndex, conditionIndex, 1)} style={iconButtonStyle} aria-label="Move condition down"><ArrowDownward fontSize="small" /></Button>
                            <Button variant="danger" onClick={() => deleteCondition(collectionIndex, conditionIndex)} style={iconButtonStyle} aria-label="Delete condition"><Delete fontSize="small" /></Button>
                        </div>
                    </div>
                );
            }))}
            {showAddConditionButton && (
                <Button
                    variant="secondary"
                    onClick={() => {
                        onChange([...conditionCollections, [createDefaultCondition(globalStats)]]);
                        if (collectionCategoryValues) {
                            onCollectionCategoryValuesChange?.([...collectionCategoryValues, collectionCategories?.[0]?.value || '']);
                        }
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}
                >
                    <Add fontSize="small" /> Add condition
                </Button>
            )}
        </div>
    );
};