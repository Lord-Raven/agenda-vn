import { FC } from 'react';
import { ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { IconButton } from '@mui/material';
import { GameFunction, FUNCTION_RETURN_TYPES, FunctionReturnType } from '../content/Function';
import { GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { FunctionEditor } from '../components/FunctionEditor';
import { Stage } from '../Stage';

export const FUNCTION_RETURN_TYPE_LABELS: Record<FunctionReturnType, string> = {
    void: 'Void (action only)',
    number: 'Number',
    text: 'String (text)',
    checkbox: 'Checkbox',
    option: 'Option',
    optionList: 'Option List',
    actor: 'Actor',
    actorList: 'Actor List',
    item: 'Item',
    itemList: 'Item List',
    location: 'Location',
    locationList: 'Location List',
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
                <p style={{ color: 'var(--agenda-text-muted)', margin: 0 }}>
                    Global JavaScript functions can be invoked by recurring rules, button controls, or other functions.
                    {' '}
                    Return IDs for content references, option IDs for options, and arrays of IDs for lists.
                    Typed functions can be selected as value sources. Stat assignments evaluate functions and referenced
                    Stats once and store the result; triggering a rule again evaluates its sources again.
                    Value evaluation is read-only, including nested calls.
                    Tests run against a copy of the current game and do not save their changes.
                </p>
                <p style={{ color: 'var(--agenda-text-muted)', margin: 0 }}>
                    Use {'{{Function name}}'} in lore, actor lore, or location descriptions to insert a non-void
                    function's current result. Names are case-insensitive and surrounding whitespace is ignored.
                    Each occurrence is evaluated read-only, including nested calls; errors stop substitution.
                    Checkboxes become yes/no, content IDs become names, and lists are comma-separated.
                    Option results use IDs because functions have no option pool.
                    Unknown names and void functions remain unchanged. Existing user/char/global tags take precedence.
                    Returned text is not expanded again.
                </p>
                <label style={{ color: 'var(--agenda-text-muted)' }}>
                    Description
                    <TextArea value={fn.description} onChange={event => onChange({ description: event.target.value })} rows={3} style={{ width: '100%' }} />
                </label>
                <FunctionEditor script={fn.script} onScriptChange={script => onChange({ script })} onTest={() => stage.testFunction(fn, functions)} />
            </div>
        </GlassPanel>
    );
};
