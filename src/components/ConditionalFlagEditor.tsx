import { FC } from 'react';
import { Stat } from '../content/Stat';
import { ConditionalFlag } from '../content/Stat';
import { ConditionEditor } from './ConditionEditor';
import { LocationLike } from './LocationPortrait';

interface ConditionalFlagEditorProps {
    label: string;
    flag: ConditionalFlag;
    onChange: (flag: ConditionalFlag) => void;
    enabledLabel?: string;
    disabledLabel?: string;
    globalStats: Stat[];
    actorStats?: Stat[];
    actors?: Array<{ id: string; name: string; category?: string }>;
    locations?: LocationLike[];
    allowVariableActorTarget?: boolean;
    fieldLabelStyle?: React.CSSProperties;
    inlineFieldStyle?: React.CSSProperties;
}

// Reusable editor for a ConditionalFlag: a dropdown choosing the value to apply, plus an optional condition
// editor (mirroring Location's availability unavailable/disabled pattern) that gates when it applies.
export const ConditionalFlagEditor: FC<ConditionalFlagEditorProps> = ({
    label,
    flag,
    onChange,
    enabledLabel = 'Enabled',
    disabledLabel = 'Disabled',
    globalStats,
    actorStats = [],
    actors = [],
    locations = [],
    allowVariableActorTarget = false,
    fieldLabelStyle,
    inlineFieldStyle,
}) => {
    const hasConditions = flag.conditions.length > 0;

    return (
        <div style={{ marginBottom: 10 }}>
            <div style={inlineFieldStyle}>
                <label style={fieldLabelStyle}>{label}</label>
                <select
                    className="input-base"
                    value={flag.value ? 'enable' : 'disable'}
                    onChange={(e) => onChange({ ...flag, value: e.target.value === 'enable' })}
                >
                    <option value="enable">{enabledLabel}</option>
                    <option value="disable">{disabledLabel}</option>
                </select>
            </div>
            <div style={{ marginTop: 6, marginLeft: fieldLabelStyle ? undefined : 0 }}>
                <ConditionEditor
                    conditionCollections={flag.conditions}
                    globalStats={globalStats}
                    actorStats={actorStats}
                    actors={actors}
                    locations={locations}
                    allowVariableActorTarget={allowVariableActorTarget}
                    onChange={(conditions) => onChange({ ...flag, conditions })}
                />
                {hasConditions && (
                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                        Applies "{flag.value ? enabledLabel : disabledLabel}" while a condition collection is met, otherwise "{flag.value ? disabledLabel : enabledLabel}".
                    </span>
                )}
            </div>
        </div>
    );
};
