import { FC, useState } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { Stat, StatUpdateRule, StatUpdateAction, formatStatOptionValueText, isNumericDisplayType, isOptionListStatType } from '../content/Stat';
import { GameFunction } from '../content/Function';
import { Condition } from '../content/Condition';
import { formatTimeSlot } from '../content/CalendarEvent';
import { Button } from './UiComponents';
import { ConditionEditor, createDefaultCondition } from './ConditionEditor';
import { OutcomeEditor, OutcomeEditorContext } from './OutcomeEditor';

export { SkitActionInput } from './OutcomeEditor';

interface StatUpdateRuleEditorProps extends OutcomeEditorContext {
    rules: StatUpdateRule[];
    onChange: (rules: StatUpdateRule[]) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

// Turns plain calendar conditions into "Every Morning/Wednesday/15th"; other conditions remain qualifiers.
const describeCalendarCondition = (condition: Condition): string | undefined => {
    if (condition.type !== 'calendar' || condition.comparison !== 'equals') {
        return undefined;
    }
    switch (condition.field) {
        case 'timeOfDay': return formatTimeSlot(`${condition.value}`);
        case 'dayOfWeek': return capitalize(`${condition.value}`);
        case 'day': return Number.isFinite(Number(condition.value)) ? toOrdinal(Number(condition.value)) : undefined;
        case 'month': return MONTH_NAMES[Number(condition.value) - 1];
        case 'year': return `${condition.value}`;
    }
};

const describeTrigger = (rule: StatUpdateRule): string => {
    const conditions = (rule.conditions || []).flatMap(collection => collection);
    if (rule.trigger === 'startup') {
        return conditions.length ? 'New game start-up (conditional)' : 'New game start-up';
    }
    const labels = conditions.map(describeCalendarCondition).filter((label): label is string => Boolean(label));
    const hasOtherConditions = labels.length < conditions.length;
    const base = labels.length > 0 ? `Every ${labels.join(', ')}` : 'Every time period';
    return hasOtherConditions ? `${base} (conditional)` : base;
};

const describeUpdate = (update: StatUpdateAction, stat: Stat | GameFunction | undefined): string => {
    if (update.kind === 'skit') return 'Start a skit';
    if (!stat) return update.kind === 'function' ? 'Unassigned function' : 'Unassigned stat';
    if (update.kind === 'function') return `Invoke ${stat.name}`;
    if (!('type' in stat)) return 'Unassigned stat';
    if (isOptionListStatType(stat.type)) {
        const verb = update.operation === 'set' ? 'set to' : (update.operation === 'remove' ? 'remove' : 'add');
        return `${stat.name} ${verb} ${formatStatOptionValueText(stat, update.value)}`;
    }
    const verb = update.operation === 'set' || !isNumericDisplayType(stat.type) ? 'set to' : 'adjust by';
    return `${stat.name} ${verb} ${update.value}`;
};

export const StatUpdateRuleEditor: FC<StatUpdateRuleEditorProps> = ({ rules, onChange, ...context }) => {
    const { globalStats, actorStats, locationStats = [], itemStats = [], actors, items = [], locations, stage } = context;
    const [collapsedRules, setCollapsedRules] = useState<Record<string, boolean>>({});
    const stageInstance = typeof stage === 'function' ? stage() : stage;
    const conditionActors = actors.filter(actor => actor.id !== stageInstance?.getSave().playerId);
    const statsByType = { global: globalStats, actor: actorStats, location: locationStats, item: itemStats };
    const resolveUpdateStat = (update: StatUpdateAction): Stat | GameFunction | undefined => (
        update.kind === 'skit' ? undefined : update.kind === 'function'
            ? stageInstance?.getConfiguration().functions?.find(fn => fn.id === update.functionId)
            : statsByType[update.targetType].find(stat => stat.id === update.statId)
    );
    const updateRule = (id: string, patch: Partial<StatUpdateRule>) => onChange(rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule));
    const moveRule = (index: number, offset: -1 | 1) => {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= rules.length) return;
        const nextRules = [...rules];
        [nextRules[index], nextRules[targetIndex]] = [nextRules[targetIndex], nextRules[index]];
        onChange(nextRules);
    };

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
                                    {rule.updates.length === 0 ? 'No stat updates' : rule.updates.map(update => describeUpdate(update, resolveUpdateStat(update))).join('; ')}
                                </span>
                            </div>
                            <Button variant="secondary" onClick={() => setCollapsedRules(prev => ({ ...prev, [rule.id]: !isCollapsed }))}>{isCollapsed ? 'Expand' : 'Collapse'}</Button>
                            <Button variant="secondary" disabled={index === 0} onClick={() => moveRule(index, -1)} aria-label="Move stat update event up" style={iconButtonStyle}><ArrowUpward fontSize="small" /></Button>
                            <Button variant="secondary" disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)} aria-label="Move stat update event down" style={iconButtonStyle}><ArrowDownward fontSize="small" /></Button>
                            <Button variant="danger" onClick={() => onChange(rules.filter(current => current.id !== rule.id))} aria-label="Delete stat update event" style={iconButtonStyle}><Delete fontSize="small" /></Button>
                        </div>
                        {!isCollapsed && <>
                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>
                                Trigger
                                <select aria-label="Rule trigger" value={rule.trigger || 'timePeriod'}
                                    style={{ marginLeft: 8, padding: 6, background: 'var(--agenda-surface-base)', color: 'var(--agenda-text-primary)', border: '1px solid var(--agenda-line-subtle)', borderRadius: 6 }}
                                    onChange={event => updateRule(rule.id, { trigger: event.target.value === 'startup' ? 'startup' : 'timePeriod' })}>
                                    <option value="timePeriod">Every time period</option>
                                    <option value="startup">New game start-up</option>
                                </select>
                            </label>
                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>When</label>
                            <ConditionEditor globalStats={globalStats} actorStats={actorStats} locationStats={locationStats} itemStats={itemStats}
                                actors={conditionActors} items={items} locations={locations} stage={stage}
                                conditionCollections={rule.conditions} onChange={conditions => updateRule(rule.id, { conditions })} />
                            {rule.conditions.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                {rule.trigger === 'startup' ? 'Applies once when a new game starts.' : 'Applies at the start of every time period.'}
                            </span>}
                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13, marginTop: 4 }}>Then</label>
                            <OutcomeEditor {...context} actions={rule.updates} onChange={updates => updateRule(rule.id, { updates })} skitTiming={rule.trigger === 'startup' ? 'immediate' : 'afterPeriod'} excludePlayerTargets />
                        </>}
                    </div>
                );
            })}
            {rules.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>No stat update events.</span>}
            <Button variant="secondary" onClick={() => {
                const rule: StatUpdateRule = {
                    id: generateUuid(),
                    trigger: 'timePeriod',
                    conditions: [[createDefaultCondition(globalStats)]],
                    updates: [],
                };
                setCollapsedRules(prev => ({ ...prev, [rule.id]: false }));
                onChange([...rules, rule]);
            }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}>
                <Add fontSize="small" /> Add stat update event
            </Button>
        </div>
    );
};
