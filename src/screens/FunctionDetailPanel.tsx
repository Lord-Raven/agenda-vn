import { FC } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { IconButton } from '@mui/material';
import { GameFunction, FUNCTION_RETURN_TYPES, FunctionReturnType } from '../content/Function';
import { cloneStat, isSourcedOptionStat, Stat, StatType } from '../content/Stat';
import { Button, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { FunctionEditor } from '../components/FunctionEditor';
import { StatValueInput } from '../components/StatValueInput';
import { normalizeStatShape, resolveStatDefaultValue } from '../components/StatEntryEditor';
import { Stage } from '../Stage';

export const FUNCTION_RETURN_TYPE_LABELS: Record<FunctionReturnType, string> = {
    void: 'Void (action only)',
    number: 'Number',
    text: 'String',
    checkbox: 'Checkbox',
    option: 'Option',
    optionList: 'Option List',
    actor: 'Actor',
    actorList: 'Actor List',
    item: 'Item',
    itemList: 'Item List',
    location: 'Location',
    locationList: 'Location List',
    contentList: 'Content List (mixed)',
};

interface FunctionDetailPanelProps {
    fn: GameFunction;
    functions: GameFunction[];
    stage: Stage;
    onChange: (fields: Partial<GameFunction>) => void;
    onMove: (offset: -1 | 1) => void;
    onDelete: () => void;
}

export const FunctionDetailPanel: FC<FunctionDetailPanelProps> = ({ fn, functions, stage, onChange, onMove, onDelete }) => {
    const index = functions.findIndex(candidate => candidate.id === fn.id);
    const parameters = fn.parameters || [];
    const parameterTypes = FUNCTION_RETURN_TYPES.filter((type): type is StatType => type !== 'void');
    const save = stage.getSave();
    const optionListSources = stage.getConfiguration().globalStats.filter(stat => stat.type === 'optionList');
    const parameterActors = Object.values(save.actors || {}).filter(actor => actor.active !== false);
    const parameterItems = (save.inventory || []).filter(item => item.active !== false);
    const parameterLocations = Object.values(save.atlas || {}).filter(location => location.active !== false);
    const createParameter = (): Stat => cloneStat({
        id: generateUuid(), name: '', type: 'number', guidance: '', default: 0,
        llmSees: { value: false, conditions: [] }, llmMaintained: { value: false, conditions: [] },
    } as Stat);
    const patchParameter = (id: string, patch: Partial<Stat>) => onChange({
        parameters: parameters.map(parameter => {
            if (parameter.id !== id) {
                return parameter;
            }
            if (patch.type && patch.type !== parameter.type) {
                const next = normalizeStatShape({ ...parameter, ...patch });
                return { ...next, default: resolveStatDefaultValue(next) };
            }
            return { ...parameter, ...patch };
        }),
    });
    const moveParameter = (id: string, offset: -1 | 1) => {
        const from = parameters.findIndex(parameter => parameter.id === id);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= parameters.length) return;
        const next = [...parameters];
        [next[from], next[to]] = [next[to], next[from]];
        onChange({ parameters: next });
    };
    return (
        <GlassPanel style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '20px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                <Title variant="glow" style={{ flex: 1, fontSize: '24px', margin: 0 }}>Function: {fn.name || '(Unnamed Function)'}</Title>
                <IconButton size="small" aria-label="Move function up" disabled={index <= 0} onClick={() => onMove(-1)} sx={{ color: 'var(--agenda-text-primary)' }}><ArrowUpward fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Move function down" disabled={index < 0 || index === functions.length - 1} onClick={() => onMove(1)} sx={{ color: 'var(--agenda-text-primary)' }}><ArrowDownward fontSize="small" /></IconButton>
                <IconButton size="small" aria-label="Delete function" onClick={onDelete} sx={{ color: 'var(--agenda-text-primary)' }}><Delete fontSize="small" /></IconButton>
            </div>
            <div style={{ display: 'grid', gap: 15 }}>
                <label style={{ color: 'var(--agenda-text-muted)' }}>
                    Name
                    <TextInput fullWidth value={fn.name} onChange={event => onChange({ name: event.target.value })} />
                </label>
                <label style={{ color: 'var(--agenda-text-muted)' }}>
                    Return Type
                    <select className="input-base" value={fn.returnType} onChange={event => onChange({ returnType: event.target.value as FunctionReturnType })}>
                        {FUNCTION_RETURN_TYPES.map(type => <option key={type} value={type}>{FUNCTION_RETURN_TYPE_LABELS[type]}</option>)}
                    </select>
                </label>
                <label style={{ color: 'var(--agenda-text-muted)' }}>
                    Description
                    <TextArea value={fn.description} onChange={event => onChange({ description: event.target.value })} rows={3} style={{ width: '100%' }} />
                </label>
                <div style={{ display: 'grid', gap: 10 }}>
                    <span style={{ color: 'var(--agenda-text-muted)' }}>Parameters</span>
                    {parameters.map((parameter, parameterIndex) => (
                        <div key={parameter.id} style={{ display: 'grid', gap: 8, padding: 10, border: '1px dashed var(--agenda-line-subtle)', borderRadius: 6 }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <TextInput aria-label="Parameter name" placeholder="Parameter name" value={parameter.name}
                                    onChange={event => patchParameter(parameter.id, { name: event.target.value })} style={{ flex: '1 1 160px' }} />
                                <select className="input-base" aria-label="Parameter type" style={{ width: 'auto', minWidth: 140 }} value={parameter.type}
                                    onChange={event => patchParameter(parameter.id, { type: event.target.value as StatType })}>
                                    {parameterTypes.map(type => <option key={type} value={type}>{FUNCTION_RETURN_TYPE_LABELS[type]}</option>)}
                                </select>
                                <IconButton size="small" aria-label="Move parameter up" disabled={parameterIndex === 0} onClick={() => moveParameter(parameter.id, -1)} sx={{ color: 'var(--agenda-text-primary)' }}><ArrowUpward fontSize="small" /></IconButton>
                                <IconButton size="small" aria-label="Move parameter down" disabled={parameterIndex === parameters.length - 1} onClick={() => moveParameter(parameter.id, 1)} sx={{ color: 'var(--agenda-text-primary)' }}><ArrowDownward fontSize="small" /></IconButton>
                                <IconButton size="small" aria-label="Delete parameter" onClick={() => onChange({ parameters: parameters.filter(candidate => candidate.id !== parameter.id) })} sx={{ color: 'var(--agenda-text-primary)' }}><Delete fontSize="small" /></IconButton>
                            </div>
                            <label style={{ display: 'grid', gap: 4, color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                Guidance (shown when entering arguments)
                                <TextInput value={parameter.guidance} onChange={event => patchParameter(parameter.id, { guidance: event.target.value })} />
                            </label>
                            {(parameter.type === 'option' || parameter.type === 'optionList') && (
                                <label style={{ display: 'grid', gap: 4, color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                    Option Source
                                    <select className="input-base" aria-label="Parameter option source" value={parameter.optionSourceStatId || ''}
                                        onChange={event => patchParameter(parameter.id, {
                                            optionSourceStatId: event.target.value || undefined,
                                            default: parameter.type === 'optionList' ? [] : '',
                                        })}>
                                        <option value="">Own options</option>
                                        {optionListSources.map(source => (
                                            <option key={source.id} value={source.id}>{source.name?.trim() || 'Unnamed option list'} (global)</option>
                                        ))}
                                        {isSourcedOptionStat(parameter) && !optionListSources.some(source => source.id === parameter.optionSourceStatId) && (
                                            <option value={parameter.optionSourceStatId}>Missing option list</option>
                                        )}
                                    </select>
                                </label>
                            )}
                            {(parameter.type === 'option' || parameter.type === 'optionList') && !isSourcedOptionStat(parameter) && (
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Options</span>
                                    {(parameter.options || []).map((option, optionIndex) => (
                                        <div key={option.id || optionIndex} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <TextInput aria-label="Option name" placeholder="Name" value={option.name} style={{ flex: '1 1 120px' }}
                                                onChange={event => patchParameter(parameter.id, { options: (parameter.options || []).map(candidate => candidate === option ? { ...candidate, name: event.target.value } : candidate) })} />
                                            <TextInput aria-label="Option description" placeholder="Description" value={option.description} style={{ flex: '2 1 160px' }}
                                                onChange={event => patchParameter(parameter.id, { options: (parameter.options || []).map(candidate => candidate === option ? { ...candidate, description: event.target.value } : candidate) })} />
                                            <IconButton size="small" aria-label="Delete option" onClick={() => patchParameter(parameter.id, { options: (parameter.options || []).filter(candidate => candidate !== option) })} sx={{ color: 'var(--agenda-text-primary)' }}><Delete fontSize="small" /></IconButton>
                                        </div>
                                    ))}
                                    <Button variant="secondary" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                        onClick={() => patchParameter(parameter.id, { options: [...(parameter.options || []), { id: generateUuid(), name: '', description: '' }] })}>
                                        <Add fontSize="small" /> Add option
                                    </Button>
                                </div>
                            )}
                            <label style={{ display: 'grid', gap: 4, color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                Default value (used when a caller omits this argument)
                                <StatValueInput stat={parameter} value={parameter.default} onChange={value => patchParameter(parameter.id, { default: value })}
                                    actors={parameterActors} items={parameterItems} locations={parameterLocations} stage={stage} />
                            </label>
                        </div>
                    ))}
                    <Button variant="secondary" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => onChange({ parameters: [...parameters, createParameter()] })}>
                        <Add fontSize="small" /> Add parameter
                    </Button>
                    {parameters.length > 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                        Scripts read arguments with arg('Parameter name') and pass them with call('{fn.name || 'Function'}', {'{'} 'Parameter name': value {'}'}).
                        Value pickers and formulas (e.g. {fn.name || 'Function'}(1, 'text')) supply arguments positionally; omitted arguments use the default.
                    </span>}
                </div>
                <FunctionEditor script={fn.script} onScriptChange={script => onChange({ script })} onTest={() => stage.testFunction(fn, functions)} />
            </div>
        </GlassPanel>
    );
};
