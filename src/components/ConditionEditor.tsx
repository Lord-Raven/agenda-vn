import { FC } from 'react';
import { Add, AllInclusive, ArrowDownward, ArrowUpward, Delete, DoNotDisturb, LinkOffRounded, LinkRounded, SwapHoriz } from '@mui/icons-material';
import { findStatOptionByValue, getStatOptionValue, isReferenceDisplayType, resolveReferenceKind, Stat } from '../content/Stat';
import { Actor, getEmotionImage } from '../content/Actor';
import { CONTENT_TYPES, ContentType, Condition, ConditionCollection, ConditionComparison } from '../content/Condition';
import { ActorLike, Button, ReferenceSelect, TextInput } from './UiComponents';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';

interface ConditionEditorProps {
    conditionCollections: ConditionCollection[];
    globalStats: Stat[];
    actorStats?: Stat[];
    locationStats?: Stat[];
    itemStats?: Stat[];
    actors?: ActorLike[];
    items?: ItemLike[];
    locations?: LocationLike[];
    // The content type whose context-bound entity can be targeted as 'Variable' (e.g. the actor a perActor
    // stat rule is being resolved for); omitted where no such entity is bound.
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

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
    actor: 'Actor',
    location: 'Location',
    item: 'Item',
};

const CALENDAR_FIELDS = [
    { value: 'timeOfDay', label: 'Time of day' },
    { value: 'dayOfWeek', label: 'Day of week' },
    { value: 'day', label: 'Day of month' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
] as const;

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
        : condition.type === 'calendar' || condition.type === 'globalStat'
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
    if (stat.type === 'option') {
        const defaultOption = findStatOptionByValue(stat, stat.default);
        return defaultOption?.value || (stat.options?.[0] ? getStatOptionValue(stat.options[0], 0) : '');
    }
    if (isReferenceDisplayType(stat.type)) {
        return typeof stat.default === 'string' ? stat.default : '';
    }
    return typeof stat.default === 'number' ? stat.default : 0;
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

export const ConditionEditor: FC<ConditionEditorProps> = ({ conditionCollections, globalStats: globalStats, actorStats = [], locationStats = [], itemStats = [], actors = [], items = [], locations = [], variableContentType, onChange, collectionCategories, collectionCategoryValues, onCollectionCategoryValuesChange, showAddConditionButton = true }) => {
    const conditionCount = conditionCollections.reduce((total, collection) => total + collection.length, 0);
    const statsByContentType: Record<ContentType, Stat[]> = { actor: actorStats, location: locationStats, item: itemStats };
    const entitiesByContentType: Record<ContentType, ContentTargetEntity[]> = { actor: actors, location: locations, item: items };
    const targetOptionsFor = (contentType: ContentType) => buildContentTargetOptions(contentType, entitiesByContentType[contentType], { allowVariable: variableContentType === contentType });
    const concreteTargetOptionsFor = (contentType: ContentType) => targetOptionsFor(contentType).filter((option) => !META_TARGET_KEYS.includes(option.key));

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
            const stat = globalStats[0];
            return { type: 'globalStat', statId: stat?.id || '', comparison: 'equals', value: getDefaultConditionValue(stat) };
        }
        if (type === 'contentIdentity') {
            return { type: 'contentIdentity', contentType, comparison: 'equals', value: concreteTargetOptionsFor(contentType)[0]?.key || '' };
        }
        if (type === 'contentStat') {
            const stat = statsByContentType[contentType][0];
            return { type: 'contentStat', contentType, targetId: targetOptionsFor(contentType)[0]?.key || 'any', statId: stat?.id || '', comparison: 'equals', value: getDefaultConditionValue(stat) };
        }
        return { type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' };
    };

    const renderValueInput = (condition: Condition, collectionIndex: number, conditionIndex: number) => {
        const updateValue = (value: string | number | boolean) => updateCondition(collectionIndex, conditionIndex, { ...condition, value } as Condition);
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
                />
            );
        }
        if (condition.type === 'calendar' && condition.field === 'timeOfDay') {
            return <select style={selectStyle} value={String(condition.value ?? '')} onChange={(event) => updateValue(event.target.value)}>{['morning', 'afternoon', 'evening', 'night'].map(value => <option key={value} value={value}>{value}</option>)}</select>;
        }
        if (condition.type === 'calendar' && condition.field === 'dayOfWeek') {
            return <select style={selectStyle} value={String(condition.value ?? '')} onChange={(event) => updateValue(event.target.value)}>{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(value => <option key={value} value={value}>{value}</option>)}</select>;
        }
        const stat = condition.type === 'globalStat' || condition.type === 'contentStat'
            ? statsForCondition(condition).find(candidate => candidate.id === condition.statId)
            : undefined;
        if (stat?.type === 'option') {
            const selectedOption = findStatOptionByValue(stat, condition.value);
            return <select style={selectStyle} value={selectedOption?.value || ''} onChange={(event) => updateValue(event.target.value)}>{(stat.options || []).map((option, optionIndex) => {
                const optionValue = getStatOptionValue(option, optionIndex);
                return <option key={optionValue} value={optionValue}>{option.name}</option>;
            })}</select>;
        }
        if (stat?.type === 'checkbox') {
            return <input type="checkbox" checked={Boolean(condition.value === true || condition.value === 'true')} onChange={(event) => updateValue(event.target.checked)} />;
        }
        const referenceKind = stat ? resolveReferenceKind(stat.type) : undefined;
        if (referenceKind) {
            return <ReferenceSelect kind={referenceKind} value={String(condition.value ?? '')} onChange={(id) => updateValue(id)} actors={actors} items={items} locations={locations} style={{ width: '100%', minWidth: 0 }} />;
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
                            onChange={(event) => updateCondition(collectionIndex, conditionIndex, createConditionOfKind(event.target.value))}
                        >
                            <option value="calendar">Calendar</option>
                            <option value="globalStat">Global Stat</option>
                            {CONTENT_TYPES
                                .filter((contentType) => statsByContentType[contentType].length > 0 || conditionKindValue(condition) === `contentStat:${contentType}`)
                                .map((contentType) => <option key={contentType} value={`contentStat:${contentType}`}>{CONTENT_TYPE_LABELS[contentType]} Stat</option>)}
                            {variableContentType && <option value={`contentIdentity:${variableContentType}`}>{CONTENT_TYPE_LABELS[variableContentType]} Identity</option>}
                        </select>
                        {condition.type === 'calendar' ? (
                            <select style={selectStyle} value={condition.field} onChange={(event) => updateCondition(collectionIndex, conditionIndex, { ...condition, field: event.target.value as typeof condition.field, value: event.target.value === 'timeOfDay' ? 'morning' : event.target.value === 'dayOfWeek' ? 'monday' : 1 })}>
                                {CALENDAR_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
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
                                />
                            </div>
                        ) : null}
                        {(condition.type === 'globalStat' || condition.type === 'contentStat') && (
                            <select style={selectStyle} value={condition.statId} onChange={(event) => {
                                const stat = statsForCondition(condition).find(candidate => candidate.id === event.target.value);
                                updateCondition(collectionIndex, conditionIndex, { ...condition, statId: event.target.value, value: getDefaultConditionValue(stat) });
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
                                {(condition.type === 'contentIdentity' ? IDENTITY_COMPARISONS : COMPARISONS).map(comparison => <option key={comparison.value} value={comparison.value}>{comparison.label}</option>)}
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
                        onChange([...conditionCollections, [{ type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' }]]);
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