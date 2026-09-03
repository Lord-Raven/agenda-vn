import { FC } from 'react';
import { AddCircleOutline } from '@mui/icons-material';
import { Stat } from '../content/Stat';
import { ConditionalFlag } from '../content/Stat';
import { ConditionEditor } from './ConditionEditor';
import { LocationLike } from './LocationPortrait';
import { Button } from './UiComponents';
import { useTooltip } from './TooltipContext';

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
    const { setTooltip, clearTooltip } = useTooltip();

    return (
        <div style={{ marginBottom: 10 }}>
            <div style={inlineFieldStyle ? { ...inlineFieldStyle, gridTemplateColumns: '120px minmax(0, 1fr) auto' } : undefined}>
                <label style={fieldLabelStyle}>{label}</label>
                <select
                    className="input-base"
                    value={flag.value ? 'enable' : 'disable'}
                    onChange={(e) => onChange({ ...flag, value: e.target.value === 'enable' })}
                >
                    <option value="enable">{enabledLabel}</option>
                    <option value="disable">{disabledLabel}</option>
                </select>
                <Button
                    variant="secondary"
                    onClick={() => onChange({
                        ...flag,
                        conditions: [...flag.conditions, [{ type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' }]],
                    })}
                    onMouseEnter={() => setTooltip(`Add a Condition for ${label}`, AddCircleOutline)}
                    onMouseLeave={clearTooltip}
                    style={{ minWidth: 32, minHeight: 32, padding: 0, display: 'grid', placeItems: 'center' }}
                    aria-label={`Add a Condition for ${label}`}
                >
                    <AddCircleOutline fontSize="small" />
                </Button>
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
                    showAddConditionButton={false}
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
