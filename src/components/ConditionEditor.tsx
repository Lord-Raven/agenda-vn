import { FC } from 'react';
import { Add, AllInclusive, ArrowDownward, ArrowUpward, Delete, LinkOffRounded, LinkRounded, PersonOffOutlined, SwapHoriz } from '@mui/icons-material';
import { Stat } from '../content/Stat';
import { Actor, getEmotionImage } from '../content/Actor';
import { ActorConditionTarget, Condition, ConditionCollection, ConditionComparison } from '../content/Condition';
import { Button, LocationSelect, TextInput } from './UiComponents';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { LocationLike } from './LocationPortrait';

interface ConditionEditorProps {
    conditionCollections: ConditionCollection[];
    globalStats: Stat[];
    actorStats?: Stat[];
    actors?: Array<{ id: string; name: string; category?: string }>;
    locations?: LocationLike[];
    allowVariableActorTarget?: boolean;
    onChange: (conditionCollections: ConditionCollection[]) => void;
    // When provided, renders a dropdown per condition collection (on its first row) letting the caller
    // tag each collection with an arbitrary category (e.g. which availability state it applies to).
    collectionCategories?: Array<{ value: string; label: string }>;
    collectionCategoryValues?: string[];
    onCollectionCategoryValuesChange?: (values: string[]) => void;
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
    const parameterColumns = condition.type === 'actorStat'
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
        return typeof stat.default === 'string' ? stat.default : (stat.options?.[0]?.name || '');
    }
    if (stat.type === 'location') {
        return typeof stat.default === 'string' ? stat.default : '';
    }
    return typeof stat.default === 'number' ? stat.default : 0;
};

export const buildActorTargetOptions = (actors: Array<{ id: string; name: string; category?: string; imageUrl?: string; outfitId?: string; outfits?: Actor['outfits'] }>, allowVariableActorTarget: boolean) => {
    const options: Array<{ key: string; label: string; category?: string; icon?: typeof AllInclusive; imageUrl?: string }> = [];
    if (allowVariableActorTarget) {
        options.push({ key: 'variable', label: 'Variable', icon: SwapHoriz });
    }
    options.push({ key: 'any', label: 'Any', icon: AllInclusive }, { key: 'none', label: 'None', icon: PersonOffOutlined });
    options.push(...actors.map((actor) => {
        const portraitUrl = actor.imageUrl || (
            actor.outfits && actor.outfits.length > 0
                ? getEmotionImage(actor as Actor, 'neutral', undefined, actor.outfitId || '') || getEmotionImage(actor as Actor, 'base', undefined, actor.outfitId || '')
                : ''
        );
        return { key: actor.id, label: actor.name, category: actor.category?.trim() || 'Uncategorized', imageUrl: portraitUrl || '' };
    }));
    return options;
};

