import { FC } from 'react';
import { Add, Delete } from '@mui/icons-material';
import { ActorStat } from '../Stage';
import { Condition, ConditionComparison } from '../content/Condition';
import { Button, TextInput } from './UiComponents';

interface ConditionEditorProps {
    conditions: Condition[];
    playerStats: ActorStat[];
    onChange: (conditions: Condition[]) => void;
}

const COMPARISONS: Array<{ value: ConditionComparison; label: string }> = [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'greaterThanOrEqual', label: 'at least' },
    { value: 'greaterThan', label: 'more than' },
    { value: 'lessThanOrEqual', label: 'at most' },
    { value: 'lessThan', label: 'less than' },
];

const CALENDAR_FIELDS = [
    { value: 'timeOfDay', label: 'Time of day' },
    { value: 'dayOfWeek', label: 'Day of week' },
    { value: 'day', label: 'Day of month' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
] as const;

const selectStyle = {
    minHeight: 38,
    background: 'var(--agenda-surface-base)',
    color: 'var(--agenda-text-primary)',
    border: '1px solid var(--agenda-line-subtle)',
    borderRadius: 6,
    padding: '0 8px',
};

export const ConditionEditor: FC<ConditionEditorProps> = ({ conditions, playerStats, onChange }) => {
    const updateCondition = (index: number, condition: Condition) => {
        onChange(conditions.map((current, currentIndex) => currentIndex === index ? condition : current));
    };

    const renderValueInput = (condition: Condition, index: number) => {
        const updateValue = (value: string | number) => updateCondition(index, { ...condition, value } as Condition);
        if (condition.type === 'calendar' && condition.field === 'timeOfDay') {
            return <select style={selectStyle} value={condition.value} onChange={(event) => updateValue(event.target.value)}>{['morning', 'afternoon', 'evening', 'night'].map(value => <option key={value} value={value}>{value}</option>)}</select>;
        }
        if (condition.type === 'calendar' && condition.field === 'dayOfWeek') {
            return <select style={selectStyle} value={condition.value} onChange={(event) => updateValue(event.target.value)}>{['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(value => <option key={value} value={value}>{value}</option>)}</select>;
        }
        const stat = condition.type === 'playerStat' ? playerStats.find(candidate => candidate.name === condition.statName) : undefined;
        if (stat?.displayType === 'option') {
            return <select style={selectStyle} value={condition.value} onChange={(event) => updateValue(event.target.value)}>{(stat.options || []).map(option => <option key={option.name} value={option.name}>{option.name}</option>)}</select>;
        }
        return <TextInput type="number" value={condition.value} onChange={(event) => updateValue(Number(event.target.value))} />;
    };

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            {conditions.map((condition, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '130px minmax(130px, 1fr) 120px minmax(100px, 1fr) auto', gap: 8, alignItems: 'center' }}>
                    <select
                        style={selectStyle}
                        value={condition.type}
                        onChange={(event) => updateCondition(index, event.target.value === 'calendar'
                            ? { type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' }
                            : { type: 'playerStat', statName: playerStats[0]?.name || '', comparison: 'equals', value: playerStats[0]?.default ?? 0 })}
                    >
                        <option value="calendar">Calendar</option>
                        <option value="playerStat">Player Stat</option>
                    </select>
                    {condition.type === 'calendar' ? (
                        <select style={selectStyle} value={condition.field} onChange={(event) => updateCondition(index, { ...condition, field: event.target.value as typeof condition.field, value: event.target.value === 'timeOfDay' ? 'morning' : event.target.value === 'dayOfWeek' ? 'monday' : 1 })}>
                            {CALENDAR_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
                        </select>
                    ) : (
                        <select style={selectStyle} value={condition.statName} onChange={(event) => {
                            const stat = playerStats.find(candidate => candidate.name === event.target.value);
                            updateCondition(index, { ...condition, statName: event.target.value, value: stat?.default ?? 0 });
                        }}>
                            {playerStats.map(stat => <option key={stat.name} value={stat.name}>{stat.name}</option>)}
                        </select>
                    )}
                    <select style={selectStyle} value={condition.comparison} onChange={(event) => updateCondition(index, { ...condition, comparison: event.target.value as ConditionComparison } as Condition)}>
                        {COMPARISONS.map(comparison => <option key={comparison.value} value={comparison.value}>{comparison.label}</option>)}
                    </select>
                    {renderValueInput(condition, index)}
                    <Button variant="danger" onClick={() => onChange(conditions.filter((_, currentIndex) => currentIndex !== index))} style={{ padding: 7 }} aria-label="Delete condition"><Delete fontSize="small" /></Button>
                </div>
            ))}
            <Button
                variant="secondary"
                onClick={() => onChange([...conditions, { type: 'calendar', field: 'timeOfDay', comparison: 'equals', value: 'morning' }])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifySelf: 'start' }}
            >
                <Add fontSize="small" /> Add condition
            </Button>
        </div>
    );
};