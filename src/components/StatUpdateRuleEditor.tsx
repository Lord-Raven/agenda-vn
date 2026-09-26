import { FC, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { Stat, StatValue, StatUpdate, StatUpdateRule, isFunctionStatType, isNumericDisplayType } from '../content/Stat';
import { ContentType, CONTENT_TYPES, Condition, ConditionCollection } from '../content/Condition';
import { Stage } from '../Stage';
import { Button } from './UiComponents';
import { CONTENT_TYPE_LABELS, ConditionEditor, buildContentTargetOptions } from './ConditionEditor';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { StatValueInput } from './StatValueInput';
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

const describeUpdate = (update: StatUpdate, stat: Stat | undefined): string => {
    if (!stat) {
        return update.kind === 'function' ? 'Unassigned function' : 'Unassigned stat';
    }
    if (update.kind === 'function') {
        return `Invoke ${stat.name}`;
    }
    const verb = update.operation === 'set' || !isNumericDisplayType(stat.type) ? 'set to' : 'adjust by';
    return `${stat.name} ${verb} ${update.value}`;
};

export const StatUpdateRuleEditor: FC<StatUpdateRuleEditorProps> = ({ rules, globalStats: globalStats, actorStats, locationStats = [], itemStats = [], actors, items = [], locations, stage, onChange }) => {
    const [collapsedRules, setCollapsedRules] = useState<Record<string, boolean>>({});
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

    const updateStatUpdate = (ruleId: string, updateId: string, patch: Partial<StatUpdate>) => {
        onChange(rules.map(rule => rule.id === ruleId
            ? { ...rule, updates: rule.updates.map(update => update.id === updateId ? { ...update, ...patch } : update) }
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

    const statsForTargetType = (targetType: StatUpdate['targetType'], includePerActor: boolean = false): Stat[] => {
        switch (targetType) {
            case 'global': return globalStats;
            case 'location': return locationStats;
            case 'item': return itemStats;
            default: return includePerActor ? actorStats : updatableActorStats;
        }
    };
    const statsForUpdate = (update: StatUpdate): Stat[] => statsForTargetType(update.targetType);
    const functionStatsForTargetType = (targetType: StatUpdate['targetType']): Stat[] => (
        statsForTargetType(targetType, true).filter(stat => isFunctionStatType(stat.type))
    );
    const resolveUpdateStat = (update: StatUpdate): Stat | undefined => (
        update.kind === 'function'
            ? functionStatsForTargetType(update.targetType).find(stat => stat.id === update.statId)
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
                                    items={items}
                                    locations={locations}
                                    onChange={(conditions: ConditionCollection[]) => updateRule(rule.id, { conditions })}
                                />
                                {rule.conditions.length === 0 && (
                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Applies at the start of every time period.</span>
                                )}

                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13, marginTop: 4 }}>Then</label>
                                {rule.updates.map((update) => {
                                    const kind = update.kind === 'function' ? 'function' : 'stat';
                                    const stat = resolveUpdateStat(update);
                                    const availableStats = statsForUpdate(update);
                                    const availableFunctionStats = functionStatsForTargetType(update.targetType);
                                    return (
                                        <div key={update.id} style={{ display: 'grid', gap: 8, padding: 8, border: '1px dashed var(--agenda-line-subtle)', borderRadius: 6 }}>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <select
                                                    style={{ ...selectStyle, width: 'auto', minWidth: 150 }}
                                                    value={kind}
                                                    onChange={(event) => {
                                                        const nextKind = event.target.value as 'stat' | 'function';
                                                        if (nextKind === 'function') {
                                                            const functionStats = functionStatsForTargetType(update.targetType);
                                                            updateStatUpdate(rule.id, update.id, { kind: 'function', statId: functionStats[0]?.id || '' });
                                                        } else {
                                                            const nextStats = statsForUpdate(update);
                                                            updateStatUpdate(rule.id, update.id, { kind: 'stat', statId: nextStats[0]?.id || '', value: 0 });
                                                        }
                                                    }}
                                                >
                                                    <option value="stat">Update a stat</option>
                                                    <option value="function">Invoke a function</option>
                                                </select>
                                                <select
                                                    style={{ ...selectStyle, width: 'auto', minWidth: 100 }}
                                                    value={update.targetType}
                                                    onChange={(event) => {
                                                        const targetType = event.target.value as StatUpdate['targetType'];
                                                        if (kind === 'function') {
                                                            const functionStats = functionStatsForTargetType(targetType);
                                                            updateStatUpdate(rule.id, update.id, { targetType, targetId: 'any', statId: functionStats[0]?.id || '' });
                                                        } else {
                                                            const nextStats = statsForTargetType(targetType);
                                                            updateStatUpdate(rule.id, update.id, { targetType, targetId: 'any', statId: nextStats[0]?.id || '', value: 0 });
                                                        }
                                                    }}
                                                >
                                                    <option value="global">Global</option>
                                                    {CONTENT_TYPES.map(contentType => <option key={contentType} value={contentType}>{CONTENT_TYPE_LABELS[contentType]}</option>)}
                                                </select>
                                                {update.targetType !== 'global' ? (
                                                    <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                                                        <SearchableOptionPicker
                                                            value={update.targetId}
                                                            onChange={(nextValue) => updateStatUpdate(rule.id, update.id, { targetId: (Array.isArray(nextValue) ? nextValue[0] : nextValue) || 'any' })}
                                                            options={targetOptionsFor(update.targetType)}
                                                            defaultOptionKeys={['any']}
                                                            allowClear={false}
                                                            title={`Choose ${CONTENT_TYPE_LABELS[update.targetType].toLowerCase()} target`}
                                                            placeholder={`Search ${CONTENT_TYPE_LABELS[update.targetType].toLowerCase()}s`}
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

                                            {kind === 'stat' ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.3fr) minmax(100px, 110px) minmax(100px, 1fr)', gap: 8, alignItems: 'center', minWidth: 0 }}>
                                                    <select
                                                        style={selectStyle}
                                                        value={update.statId}
                                                        onChange={(event) => updateStatUpdate(rule.id, update.id, { statId: event.target.value, value: 0 })}
                                                    >
                                                        {availableStats.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                                                    </select>
                                                    {stat && isNumericDisplayType(stat.type) ? (
                                                        <select
                                                            style={selectStyle}
                                                            value={update.operation}
                                                            onChange={(event) => updateStatUpdate(rule.id, update.id, { operation: event.target.value as StatUpdate['operation'] })}
                                                        >
                                                            <option value="adjust">Adjust by</option>
                                                            <option value="set">Set to</option>
                                                        </select>
                                                    ) : <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Set to</span>}
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
                                                        value={update.statId}
                                                        onChange={(event) => updateStatUpdate(rule.id, update.id, { statId: event.target.value })}
                                                    >
                                                        {availableFunctionStats.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                                                    </select>
                                                    {availableFunctionStats.length === 0 && (
                                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>No function stats defined for this target.</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <Button
                                    variant="secondary"
                                    disabled={globalStats.length === 0 && updatableActorStats.length === 0 && locationStats.length === 0 && itemStats.length === 0}
                                    onClick={() => updateRule(rule.id, { updates: [...rule.updates, createUpdate()] })}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}
                                >
                                    <Add fontSize="small" /> Add stat update
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
