import { FC } from 'react';
import { TextArea } from './UiComponents';

interface StatFunctionEditorProps {
    script: string;
    onScriptChange: (script: string) => void;
    // Label used for the script field; entities that support per-instance overrides of a function (e.g. Item)
    // should describe this as the default/fallback implementation.
    scriptLabel?: string;
    scriptDescription?: string;
}

const fieldLabelStyle = { color: 'var(--agenda-text-muted)', fontSize: 12 };

// Editor for a 'function' stat's script body: plain JavaScript run via runFunctionScript when invoked. The
// script can read/write global stats via `get(name)`/`set(name, value)`, a bound `target` entity's own stats
// via `target.get(name)`/`target.set(name, value)` (when a target is bound), any other named actor/location/
// item via `getActor(name)`/`getLocation(name)`/`getItem(name)`, and other function stats via `call(name)`.
// It may optionally `return` a value for the caller to use.
export const StatFunctionEditor: FC<StatFunctionEditorProps> = ({
    script, onScriptChange,
    scriptLabel = 'Script', scriptDescription = 'Plain JavaScript, run when this function is invoked. Read/write stats via get(name)/set(name, value), a bound target via target.get(name)/target.set(name, value), other entities via getActor(name)/getLocation(name)/getItem(name), and other functions via call(name). May optionally return a value.',
}) => {
    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <label style={fieldLabelStyle}>{scriptLabel}</label>
            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 11 }}>{scriptDescription}</span>
            <TextArea
                value={script}
                onChange={(event) => onScriptChange(event.target.value)}
                rows={16}
                placeholder={[
                    'set(\'Gold\', get(\'Gold\') + 10);',
                    'if (target) {',
                    '    target.set(\'Affinity\', target.get(\'Affinity\') + 1);',
                    '}',
                    '',
                    '// Loop through every active actor and location:',
                    'actors().forEach(actor => {',
                    '    if (actor.get(\'Affinity\') > 50) {',
                    '        actor.setField(\'role\', \'Trusted Ally\');',
                    '    }',
                    '});',
                    '',
                    'let totalPopulation = 0;',
                    'locations().forEach(location => {',
                    '    totalPopulation += location.get(\'Population\') || 0;',
                    '});',
                    'set(\'World Population\', totalPopulation);',
                    '',
                    'return totalPopulation;',
                ].join('\n')}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
        </div>
    );
};
