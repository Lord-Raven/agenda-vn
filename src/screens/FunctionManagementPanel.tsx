import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { IconButton } from '@mui/material';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { cloneGameFunction, GameFunction, FUNCTION_RETURN_TYPES, FunctionReturnType } from '../content/Function';
import { Button, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { FunctionEditor } from '../components/FunctionEditor';

export const FunctionManagementPanel: FC<{ stage: () => Stage }> = ({ stage }) => {
    const stageInstance = stage();
    const [functions, setFunctions] = useState(() => stageInstance.getConfiguration().functions.map(cloneGameFunction));
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(functions.map(fn => [fn.id, true])));
    const draftRef = useRef(functions);
    const dirtyRef = useRef(false);

    const persist = useCallback(() => {
        if (!dirtyRef.current) {
            return;
        }
        stageInstance.updateConfiguration({ functions: draftRef.current.map(cloneGameFunction) });
        stageInstance.saveGame();
        dirtyRef.current = false;
    }, [stageInstance]);

    useEffect(() => {
        const timeout = window.setTimeout(persist, 500);
        return () => window.clearTimeout(timeout);
    }, [functions, persist]);

    useEffect(() => () => persist(), [persist]);

    const update = (next: GameFunction[]) => {
        draftRef.current = next;
        dirtyRef.current = true;
        setFunctions(next);
    };
    const patch = (id: string, fields: Partial<GameFunction>) =>
        update(functions.map(fn => fn.id === id ? { ...fn, ...fields } : fn));
    const move = (index: number, offset: number) => {
        const next = [...functions];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        update(next);
    };

    return (
        <GlassPanel style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
            <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>Functions</Title>
            <p style={{ color: 'var(--agenda-text-muted)' }}>
                Global JavaScript functions can be invoked by recurring rules, button controls, or other functions.
                Tests run against a copy of the current game and do not save their changes.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
                {functions.length === 0 && <p style={{ color: 'var(--agenda-text-muted)' }}>No functions defined.</p>}
                {functions.map((fn, index) => (
                    <div key={fn.id} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 6, padding: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Button variant="secondary" onClick={() => setCollapsed(current => ({ ...current, [fn.id]: !current[fn.id] }))}>
                                {collapsed[fn.id] ? 'Expand' : 'Collapse'}
                            </Button>
                            <strong style={{ flex: 1, color: 'var(--agenda-text-primary)' }}>{fn.name || '(Unnamed Function)'}</strong>
                            <IconButton size="small" aria-label="Move function up" disabled={index === 0} onClick={() => move(index, -1)} sx={{ color: 'var(--agenda-text-primary)' }}><ArrowUpward fontSize="small" /></IconButton>
                            <IconButton size="small" aria-label="Move function down" disabled={index === functions.length - 1} onClick={() => move(index, 1)} sx={{ color: 'var(--agenda-text-primary)' }}><ArrowDownward fontSize="small" /></IconButton>
                            <IconButton size="small" aria-label="Delete function" onClick={() => update(functions.filter(candidate => candidate.id !== fn.id))} sx={{ color: 'var(--agenda-text-primary)' }}><Delete fontSize="small" /></IconButton>
                        </div>
                        {!collapsed[fn.id] && (
                            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                                <label style={{ color: 'var(--agenda-text-muted)' }}>
                                    Name
                                    <TextInput fullWidth value={fn.name} onChange={event => patch(fn.id, { name: event.target.value })} />
                                </label>
                                <label style={{ color: 'var(--agenda-text-muted)' }}>
                                    Return Type
                                    <select className="input-base" value={fn.returnType || 'void'} onChange={event => patch(fn.id, { returnType: event.target.value as FunctionReturnType })}>
                                        {FUNCTION_RETURN_TYPES.map(type => <option key={type} value={type}>{type === 'void' ? 'Void (action only)' : type === 'text' ? 'String (text)' : type}</option>)}
                                    </select>
                                </label>
                                <p style={{ color: 'var(--agenda-text-muted)', margin: 0 }}>
                                    Return IDs for content references, option IDs for options, and arrays of IDs for lists.
                                    Typed functions can be selected as dynamic values. Reading a value is read-only, including nested calls.
                                </p>
                                <label style={{ color: 'var(--agenda-text-muted)' }}>
                                    Description
                                    <TextArea value={fn.description} onChange={event => patch(fn.id, { description: event.target.value })} rows={2} style={{ width: '100%' }} />
                                </label>
                                <FunctionEditor script={fn.script} onScriptChange={script => patch(fn.id, { script })} onTest={() => stageInstance.testFunction(fn, functions)} />
                            </div>
                        )}
                    </div>
                ))}
                <Button onClick={() => update([...functions, { id: generateUuid(), name: 'New Function', description: '', script: '', returnType: 'void' }])}>
                    <Add /> Add Function
                </Button>
            </div>
        </GlassPanel>
    );
};
