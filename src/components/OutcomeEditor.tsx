import { FC } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, Delete } from '@mui/icons-material';
import { Stage } from '../Stage';
import { CONTENT_TYPES } from '../content/Condition';
import { isValueReference } from '../content/Function';
import { cloneStatUpdateAction, resolveStatDefault, SkitActionValue, Stat, StatUpdate, StatUpdateAction } from '../content/Stat';
import { Button, LocationSelect, ReferenceMultiSelect, TextInput } from './UiComponents';
import { buildContentTargetOptions, CONTENT_TYPE_LABELS } from './ConditionEditor';
import { ItemLike } from './ItemPortrait';
import { LocationLike } from './LocationPortrait';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { StatUpdateOperationSelect, StatValueInput } from './StatValueInput';

export interface OutcomeEditorContext {
    globalStats: Stat[];
    actorStats: Stat[];
    locationStats?: Stat[];
    itemStats?: Stat[];
    actors: Array<{ id: string; name: string }>;
    items?: ItemLike[];
    locations: LocationLike[];
    stage?: Stage | (() => Stage);
}

interface OutcomeEditorProps extends OutcomeEditorContext {
    actions: StatUpdateAction[];
    onChange: (actions: StatUpdateAction[]) => void;
    skitTiming?: 'afterPeriod' | 'immediate';
    excludePlayerTargets?: boolean;
}

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

type SkitActionInputProps = OutcomeEditorContext & {
    label: string;
    type: 'location' | 'actorList' | 'text';
    value: SkitActionValue;
    onChange: (value: SkitActionValue) => void;
};

export const SkitActionInput: FC<SkitActionInputProps> = ({ label, type, value, onChange, globalStats, actorStats, locationStats = [], itemStats = [], actors, items = [], locations, stage }) => {
    const reference = typeof value === 'object' && !Array.isArray(value) ? value : undefined;
    const statsByType = { global: globalStats, actor: actorStats, location: locationStats, item: itemStats };
    const entitiesByType = { global: [], actor: actors, location: locations, item: items };
    const literalDefault = type === 'actorList' ? [] : '';
    const referencedStat = reference && statsByType[reference.targetType].find(stat => stat.id === reference.statId);
    const ownerName = reference && (reference.targetType === 'global' ? 'Global' : entitiesByType[reference.targetType].find(entity => entity.id === reference.targetId)?.name || reference.targetId);
    return (
        <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ color: 'var(--agenda-text-muted)', fontSize: 13 }}>{label}</label>
            {reference ? <>
                <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                    Existing stat binding: {ownerName} / {referencedStat?.name || reference.statId}
                    {(!referencedStat || referencedStat.type !== type) && ' (missing or incompatible stat)'}
                </span>
                <Button onClick={() => onChange(literalDefault)} aria-label={`Replace ${label} stat binding`}>Replace</Button>
            </> : type === 'location' ? (
                <LocationSelect value={typeof value === 'string' ? value : ''} onChange={onChange} locations={locations} stage={stage} />
            ) : type === 'actorList' ? (
                <ReferenceMultiSelect kind="actor" values={Array.isArray(value) ? value : isValueReference(value) ? [value] : []}
                    onChange={onChange} actors={actors} stage={stage} />
            ) : (
                <TextInput fullWidth aria-label={label} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />
            )}
        </div>
    );
};

