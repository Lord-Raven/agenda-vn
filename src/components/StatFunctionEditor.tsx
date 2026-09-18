import { FC } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, Delete } from '@mui/icons-material';
import { Stat, StatFunctionParameter, StatFunctionParameterType, StatUpdateRule } from '../content/Stat';
import { Stage } from '../Stage';
import { Button, TextArea, TextInput } from './UiComponents';
import { StatUpdateRuleEditor } from './StatUpdateRuleEditor';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';

interface StatFunctionEditorProps {
    parameters: StatFunctionParameter[];
    onParametersChange: (parameters: StatFunctionParameter[]) => void;
    rules: StatUpdateRule[];
    onRulesChange: (rules: StatUpdateRule[]) => void;
    globalStats: Stat[];
    actorStats: Stat[];
    actors: Array<{ id: string; name: string }>;
    items?: ItemLike[];
    locations: LocationLike[];
    stage?: Stage | (() => Stage);
    // Label used for the rules section; entities that support per-instance overrides of a function (e.g.
    // Item) should describe this as the default/fallback implementation.
    rulesLabel?: string;
    rulesDescription?: string;
}

const PARAMETER_TYPES: Array<{ value: StatFunctionParameterType; label: string }> = [
    { value: 'actor', label: 'Actor' },
    { value: 'item', label: 'Item' },
    { value: 'location', label: 'Location' },
    { value: 'number', label: 'Number' },
    { value: 'text', label: 'Text' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'option', label: 'Option' },
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

const fieldLabelStyle = { color: 'var(--agenda-text-muted)', fontSize: 12 };

// Editor for a 'function' stat's callable definition: its named parameters, plus the default rule set run
// on invocation (see Stat.parameters/functionRules and StatUpdateRuleEditor's functionParameters support).
export const StatFunctionEditor: FC<StatFunctionEditorProps> = ({
    parameters, onParametersChange, rules, onRulesChange, globalStats, actorStats, actors, items = [], locations, stage,
    rulesLabel = 'Default Rules', rulesDescription = 'Run in order when this function is invoked (all matching rules apply, not just the first).',
}) => {
    const updateParameter = (id: string, patch: Partial<StatFunctionParameter>) => {
        onParametersChange(parameters.map(parameter => parameter.id === id ? { ...parameter, ...patch } : parameter));
    };

    const addParameter = () => {
        onParametersChange([...parameters, { id: generateUuid(), name: `Parameter ${parameters.length + 1}`, description: '', type: 'actor' }]);
    };

    const addParameterOption = (parameterId: string) => {
        const parameter = parameters.find(candidate => candidate.id === parameterId);
        const nextOptions = [...(parameter?.options || []), { id: generateUuid(), name: `Option ${(parameter?.options?.length || 0) + 1}`, description: '' }];
        updateParameter(parameterId, { options: nextOptions });
    };

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
                <label style={fieldLabelStyle}>Parameters</label>
                {parameters.length === 0 && (
                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 11 }}>
                        No parameters. Callers of this function will supply no arguments.
                    </span>
                )}
                {parameters.map((parameter) => (
                    <div key={parameter.id} style={{ display: 'grid', gap: 8, padding: 8, border: '1px solid var(--agenda-line-subtle)', borderRadius: 6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.2fr) minmax(100px, 0.8fr) auto', gap: 8, alignItems: 'center' }}>
                            <TextInput
                                fullWidth
                                value={parameter.name}
                                onChange={(event) => updateParameter(parameter.id, { name: event.target.value })}
                                placeholder="Parameter name"
                            />
                            <select
                                style={selectStyle}
                                value={parameter.type}
                                onChange={(event) => updateParameter(parameter.id, { type: event.target.value as StatFunctionParameterType, options: event.target.value === 'option' ? (parameter.options || []) : undefined })}
                            >
                                {PARAMETER_TYPES.map(candidate => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
                            </select>
                            <Button
                                variant="danger"
                                onClick={() => onParametersChange(parameters.filter(candidate => candidate.id !== parameter.id))}
                                aria-label="Delete parameter"
                                style={{ display: 'grid', placeItems: 'center', minWidth: 30, minHeight: 30, padding: 0 }}
                            >
                                <Delete fontSize="small" />
                            </Button>
                        </div>
                        <TextArea
                            value={parameter.description}
                            onChange={(event) => updateParameter(parameter.id, { description: event.target.value })}
                            rows={2}
                            placeholder="Describe what this parameter represents (e.g. the actor this item is used on)."
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                        {parameter.type === 'option' && (
                            <div style={{ display: 'grid', gap: 6 }}>
                                {(parameter.options || []).map((option, optionIndex) => (
                                    <div key={option.id || optionIndex} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                                        <TextInput
                                            fullWidth
                                            value={option.name}
                                            onChange={(event) => {
                                                const nextOptions = [...(parameter.options || [])];
                                                nextOptions[optionIndex] = { ...nextOptions[optionIndex], name: event.target.value };
                                                updateParameter(parameter.id, { options: nextOptions });
                                            }}
                                            placeholder="Option name"
                                        />
                                        <Button
                                            variant="danger"
                                            onClick={() => updateParameter(parameter.id, { options: (parameter.options || []).filter((_, index) => index !== optionIndex) })}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="secondary" onClick={() => addParameterOption(parameter.id)} style={{ justifySelf: 'start' }}>
                                    Add Option
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
                <Button variant="secondary" onClick={addParameter} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}>
                    <Add fontSize="small" /> Add parameter
                </Button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <label style={fieldLabelStyle}>{rulesLabel}</label>
                <span style={{ color: 'var(--agenda-text-muted)', fontSize: 11 }}>{rulesDescription}</span>
                <StatUpdateRuleEditor
                    rules={rules}
                    globalStats={globalStats}
                    actorStats={actorStats}
                    actors={actors}
                    items={items}
                    locations={locations}
                    stage={stage}
                    functionParameters={parameters}
                    onChange={onRulesChange}
                />
            </div>
        </div>
    );
};
