import { FC, useRef, useState } from 'react';
import { Box, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { Button, TextArea } from './UiComponents';
import { FunctionScriptTestResult } from '../content/Stat';

interface StatFunctionEditorProps {
    script: string;
    onScriptChange: (script: string) => void;
    // Label used for the script field; entities that support per-instance overrides of a function (e.g. Item)
    // should describe this as the default/fallback implementation.
    scriptLabel?: string;
    onTest?: (targetId?: string) => FunctionScriptTestResult;
    testTargets?: { id: string; name: string }[];
}

const fieldLabelStyle = { color: 'var(--agenda-text-muted)', fontSize: 12 };

const formatTestValue = (value: unknown): string => {
    if (value === undefined) {
        return 'No return value.';
    }
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
        return String(value);
    }
};

// Editor for a 'function' stat's script body: plain JavaScript run via runFunctionScript when invoked. The
// script can read/write global stats via `get(name)`/`set(name, value)`, a bound `target` entity's own stats
// via `target.get(name)`/`target.set(name, value)` (when a target is bound), other named or looped actors/
// locations/items via `getActor(name)`, `getLocation(name)`, `getItem(name)`, `actors()`, `locations()`,
// `items()`, and other function stats via `call(name)`. It may optionally `return` a value for the caller to use.
export const StatFunctionEditor: FC<StatFunctionEditorProps> = ({
    script, onScriptChange,
    scriptLabel = 'Script',
    onTest, testTargets,
}) => {
    const [helpOpen, setHelpOpen] = useState(false);
    const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const targetId = testTargets?.find(candidate => candidate.id === selectedTargetId)?.id || testTargets?.[0]?.id;
    const [testRun, setTestRun] = useState<{ script: string; targetId?: string; result: FunctionScriptTestResult } | null>(null);
    const testResult = testRun?.script === script && testRun.targetId === targetId ? testRun.result : undefined;

    const closeHelpIfFocusLeft = (nextTarget: EventTarget | null) => {
        if (!containerRef.current || !nextTarget) {
            setHelpOpen(false);
            return;
        }
        const nextNode = nextTarget instanceof Node ? nextTarget : null;
        if (!nextNode || !containerRef.current.contains(nextNode)) {
            setHelpOpen(false);
        }
    };

    return (
        <div
            ref={containerRef}
            style={{ display: 'grid', gap: 8 }}
            onBlur={(event) => closeHelpIfFocusLeft(event.relatedTarget)}
        >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label style={fieldLabelStyle}>{scriptLabel}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                {onTest && (
                    <>
                        {testTargets && (
                            <select
                                className="input-base"
                                aria-label="Function test target"
                                value={targetId || ''}
                                onChange={(event) => setSelectedTargetId(event.target.value)}
                                style={{ minWidth: 0, maxWidth: '100%' }}
                            >
                                {testTargets.length === 0 && <option value="">No active targets</option>}
                                {testTargets.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                            </select>
                        )}
                        <Tooltip title="Test with a clone of the current game state">
                        <span>
                        <Button
                            variant="secondary"
                            disabled={testTargets !== undefined && !targetId}
                            onClick={() => setTestRun({ script, targetId, result: onTest(targetId) })}
                        >
                            <PlayArrow fontSize="small" /> Test
                        </Button>
                        </span>
                        </Tooltip>
                    </>
                )}
                <IconButton
                    size="small"
                    aria-label="Function script reference"
                    onClick={(event) => {
                        if (helpOpen) {
                            setHelpOpen(false);
                            return;
                        }
                        setHelpAnchor(event.currentTarget);
                        setHelpOpen(true);
                    }}
                    onBlur={(event) => closeHelpIfFocusLeft(event.relatedTarget)}
                    style={{
                        width: 20,
                        height: 20,
                        padding: 0,
                        borderRadius: '50%',
                        color: 'var(--agenda-text-muted)',
                        border: '1px solid color-mix(in srgb, var(--agenda-text-muted) 45%, transparent)',
                        background: 'transparent',
                    }}
                >
                    ?
                </IconButton>
                </div>
            </div>
            <Popover
                open={helpOpen}
                anchorEl={helpAnchor}
                onClose={() => setHelpOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { style: { maxWidth: 420, padding: 12, backgroundColor: 'var(--agenda-panel-bg)', opacity: 1, color: 'var(--agenda-text-primary)', border: '1px solid color-mix(in srgb, var(--agenda-text-muted) 35%, transparent)' } } }}
                disableAutoFocus
                disableEnforceFocus
                keepMounted
            >
                <Box style={{ display: 'grid', gap: 8 }}>
                    <Typography variant="subtitle2" style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>Function script reference</Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        Use <strong>get(name)</strong> / <strong>set(name, value)</strong> to read or update global stats. Use
                        <strong> target.get(name)</strong> / <strong>target.set(name, value)</strong> for the current bound actor,
                        location, or item, and <strong>getActor(name)</strong>, <strong>getLocation(name)</strong>, and
                        <strong>getItem(name)</strong> to resolve another entity by name.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        You can also loop every active entity with <strong>actors()</strong>, <strong>locations()</strong>,
                        and <strong>items()</strong>. For simple metadata, use <strong>getField(name)</strong> and
                        <strong>setField(name, value)</strong> on actors/locations/items (for example: name, role,
                        description, category, imageUrl, themeColor).
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        This script may optionally <strong>return</strong> a value; other function stats can call it with
                        <strong>call(name)</strong>. Any stats written through <strong>set</strong> go through the normal stat
                        normalization pipeline, while direct field writes skip that pipeline and mutate the underlying
                        content object.
                    </Typography>
                </Box>
            </Popover>
            <TextArea
                value={script}
                onChange={(event) => onScriptChange(event.target.value)}
                rows={16}
                onBlur={(event) => closeHelpIfFocusLeft(event.relatedTarget)}
                placeholder={[
                    'set(\'Gold\', get(\'Gold\') + 10);',
                    'if (target) {',
                    '    target.set(\'Affinity\', target.get(\'Affinity\') + 1);',
                    '}',
                    '',
                    '// Loop through every active actor, location, and item:',
                    'actors().forEach(actor => {',
                    '    if (actor.get(\'Affinity\') > 50) {',
                    '        actor.setField(\'role\', \'Trusted Ally\');',
                    '    }',
                    '});',
                    '',
                    'locations().forEach(location => {',
                    '    if (location.get(\'Danger\') > 0) {',
                    '        location.setField(\'description\', \'A danger zone.\');',
                    '    }',
                    '});',
                    '',
                    'let totalInventoryValue = 0;',
                    'items().forEach(item => {',
                    '    totalInventoryValue += item.get(\'Value\') || 0;',
                    '});',
                    'set(\'Inventory Value\', totalInventoryValue);',
                    '',
                    'return totalInventoryValue;',
                ].join('\n')}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
            {testResult && (
                <div role={testResult.errors.length ? 'alert' : 'status'} style={{ fontSize: 12, color: 'var(--agenda-text-primary)', minWidth: 0 }}>
                    <strong>{testResult.errors.length ? 'Test failed' : 'Test passed'}</strong>
                    <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {testResult.errors.length ? testResult.errors.join('\n') : formatTestValue(testResult.value)}
                    </pre>
                </div>
            )}
        </div>
    );
};