export const ConditionEditor: FC<ConditionEditorProps> = ({ conditionCollections, globalStats: globalStats, actorStats = [], actors = [], locations = [], allowVariableActorTarget = false, onChange, collectionCategories, collectionCategoryValues, onCollectionCategoryValuesChange }) => {
    const conditionCount = conditionCollections.reduce((total, collection) => total + collection.length, 0);
    const actorTargetOptions = buildActorTargetOptions(actors, allowVariableActorTarget);
    const concreteActorOptions = actorTargetOptions.filter((option) => !['variable', 'any', 'none'].includes(option.key));

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

    const renderValueInput = (condition: Condition, collectionIndex: number, conditionIndex: number) => {
        const updateValue = (value: string | number | boolean) => updateCondition(collectionIndex, conditionIndex, { ...condition, value } as Condition);
        if (condition.type === 'actorIdentity') {
            return (
                <SearchableOptionPicker
                    value={condition.value}
                    onChange={(nextValue) => updateValue((Array.isArray(nextValue) ? nextValue[0] : nextValue) || concreteActorOptions[0]?.key || '')}
                    options={concreteActorOptions.map((option) => ({ key: option.key, label: option.label, category: option.category, icon: option.icon, imageUrl: option.imageUrl }))}
                    allowClear={false}
                    emptyLabel="None"
                    title="Choose actor"
                    placeholder="Search actors"
                />
            );
        }
        if (condition.type === 'calendar' && condition.field === 'timeOfDay') {
            return <select style={selectStyle} value={String(condition.value ?? '')} onChange={(event) => updateValue(event.target.value)}>{['morning', 'afternoon', 'evening', 'night'].map(value => <option key={value} value={value}>{value}</option>)}</select>;
        }
        if (condition.type === 'calendar' && condition.field === 'dayOfWeek') {
            return <select style={selectStyle} value={String(condition.value ?? '')} onChange={(event) => updateValue(event.target.value)}>{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(value => <option key={value} value={value}>{value}</option>)}</select>;
        }
        const stat = condition.type === 'globalStat' ? globalStats.find(candidate => candidate.id === condition.statId) : (condition.type === 'actorStat' ? actorStats.find(candidate => candidate.id === condition.statId) : undefined);
        if (stat?.type === 'option') {
            return <select style={selectStyle} value={String(condition.value ?? '')} onChange={(event) => updateValue(event.target.value)}>{(stat.options || []).map(option => <option key={option.name} value={option.name}>{option.name}</option>)}</select>;
        }
        if (stat?.type === 'checkbox') {
            return <input type="checkbox" checked={Boolean(condition.value === true || condition.value === 'true')} onChange={(event) => updateValue(event.target.checked)} />;
        }
        if (stat?.type === 'location') {
            return <LocationSelect value={String(condition.value ?? '')} onChange={(locationId) => updateValue(locationId)} locations={locations} style={{ width: '100%', minWidth: 0 }} />;
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
                            value={condition.type}
                            onChange={(event) => {
                                const nextType = event.target.value as 'calendar' | 'globalStat' | 'actorStat' | 'actorIdentity';
                                if (nextType === 'calendar') {
                                    updateCondition(collectionIndex, conditionIndex, { type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' });
                                    return;
                                }
                                if (nextType === 'globalStat') {
                                    const stat = globalStats[0];
                                    updateCondition(collectionIndex, conditionIndex, { type: 'globalStat', statId: stat?.id || '', comparison: 'equals', value: getDefaultConditionValue(stat) });
                                    return;
                                }
                                const target = actorTargetOptions[0]?.key || 'any';
                                if (nextType === 'actorIdentity') {
                                    updateCondition(collectionIndex, conditionIndex, { type: 'actorIdentity', comparison: 'equals', value: concreteActorOptions[0]?.key || '' });
                                    return;
                                }
                                const actorStat = actorStats[0];
                                updateCondition(collectionIndex, conditionIndex, { type: 'actorStat', actorId: target, statId: actorStat?.id || '', comparison: 'equals', value: getDefaultConditionValue(actorStat) });
                            }}
                        >
                            <option value="calendar">Calendar</option>
                            <option value="globalStat">Global Stat</option>
                            <option value="actorStat">Actor Stat</option>
                            {allowVariableActorTarget && <option value="actorIdentity">Actor Identity</option>}
                        </select>
                        {condition.type === 'calendar' ? (
                            <select style={selectStyle} value={condition.field} onChange={(event) => updateCondition(collectionIndex, conditionIndex, { ...condition, field: event.target.value as typeof condition.field, value: event.target.value === 'timeOfDay' ? 'morning' : event.target.value === 'dayOfWeek' ? 'monday' : 1 })}>
                                {CALENDAR_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
                            </select>
                        ) : condition.type === 'actorStat' ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                                <SearchableOptionPicker
                                    value={condition.actorId}
                                    onChange={(nextValue) => updateCondition(collectionIndex, conditionIndex, { ...condition, actorId: nextValue || (allowVariableActorTarget ? 'variable' : 'any') } as Condition)}
                                    options={actorTargetOptions.map((option) => ({ key: option.key, label: option.label, category: option.category, icon: option.icon, imageUrl: option.imageUrl }))}
                                    defaultOptionKeys={allowVariableActorTarget ? ['variable', 'any', 'none'] : ['any', 'none']}
                                    allowClear={false}
                                    emptyLabel="None"
                                    title="Choose actor target"
                                    placeholder="Search actors"
                                />
                            </div>
                        ) : null}
                        {(condition.type === 'globalStat' || condition.type === 'actorStat') && (
                            <select style={selectStyle} value={condition.statId} onChange={(event) => {
                                const stat = (condition.type === 'globalStat' ? globalStats : actorStats).find(candidate => candidate.id === event.target.value);
                                updateCondition(collectionIndex, conditionIndex, { ...condition, statId: event.target.value, value: getDefaultConditionValue(stat) } as Condition);
                            }}>
                                {(condition.type === 'globalStat' ? globalStats : actorStats).map(stat => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                            </select>
                        )}
                        {condition.type === 'calendar' && (
                            <select style={selectStyle} value={condition.comparison} onChange={(event) => updateCondition(collectionIndex, conditionIndex, { ...condition, comparison: event.target.value as ConditionComparison } as Condition)}>
                                {COMPARISONS.map(comparison => <option key={comparison.value} value={comparison.value}>{comparison.label}</option>)}
                            </select>
                        )}
                        {condition.type !== 'calendar' && (
                            <select style={selectStyle} value={condition.comparison} onChange={(event) => updateCondition(collectionIndex, conditionIndex, { ...condition, comparison: event.target.value as ConditionComparison } as Condition)}>
                                {(condition.type === 'actorIdentity' ? IDENTITY_COMPARISONS : COMPARISONS).map(comparison => <option key={comparison.value} value={comparison.value}>{comparison.label}</option>)}
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
        </div>
    );
};