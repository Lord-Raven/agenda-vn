import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Add, Functions } from '@mui/icons-material';
import { useReducedMotion } from 'framer-motion';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { cloneGameFunction, GameFunction, FUNCTION_RETURN_TYPES, FunctionReturnType } from '../content/Function';
import { Button } from '../components/UiComponents';
import { CategorizedEntrySidebar, toggleSidebarCollapseState, useCachedSidebarCollapseState } from '../components/CategorizedEntrySidebar';
import { FunctionDetailPanel, FUNCTION_RETURN_TYPE_LABELS } from './FunctionDetailPanel';

export const FunctionManagementPanel: FC<{ stage: () => Stage }> = ({ stage }) => {
    const stageInstance = stage();
    const [functions, setFunctions] = useState(() => stageInstance.getConfiguration().functions.map(cloneGameFunction));
    const [selectedFunctionId, setSelectedFunctionId] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useCachedSidebarCollapseState('function-management');
    const shouldReduceMotion = useReducedMotion();
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
    const selectedFunction = functions.find(fn => fn.id === selectedFunctionId);
    const sections = FUNCTION_RETURN_TYPES.map(type => ({
        id: type,
        title: FUNCTION_RETURN_TYPE_LABELS[type],
        entries: functions.filter(fn => fn.returnType === type),
    }));
    const create = (returnType: FunctionReturnType) => {
        const names = new Set(functions.map(fn => fn.name.trim().toLowerCase()));
        let name = 'New Function';
        for (let counter = 1; names.has(name.toLowerCase()); counter++) name = `New Function ${counter}`;
        const fn: GameFunction = { id: generateUuid(), name, description: '', script: '', returnType };
        update([...functions, fn]);
        setSelectedFunctionId(fn.id);
        setCollapsedCategories(current => ({ ...current, [returnType]: false }));
    };
    const patch = (fields: Partial<GameFunction>) => {
        update(functions.map(fn => fn.id === selectedFunctionId ? { ...fn, ...fields } : fn));
        const returnType = fields.returnType;
        if (returnType) setCollapsedCategories(current => ({ ...current, [returnType]: false }));
    };
    const move = (offset: -1 | 1) => {
        const index = functions.findIndex(fn => fn.id === selectedFunctionId);
        if (index < 0 || index + offset < 0 || index + offset >= functions.length) return;
        const next = [...functions];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        update(next);
    };
    const remove = () => {
        const index = functions.findIndex(fn => fn.id === selectedFunctionId);
        const next = functions.filter(fn => fn.id !== selectedFunctionId);
        update(next);
        const selected = next[Math.min(index, next.length - 1)];
        setSelectedFunctionId(selected?.id ?? null);
        if (selected) setCollapsedCategories(current => ({ ...current, [selected.returnType]: false }));
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: '20px', flex: 1, minHeight: 0, height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                <Button onClick={() => create('void')}><Add /> Add Function</Button>
                <CategorizedEntrySidebar
                    sections={sections}
                    collapsedSections={collapsedCategories}
                    defaultCollapsed={false}
                    onToggleSection={id => setCollapsedCategories(current => toggleSidebarCollapseState(current, id, false))}
                    renderEntry={fn => (
                        <button
                            type="button"
                            onClick={() => setSelectedFunctionId(fn.id)}
                            aria-pressed={fn.id === selectedFunctionId}
                            style={{
                                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px',
                                background: fn.id === selectedFunctionId
                                    ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                                    : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                                border: `1px solid ${fn.id === selectedFunctionId ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                                borderRadius: '8px', padding: '10px', color: 'var(--agenda-text-primary)', cursor: 'pointer',
                                overflowWrap: 'anywhere',
                            }}
                        >
                            <Functions style={{ color: 'var(--agenda-highlight)', flexShrink: 0 }} />
                            <span style={{ minWidth: 0 }}>
                                <strong>{fn.name || '(Unnamed Function)'}</strong>
                                {fn.description && <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '12px', marginTop: '4px' }}>{fn.description}</span>}
                            </span>
                        </button>
                    )}
                    getEntryKey={fn => fn.id}
                    shouldReduceMotion={Boolean(shouldReduceMotion)}
                    emptyListMessage="No functions defined."
                    sectionEmptyMessage="No functions."
                    renderSectionAction={section => {
                        const type = FUNCTION_RETURN_TYPES.find(type => type === section.id);
                        if (type) create(type);
                    }}
                />
            </div>
            <div style={{
                background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
                border: '1px solid var(--agenda-line-subtle)', borderRadius: '12px',
                display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden',
            }}>
                {selectedFunction ? (
                    <FunctionDetailPanel key={selectedFunction.id} fn={selectedFunction} functions={functions} stage={stageInstance}
                        onChange={patch} onMove={move} onDelete={remove} />
                ) : (
                    <div style={{ color: 'var(--agenda-text-muted)', textAlign: 'center', padding: '30px' }}>
                        {functions.length === 0 && <p>No functions defined.</p>}
                        Select a function to view and edit details, or create one in a return type category.
                    </div>
                )}
            </div>
        </div>
    );
};
