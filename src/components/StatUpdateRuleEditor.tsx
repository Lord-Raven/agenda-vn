import { FC, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { ActorStat, ActorStatValue, StatUpdate, StatUpdateRule, isNumericDisplayType } from '../content/ActorStat';
import { Condition, ConditionCollection } from '../content/Condition';
import { Stage } from '../Stage';
import { Button } from './UiComponents';
import { ConditionEditor, buildActorTargetOptions } from './ConditionEditor';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { StatValueInput } from './StatValueInput';
import { LocationLike } from './LocationPortrait';

interface StatUpdateRuleEditorProps {
    rules: StatUpdateRule[];
    playerStats: ActorStat[];
    actorStats: ActorStat[];
    actors: Array<{ id: string; name: string }>;
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

const describeUpdate = (update: StatUpdate, stat: ActorStat | undefined): string => {
    if (!stat) {
        return 'Unassigned stat';
    }
    const verb = update.operation === 'set' || !isNumericDisplayType(stat.type) ? 'set to' : 'adjust by';
    return `${stat.name} ${verb} ${update.value}`;
};

export const StatUpdateRuleEditor: FC<StatUpdateRuleEditorProps> = ({ rules, playerStats, actorStats, actors, locations, stage, onChange }) => {
    const [collapsedRules, setCollapsedRules] = useState<Record<string, boolean>>({});
    // perActor stats have no single target here, so they cannot be written by a rule.
    const updatableActorStats = actorStats.filter(stat => !stat.perActor);
    const actorTargetOptions = buildActorTargetOptions(actors, false).filter(option => option.key !== 'none');

    const createUpdate = (): StatUpdate => ({
        id: generateUuid(),
        targetType: updatableActorStats.length > 0 ? 'actor' : 'player',
        actorId: 'any',
        statId: (updatableActorStats.length > 0 ? updatableActorStats[0] : playerStats[0])?.id || '',
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

    const statsForUpdate = (update: StatUpdate): ActorStat[] => update.targetType === 'player' ? playerStats : updatableActorStats;
    const resolveUpdateStat = (update: StatUpdate): ActorStat | undefined => statsForUpdate(update).find(stat => stat.id === update.statId);

    return (
        <div style={{ display: 'grid', gap: 10 }}>
            {rules.map((rule, index) => {
                const isCollapsed = collapsedRules[rule.id] !== false;
                return (
                    <div key={rule.id} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--agenda-line-subtle)', borderRadius: 6, background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 220px', minWidth: 0, color: 'var(--agenda-text-primary)', fontWeight: 600 }}>
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
                                    playerStats={playerStats}
                                    actorStats={actorStats}
                                    actors={actors}
                                    locations={locations}
                                    onChange={(conditions: ConditionCollection[]) => updateRule(rule.id, { conditions })}
                                />
                                {rule.conditions.length === 0 && (
                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Applies at the start of every time period.</span>
                                )}

                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13, marginTop: 4 }}>Then</label>
                                {rule.updates.map((update) => {
                                    const stat = resolveUpdateStat(update);
                                    const availableStats = statsForUpdate(update);
                                    return (
                                        <div key={update.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 110px) minmax(120px, 1.2fr) minmax(120px, 1.3fr) minmax(100px, 110px) minmax(100px, 1fr) auto', gap: 8, alignItems: 'center', minWidth: 0 }}>
                                            <select
                                                style={selectStyle}
                                                value={update.targetType}
                                                onChange={(event) => {
                                                    const targetType = event.target.value as StatUpdate['targetType'];
                                                    const nextStats = targetType === 'player' ? playerStats : updatableActorStats;
                                                    updateStatUpdate(rule.id, update.id, { targetType, statId: nextStats[0]?.id || '', value: 0 });
                                                }}
                                            >
                                                <option value="actor">Actor</option>
                                                <option value="player">Player</option>
                                            </select>
                                            {update.targetType === 'actor' ? (
                                                <SearchableOptionPicker
                                                    value={update.actorId}
                                                    onChange={(nextValue) => updateStatUpdate(rule.id, update.id, { actorId: (Array.isArray(nextValue) ? nextValue[0] : nextValue) || 'any' })}
                                                    options={actorTargetOptions}
                                                    defaultOptionKeys={['any']}
                                                    allowClear={false}
                                                    title="Choose actor target"
                                                    placeholder="Search actors"
                                                />
                                            ) : <div />}
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
                                                onChange={(value: ActorStatValue) => updateStatUpdate(rule.id, update.id, { value })}
                                                locations={locations}
                                                stage={stage}
                                                allowExpression
                                            />
                                            <Button
                                                variant="danger"
                                                onClick={() => updateRule(rule.id, { updates: rule.updates.filter(current => current.id !== update.id) })}
                                                aria-label="Delete stat update"
                                                style={iconButtonStyle}
                                            >
                                                <Delete fontSize="small" />
                                            </Button>
                                        </div>
                                    );
                                })}
                                <Button
                                    variant="secondary"
                                    disabled={playerStats.length === 0 && updatableActorStats.length === 0}
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
