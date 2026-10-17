import { FC, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { Stat, StatValue, StatUpdate, StatUpdateRule, StatUpdateAction, SkitActionValue, cloneStat, cloneStatUpdateAction, formatStatOptionValueText, isNumericDisplayType, isOptionListStatType } from '../content/Stat';
import { GameFunction } from '../content/Function';
import { ContentType, CONTENT_TYPES, Condition, ConditionCollection } from '../content/Condition';
import { formatTimeSlot } from '../content/CalendarEvent';
import { Stage } from '../Stage';
import { Button } from './UiComponents';
import { CONTENT_TYPE_LABELS, ConditionEditor, buildContentTargetOptions } from './ConditionEditor';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { StatUpdateOperationSelect, StatValueInput } from './StatValueInput';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';

interface StatUpdateRuleEditorProps {
    rules: StatUpdateRule[];
    globalStats: Stat[];
    actorStats: Stat[];
    locationStats?: Stat[];
    itemStats?: Stat[];
    actors: Array<{ id: string; name: string }>;
    items?: ItemLike[];
    locations: LocationLike[];
    stage?: Stage | (() => Stage);
    onChange: (rules: StatUpdateRule[]) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const toOrdinal = (value: number): string => {
    const remainderOfTen = value % 10;
    const remainderOfHundred = value % 100;
    if (remainderOfTen === 1 && remainderOfHundred !== 11) return `${value}st`;
    if (remainderOfTen === 2 && remainderOfHundred !== 12) return `${value}nd`;
    if (remainderOfTen === 3 && remainderOfHundred !== 13) return `${value}th`;
    return `${value}th`;
};

// Turns the plain "field equals value" calendar conditions into the "Every Morning/Wednesday/15th" phrasing
// shown on a collapsed rule; anything more complex is summarized as an extra qualifier.
const describeCalendarCondition = (condition: Condition): string | undefined => {
    if (condition.type !== 'calendar' || condition.comparison !== 'equals') {
        return undefined;
    }
    switch (condition.field) {
        case 'timeOfDay':
            return formatTimeSlot(`${condition.value}`);
        case 'dayOfWeek':
            return capitalize(`${condition.value}`);
        case 'day':
            return Number.isFinite(Number(condition.value)) ? toOrdinal(Number(condition.value)) : undefined;
        case 'month':
            return MONTH_NAMES[Number(condition.value) - 1];
        case 'year':
            return `${condition.value}`;
    }
};

const describeTrigger = (rule: StatUpdateRule): string => {
    const conditions = (rule.conditions || []).flatMap(collection => collection);
    const labels = conditions.map(describeCalendarCondition).filter((label): label is string => Boolean(label));
    const hasOtherConditions = labels.length < conditions.length;
    const base = labels.length > 0 ? `Every ${labels.join(', ')}` : 'Every time period';
    return hasOtherConditions ? `${base} (conditional)` : base;
};

const describeUpdate = (update: StatUpdateAction, stat: Stat | GameFunction | undefined): string => {
    if (update.kind === 'skit') {
        return 'Start a skit';
    }
    if (!stat) {
        return update.kind === 'function' ? 'Unassigned function' : 'Unassigned stat';
    }
    if (update.kind === 'function') {
        return `Invoke ${stat.name}`;
    }
    if (!('type' in stat)) {
        return 'Unassigned stat';
    }
    if (isOptionListStatType(stat.type)) {
        const verb = update.operation === 'set' ? 'set to' : (update.operation === 'remove' ? 'remove' : 'add');
        return `${stat.name} ${verb} ${formatStatOptionValueText(stat, update.value)}`;
    }
    const verb = update.operation === 'set' || !isNumericDisplayType(stat.type) ? 'set to' : 'adjust by';
    return `${stat.name} ${verb} ${update.value}`;
};

type SkitActionInputProps = Pick<StatUpdateRuleEditorProps, 'globalStats' | 'actorStats' | 'locationStats' | 'itemStats' | 'actors' | 'items' | 'locations' | 'stage'> & {
    label: string;
    type: 'location' | 'actorList' | 'text';
    value: SkitActionValue;
    onChange: (value: SkitActionValue) => void;
};

export const SkitActionInput: FC<SkitActionInputProps> = ({ label, type, value, onChange, globalStats, actorStats, locationStats = [], itemStats = [], actors, items = [], locations, stage }) => {
    const reference = typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    const statsByType = { global: globalStats, actor: actorStats, location: locationStats, item: itemStats };
    const entitiesByType = { global: [], actor: actors, location: locations, item: items };
    const matchingStats = (targetType: StatUpdate['targetType']) => statsByType[targetType].filter(stat => stat.type === type && !stat.perActor);
    const literalDefault = type === 'actorList' ? [] : '';
    const inputStat = cloneStat({
        id: type, name: label, type, default: literalDefault, guidance: '',
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    });
    const literalValue = typeof value === 'object' && !Array.isArray(value) ? literalDefault : value;
    return (
        <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>{label}</label>
            <select style={selectStyle} aria-label={`${label} source`} value={reference?.targetType || 'value'}
                onChange={event => {
                    if (event.target.value === 'value') {
                        onChange(literalDefault);
                    } else {
                        const targetType = event.target.value as StatUpdate['targetType'];
                        onChange({ targetType, targetId: entitiesByType[targetType][0]?.id || '', statId: matchingStats(targetType)[0]?.id || '' });
                    }
                }}>
                <option value="value">Value or function</option>
                <option value="global">Global stat</option>
                {CONTENT_TYPES.map(contentType => <option key={contentType} value={contentType}>{CONTENT_TYPE_LABELS[contentType]} stat</option>)}
            </select>
            {reference ? <>
                {reference.targetType !== 'global' && (
                    <SearchableOptionPicker value={reference.targetId} options={entitiesByType[reference.targetType].map(entity => ({ key: entity.id, label: entity.name }))}
                        title={`Choose ${label.toLowerCase()} stat owner`} allowClear={false}
                        onChange={next => onChange({ ...reference, targetId: (Array.isArray(next) ? next[0] : next) || '' })} />
                )}
                <select style={selectStyle} aria-label={`${label} stat`} value={reference.statId}
                    onChange={event => onChange({ ...reference, statId: event.target.value })}>
                    <option value="">Select a {type === 'text' ? 'text' : type === 'actorList' ? 'participant list' : 'location'} stat...</option>
                    {reference.statId && !matchingStats(reference.targetType).some(stat => stat.id === reference.statId)
                        && <option value={reference.statId}>Missing or incompatible stat</option>}
                    {matchingStats(reference.targetType).map(stat => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                </select>
            </> : (
                <StatValueInput stat={inputStat} value={literalValue} onChange={onChange} actors={actors} items={items} locations={locations} stage={stage} />
            )}
        </div>
    );
};

export const StatUpdateRuleEditor: FC<StatUpdateRuleEditorProps> = ({ rules, globalStats: globalStats, actorStats, locationStats = [], itemStats = [], actors, items = [], locations, stage, onChange }) => {
    const [collapsedRules, setCollapsedRules] = useState<Record<string, boolean>>({});
    const playerId = (typeof stage === 'function' ? stage() : stage)?.getSave().playerId;
    const functions = (typeof stage === 'function' ? stage() : stage)?.getConfiguration().functions || [];
    const participantActors = actors;
    actors = actors.filter(actor => actor.id !== playerId);
    // perActor stats have no single target here, so they cannot be written by a rule.
    const updatableActorStats = actorStats.filter(stat => !stat.perActor);
    const entitiesByContentType: Record<ContentType, Array<{ id: string; name: string }>> = { actor: actors, location: locations, item: items };
    const targetOptionsFor = (contentType: ContentType) => buildContentTargetOptions(contentType, entitiesByContentType[contentType], { allowNone: false });

    const createUpdate = (): StatUpdate => ({
        id: generateUuid(),
        targetType: updatableActorStats.length > 0 ? 'actor' : 'global',
        targetId: 'any',
        statId: (updatableActorStats.length > 0 ? updatableActorStats[0] : globalStats[0])?.id || '',
        operation: 'adjust',
        value: 0,
    });

    const updateRule = (ruleId: string, patch: Partial<StatUpdateRule>) => {
        onChange(rules.map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule));
    };

    const updateStatUpdate = (ruleId: string, updateId: string, patch: Partial<StatUpdateAction>) => {
        onChange(rules.map(rule => rule.id === ruleId
            ? { ...rule, updates: rule.updates.map(update => update.id === updateId ? cloneStatUpdateAction({ ...update, ...patch }) : update) }
            : rule));
    };

    const moveRule = (index: number, offset: -1 | 1) => {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= rules.length) {
            return;
        }
        const nextRules = [...rules];
        [nextRules[index], nextRules[targetIndex]] = [nextRules[targetIndex], nextRules[index]];
        onChange(nextRules);
    };

    const statsForTargetType = (targetType: StatUpdate['targetType']): Stat[] => {
        switch (targetType) {
            case 'global': return globalStats;
            case 'location': return locationStats;
            case 'item': return itemStats;
            default: return updatableActorStats;
        }
    };
    const statsForUpdate = (update: StatUpdate): Stat[] => statsForTargetType(update.targetType);
    const resolveUpdateStat = (update: StatUpdateAction): Stat | GameFunction | undefined => (
        update.kind === 'skit' ? undefined :
        update.kind === 'function'
            ? functions.find(fn => fn.id === update.functionId)
            : statsForUpdate(update).find(stat => stat.id === update.statId)
    );

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            {rules.map((rule, index) => {
                const isCollapsed = collapsedRules[rule.id] !== false;
                return (
                    <div key={rule.id} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--agenda-line-subtle)', borderRadius: 6, background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 220px', minWidth: 0, color: 'var(--agenda-text-primary)', fontWeight: 700 }}>
                                {describeTrigger(rule)}
                                <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: 12, fontWeight: 400 }}>
                                    {rule.updates.length === 0
                                        ? 'No stat updates'
                                        : rule.updates.map(update => describeUpdate(update, resolveUpdateStat(update))).join('; ')}
                                </span>
                            </div>
                            <Button variant="secondary" onClick={() => setCollapsedRules(prev => ({ ...prev, [rule.id]: !isCollapsed }))}>
                                {isCollapsed ? 'Expand' : 'Collapse'}
                            </Button>
                            <Button variant="secondary" disabled={index === 0} onClick={() => moveRule(index, -1)} aria-label="Move stat update event up" style={iconButtonStyle}><ArrowUpward fontSize="small" /></Button>
                            <Button variant="secondary" disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)} aria-label="Move stat update event down" style={iconButtonStyle}><ArrowDownward fontSize="small" /></Button>
                            <Button variant="danger" onClick={() => onChange(rules.filter(current => current.id !== rule.id))} aria-label="Delete stat update event" style={iconButtonStyle}><Delete fontSize="small" /></Button>
                        </div>

                        {!isCollapsed && (
                            <>
                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>When</label>
                                <ConditionEditor
                                    conditionCollections={rule.conditions}
                                    globalStats={globalStats}
                                    actorStats={actorStats}
                                    locationStats={locationStats}
                                    itemStats={itemStats}
                                    actors={actors}
                                    stage={stage}
                                    items={items}
                                    locations={locations}
                                    onChange={(conditions: ConditionCollection[]) => updateRule(rule.id, { conditions })}
                                />
                                {rule.conditions.length === 0 && (
                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Applies at the start of every time period.</span>
                                )}

                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13, marginTop: 4 }}>Then</label>
                                {rule.updates.map((update) => {
                                    const kind = update.kind || 'stat';
                                    const isStat = update.kind !== 'function' && update.kind !== 'skit';
                                    const stat = isStat ? statsForUpdate(update).find(stat => stat.id === update.statId) : undefined;
                                    const availableStats = isStat ? statsForUpdate(update) : [];
                                    return (
                                        <div key={update.id} style={{ display: 'grid', gap: 8, padding: 8, border: '1px dashed var(--agenda-line-subtle)', borderRadius: 6 }}>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <select
                                                    style={{ ...selectStyle, width: 'auto', minWidth: 150 }}
                                                    value={kind}
                                                    onChange={(event) => {
                                                        const nextKind = event.target.value;
                                                        if (nextKind === 'function') {
                                                            updateStatUpdate(rule.id, update.id, { kind: 'function', functionId: functions[0]?.id || '' });
                                                        } else if (nextKind === 'skit') {
                                                            updateStatUpdate(rule.id, update.id, { kind: 'skit', locationId: locations[0]?.id || '', actorIds: [] });
                                                        } else {
                                                            updateStatUpdate(rule.id, update.id, { ...createUpdate(), id: update.id, kind: 'stat' });
                                                        }
                                                    }}
                                                >
                                                    <option value="stat">Update a stat</option>
                                                    <option value="function">Invoke a function</option>
                                                    <option value="skit">Start a skit</option>
                                                </select>
                                                {isStat && <select
                                                    style={{ ...selectStyle, width: 'auto', minWidth: 100 }}
                                                    value={update.targetType}
                                                    onChange={(event) => {
                                                        const targetType = event.target.value as StatUpdate['targetType'];
                                                        const nextStats = statsForTargetType(targetType);
                                                        updateStatUpdate(rule.id, update.id, { targetType, targetId: 'any', statId: nextStats[0]?.id || '', value: 0 });
                                                    }}
                                                >
                                                    <option value="global">Global</option>
                                                    {CONTENT_TYPES.map(contentType => <option key={contentType} value={contentType}>{CONTENT_TYPE_LABELS[contentType]}</option>)}
                                                </select>}
                                                {isStat && update.targetType !== 'global' ? (
                                                    <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                                                        <SearchableOptionPicker
                                                            value={update.targetId}
                                                            onChange={(nextValue) => updateStatUpdate(rule.id, update.id, { targetId: (Array.isArray(nextValue) ? nextValue[0] : nextValue) || 'any' })}
                                                            options={targetOptionsFor(update.targetType)}
                                                            defaultOptionKeys={['any']}
                                                            allowClear={false}
                                                            title={`Choose ${CONTENT_TYPE_LABELS[update.targetType].toLowerCase()} target`}
                                                            placeholder={`Search ${CONTENT_TYPE_LABELS[update.targetType].toLowerCase()}s`}
                                                            functionType={update.targetType}
                                                            stage={stage}
                                                        />
                                                    </div>
                                                ) : null}
                                                <div style={{ flex: '1 1 auto' }} />
                                                <Button
                                                    variant="danger"
                                                    onClick={() => updateRule(rule.id, { updates: rule.updates.filter(current => current.id !== update.id) })}
                                                    aria-label="Delete stat update"
                                                    style={iconButtonStyle}
                                                >
                                                    <Delete fontSize="small" />
                                                </Button>
                                            </div>

                                            {update.kind === 'skit' ? (
                                                <>
                                                    {([
                                                        ['locationId', 'Location', 'location'],
                                                        ['actorIds', 'Participants', 'actorList'],
                                                        ['guidance', 'Guidance (optional)', 'text'],
                                                    ] as const).map(([field, label, type]) => (
                                                        <SkitActionInput key={field} label={label} type={type} value={update[field] ?? ''}
                                                            onChange={value => updateStatUpdate(rule.id, update.id, { [field]: value })}
                                                            globalStats={globalStats} actorStats={actorStats} locationStats={locationStats} itemStats={itemStats}
                                                            actors={participantActors} items={items} locations={locations} stage={stage} />
                                                    ))}
                                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                                        Starts after all post-skit actions finish, ahead of mandatory events. Only the first triggered skit runs.
                                                        Leave guidance empty to generate it automatically. Participants are used regardless of their schedules.
                                                    </span>
                                                </>
                                            ) : update.kind !== 'function' ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.3fr) minmax(100px, 110px) minmax(100px, 1fr)', gap: 8, alignItems: 'center', minWidth: 0 }}>
                                                    <select
                                                        style={selectStyle}
                                                        value={update.statId}
                                                        onChange={(event) => updateStatUpdate(rule.id, update.id, { statId: event.target.value, value: 0 })}
                                                    >
                                                        {availableStats.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                                                    </select>
                                                    <StatUpdateOperationSelect
                                                        stat={stat}
                                                        style={selectStyle}
                                                        operation={update.operation}
                                                        onChange={(operation) => updateStatUpdate(rule.id, update.id, { operation })}
                                                    />
                                                    <StatValueInput
                                                        stat={stat}
                                                        value={update.value}
                                                        onChange={(value: StatValue) => updateStatUpdate(rule.id, update.id, { value })}
                                                        actors={actors}
                                                        items={items}
                                                        locations={locations}
                                                        stage={stage}
                                                        allowExpression
                                                    />
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: 6 }}>
                                                    <select
                                                        style={selectStyle}
                                                        value={update.functionId}
                                                        onChange={(event) => updateStatUpdate(rule.id, update.id, { functionId: event.target.value })}
                                                    >
                                                        <option value="">Select a function...</option>
                                                        {functions.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                                                    </select>
                                                    {functions.length === 0 && (
                                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>No functions defined. Add one in Functions.</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <Button
                                    variant="secondary"
                                    onClick={() => updateRule(rule.id, { updates: [...rule.updates, createUpdate()] })}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}
                                >
                                    <Add fontSize="small" /> Add action
                                </Button>
                            </>
                        )}
                    </div>
                );
            })}
            {rules.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>No stat update events.</span>}
            <Button
                variant="secondary"
                onClick={() => {
                    const rule: StatUpdateRule = {
                        id: generateUuid(),
                        conditions: [[{ type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' }]],
                        updates: [],
                    };
                    setCollapsedRules(prev => ({ ...prev, [rule.id]: false }));
                    onChange([...rules, rule]);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}
            >
                <Add fontSize="small" /> Add stat update event
            </Button>
        </div>
    );
};
