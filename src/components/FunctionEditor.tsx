import { FC, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Popover, Typography } from '@mui/material';
import { AutoAwesome, PlayArrow } from '@mui/icons-material';
import { Button, ConfirmDialog, TextArea } from './UiComponents';
import { FunctionScriptTestResult } from '../content/Function';
import { useTooltip } from './TooltipContext';

interface FunctionEditorProps {
    script: string;
    onScriptChange: (script: string) => void;
    onTest: () => FunctionScriptTestResult;
    onGenerate?: () => Promise<string>;
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

export const FunctionEditor: FC<FunctionEditorProps> = ({
    script, onScriptChange, onTest, onGenerate,
}) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
    const [testRun, setTestRun] = useState<{ script: string; result: FunctionScriptTestResult } | null>(null);
    const testResult = testRun?.script === script ? testRun.result : undefined;
    const [confirmGeneration, setConfirmGeneration] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState('');
    const pending = useRef(false);
    const mounted = useRef(false);
    const latest = useRef({ script, onScriptChange });
    latest.current = { script, onScriptChange };
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const generate = async () => {
        if (!onGenerate || pending.current) return;
        pending.current = true;
        setConfirmGeneration(false);
        setGenerationError('');
        setIsGenerating(true);
        try {
            const generated = await onGenerate();
            if (!mounted.current) return;
            if (latest.current.script !== script) {
                throw new Error('The script changed during generation. Your edits were kept; please generate again.');
            }
            latest.current.onScriptChange(generated);
            setTestRun(null);
        } catch (error) {
            console.error('Failed to generate function script:', error);
            if (mounted.current) {
                setGenerationError(`Failed to generate function script: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            pending.current = false;
            if (mounted.current) setIsGenerating(false);
        }
    };

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label style={fieldLabelStyle}>Script</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                    {onGenerate && (
                        <Button
                            variant="secondary"
                            disabled={isGenerating}
                            onClick={() => setConfirmGeneration(true)}
                            onMouseEnter={() => setTooltip('Generate a script after confirming replacement of the current script body', AutoAwesome)}
                            onMouseLeave={clearTooltip}
                        >
                            <AutoAwesome fontSize="small" /> {isGenerating ? 'Generating...' : 'Generate'}
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        onClick={() => setTestRun({ script, result: onTest() })}
                        onMouseEnter={() => setTooltip('Test with a clone of the current game state', PlayArrow)}
                        onMouseLeave={clearTooltip}
                    >
                        <PlayArrow fontSize="small" /> Test
                    </Button>
                    <IconButton
                        size="small"
                        aria-label="Function script reference"
                        aria-expanded={Boolean(helpAnchor)}
                        onClick={(event) => setHelpAnchor(event.currentTarget)}
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
                open={Boolean(helpAnchor)}
                anchorEl={helpAnchor}
                onClose={() => setHelpAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { style: { maxWidth: 420, padding: 12, backgroundColor: 'var(--agenda-surface-base)', color: 'var(--agenda-text-primary)', border: '1px solid color-mix(in srgb, var(--agenda-text-muted) 35%, transparent)' } } }}
            >
                <Box style={{ display: 'grid', gap: 8 }}>
                    <Typography variant="subtitle2" style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>Function script reference</Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        Use <strong>Score()</strong>, <strong>call("Function name")</strong>, or
                        <strong> get("Global Stat")</strong> in formulas. Numeric <strong>{'{{Name}}'}</strong> macros
                        resolve functions first, then global Stats; use <strong>get("Global Stat")</strong> to
                        select a Stat when names overlap. Numeric value fields also offer a source picker for
                        number-returning functions and numeric global Stats. Numeric formulas support +, -, *, /, %,
                        parentheses, dice (for example, 1d6), and positional arguments such as
                        <strong> Score(2, 'hard')</strong>. In text values, call <strong>Greeting('Bob')</strong>
                        or use <strong>{'{{Greeting}}'}</strong> in lore or descriptions. Names are case-insensitive;
                        duplicate names are ambiguous. Function-backed values are read-only, and Test runs on a
                        copy without saving changes.
                        Generate asks for confirmation before replacing only the script body using the description,
                        parameters, other Functions, world context, stats, and this API. Review and Test the result;
                        generation does not execute it.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        Functions are global and may declare typed parameters. Option and Option List parameters
                        can use their own options or source the active choices from a global Option List.
                        Read an argument with
                        <strong> arg('Parameter name')</strong>; omitted arguments fall back to the parameter's
                        default through the normal stat pipeline, so defaults may reference functions or global
                        stats. Pass arguments to other functions with
                        <strong> call('Name', {'{'} 'Parameter name': value {'}'})</strong>; value pickers prompt
                        for arguments when a parameterful function is chosen.
                        Use <strong>get(name)</strong> / <strong>set(name, value)</strong> to read or update global stats.
                        Use <strong>getActor(name)</strong>, <strong>getLocation(name)</strong>, and
                        <strong>getItem(name)</strong> to resolve another entity by name.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        <strong>random()</strong> returns a number from 0 (inclusive) to 1 (exclusive).
                        Each invocation starts a repeatable sequence seeded by this function's ID, resolved
                        parameter values (including defaults), and the current game date and time period.
                        Successive calls advance the sequence; invoking again with the same inputs replays it.
                        Nested functions have independent sequences. For a six-sided die, use
                        <strong> Math.floor(random() * 6) + 1</strong>. <strong>Math.random()</strong> is not seeded.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        <strong>get(name)</strong> returns IDs for lists. Use <strong>getObjects(name)</strong>
                        {' '}(also available on entity accessors) to resolve
                        an option list or actor/item/location list in its stored order. Content entries expose
                        <strong> id</strong>, <strong>name</strong>, <strong>kind</strong>, and the same
                        <strong> get/set/getField/setField</strong> methods as other entity accessors.
                        Options expose <strong>id</strong>, <strong>name</strong>, and <strong>description</strong>
                        {' '}as copies; editing them does not change the option definition.
                        Missing or inactive content is omitted. Unknown or non-list stats raise a script error.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        You can also loop every active entity with <strong>actors()</strong>, <strong>locations()</strong>,
                        and <strong>items()</strong>. For simple metadata, use <strong>getField(name)</strong> and
                        <strong>setField(name, value)</strong> on actors/locations/items (for example: name, role,
                        description, category, imageUrl, themeColor).
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        Actor accessors also expose <strong>getLocation()</strong>, which evaluates their own and
                        universal schedule rules using the current game date, time, and stats.
                        It returns a Location accessor, or <strong>undefined</strong> if the actor is available
                        without an assigned location, unavailable, or the location is missing or inactive.
                        For a Location return value, use <strong>return getActor('Alice')?.getLocation()?.id ?? '';</strong>
                        {' '}or filter actors with <strong>actors().filter(a =&gt; a.getLocation()?.id === 'location-id')</strong>.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        This script may optionally <strong>return</strong> a value; other functions can call it with
                        <strong>call(name)</strong>. Any stats written through <strong>set</strong> go through the normal stat
                        normalization pipeline, while direct field writes skip that pipeline and mutate the underlying
                        content object.
                    </Typography>
                    <Typography variant="body2" style={{ color: 'var(--agenda-text-muted)', lineHeight: 1.5 }}>
                        Declare a return type to offer this function in matching value pickers. Return a primitive,
                        content ID, option ID, or array of IDs matching that type. Matching global stats are also
                        available in value pickers, including text stats in icon pickers. Lists can mix literal IDs
                        with functions and global stats; list-valued entries are expanded in order. References
                        read the current save value (or configured default) each time, and cycles raise an error.
                        Function-backed values cannot use set or setField, including through nested calls.
                        Explicit action invocations can still write to the game.
                    </Typography>
                </Box>
            </Popover>
            <ConfirmDialog
                isOpen={confirmGeneration}
                title="Generate Function Script"
                message="Generate a JavaScript body from this Function's description? This will replace the existing script. Review and Test the generated code before using it."
                confirmText="Generate"
                onConfirm={generate}
                onCancel={() => setConfirmGeneration(false)}
            />
            {generationError && <div role="alert" style={fieldLabelStyle}>{generationError}</div>}
            <TextArea
                value={script}
                onChange={(event) => onScriptChange(event.target.value)}
                rows={20}
                placeholder={[
                    'set(\'Gold\', get(\'Gold\') + 10);',
                    '// Read list objects without changing get()\'s ID values:',
                    'getObjects(\'Party\').forEach(actor => {',
                    '    actor.set(\'Affinity\', actor.get(\'Affinity\') + 1);',
                    '    const role = actor.getField(\'role\');',
                    '});',
                    'const descriptions = getObjects(\'Choices\').map(option => option.description);',
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