export const OutcomeEditor: FC<OutcomeEditorProps> = ({ actions, onChange, skitTiming = 'immediate', excludePlayerTargets = false, ...context }) => {
    const { globalStats, actorStats, locationStats = [], itemStats = [], actors, items = [], locations, stage } = context;
    const stageInstance = typeof stage === 'function' ? stage() : stage;
    const functions = stageInstance?.getConfiguration().functions || [];
    const targetActors = excludePlayerTargets ? actors.filter(actor => actor.id !== stageInstance?.getSave().playerId) : actors;
    const statsByType = { global: globalStats, actor: actorStats, location: locationStats, item: itemStats };
    const entitiesByType = { actor: targetActors, location: locations, item: items };
    const createUpdate = (): StatUpdate => ({
        id: generateUuid(), kind: 'stat',
        targetType: statsByType.actor.length ? 'actor' : 'global', targetId: 'any',
        statId: (statsByType.actor[0] || globalStats[0])?.id || '', operation: 'adjust', value: 0,
    });
    const updateAction = (id: string, patch: Partial<StatUpdateAction>) =>
        onChange(actions.map(action => action.id === id ? cloneStatUpdateAction({ ...action, ...patch }) : action));

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            {actions.map(action => {
                const isStat = action.kind !== 'function' && action.kind !== 'skit';
                const availableStats = isStat ? statsByType[action.targetType] : [];
                const stat = isStat ? availableStats.find(stat => stat.id === action.statId) : undefined;
                return (
                    <div key={action.id} style={{ display: 'grid', gap: 8, padding: 8, border: '1px dashed var(--agenda-line-subtle)', borderRadius: 6 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <select aria-label="Action type" style={{ ...selectStyle, width: 'auto', minWidth: 150 }} value={action.kind || 'stat'}
                                onChange={event => {
                                    if (event.target.value === 'function') {
                                        updateAction(action.id, { kind: 'function', functionId: functions[0]?.id || '' });
                                    } else if (event.target.value === 'skit') {
                                        updateAction(action.id, { kind: 'skit', locationId: locations[0]?.id || '', actorIds: [] });
                                    } else {
                                        updateAction(action.id, { ...createUpdate(), id: action.id });
                                    }
                                }}>
                                <option value="stat">Update a stat</option>
                                <option value="function">Invoke a function</option>
                                <option value="skit">Start a skit</option>
                            </select>
                            {isStat && <select aria-label="Stat target type" style={{ ...selectStyle, width: 'auto', minWidth: 100 }} value={action.targetType}
                                onChange={event => {
                                    const targetType = event.target.value as StatUpdate['targetType'];
                                    updateAction(action.id, { targetType, targetId: 'any', statId: statsByType[targetType][0]?.id || '', value: 0 });
                                }}>
                                <option value="global">Global</option>
                                {CONTENT_TYPES.map(contentType => <option key={contentType} value={contentType}>{CONTENT_TYPE_LABELS[contentType]}</option>)}
                            </select>}
                            {isStat && action.targetType !== 'global' && (
                                <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                                    <SearchableOptionPicker value={action.targetId}
                                        onChange={value => updateAction(action.id, { targetId: (Array.isArray(value) ? value[0] : value) || 'any' })}
                                        options={buildContentTargetOptions(action.targetType, entitiesByType[action.targetType], { allowNone: false })}
                                        defaultOptionKeys={['any']} allowClear={false}
                                        title={`Choose ${CONTENT_TYPE_LABELS[action.targetType].toLowerCase()} target`}
                                        placeholder={`Search ${CONTENT_TYPE_LABELS[action.targetType].toLowerCase()}s`}
                                        functionType={action.targetType} stage={stage} />
                                </div>
                            )}
                            <div style={{ flex: '1 1 auto' }} />
                            <Button variant="danger" onClick={() => onChange(actions.filter(candidate => candidate.id !== action.id))}
                                aria-label="Delete action" style={{ display: 'grid', placeItems: 'center', minWidth: 30, minHeight: 30, padding: 0 }}>
                                <Delete fontSize="small" />
                            </Button>
                        </div>
                        {action.kind === 'skit' ? <>
                            {([
                                ['locationId', 'Location', 'location'],
                                ['actorIds', 'Participants', 'actorList'],
                                ['guidance', 'Guidance (optional)', 'text'],
                            ] as const).map(([field, label, type]) => (
                                <SkitActionInput key={field} {...context} label={label} type={type} value={action[field] ?? ''}
                                    onChange={value => updateAction(action.id, { [field]: value })} />
                            ))}
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                {skitTiming === 'afterPeriod'
                                    ? 'Starts after all post-skit actions finish, ahead of mandatory events. Only the first triggered skit runs.'
                                    : 'Starts after all stat and function actions finish. Only the first requested skit runs.'}
                                {' '}Leave guidance empty to generate it automatically, or enter a text-returning function name to use its result.
                                {' '}Function names are matched ignoring case and surrounding spaces. Participants are used regardless of their schedules.
                            </span>
                        </> : action.kind === 'function' ? (
                            <div style={{ display: 'grid', gap: 6 }}>
                                <select aria-label="Function" style={selectStyle} value={action.functionId} onChange={event => updateAction(action.id, { functionId: event.target.value, args: undefined })}>
                                    <option value="">Select a function...</option>
                                    {functions.map(fn => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
                                </select>
                                {(functions.find(fn => fn.id === action.functionId)?.parameters || []).map(parameter => (
                                    <label key={parameter.id} style={{ display: 'grid', gap: 4, color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                        {parameter.name || '(Unnamed parameter)'}
                                        <StatValueInput stat={parameter} value={action.args?.[parameter.id] ?? resolveStatDefault(parameter)}
                                            onChange={value => updateAction(action.id, { args: { ...action.args, [parameter.id]: value } })}
                                            actors={targetActors} items={items} locations={locations} stage={stage} />
                                    </label>
                                ))}
                                {functions.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>No functions defined. Add one in Functions.</span>}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'center' }}>
                                <select aria-label="Stat" style={selectStyle} value={action.statId} onChange={event => updateAction(action.id, { statId: event.target.value, value: 0 })}>
                                    <option value="">Select a stat...</option>
                                    {availableStats.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                                </select>
                                <StatUpdateOperationSelect stat={stat} style={selectStyle} operation={action.operation} onChange={operation => updateAction(action.id, { operation })} />
                                <StatValueInput stat={stat} value={action.value} onChange={value => updateAction(action.id, { value })}
                                    actors={targetActors} items={items} locations={locations} stage={stage} allowExpression />
                            </div>
                        )}
                    </div>
                );
            })}
            <Button variant="secondary" onClick={() => onChange([...actions, createUpdate()])} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}>
                <Add fontSize="small" /> Add action
            </Button>
        </div>
    );
};
