import { CSSProperties, FC } from 'react';
import { findStatOptionByValue, isOptionListStatType, isReferenceListDisplayType, normalizeStatValue, OptionListSourceContext, resolveAvailableStatOptions, resolveReferenceKind, resolveStatOptionPool, Stat, StatUpdate, StatValue, isNumericDisplayType } from '../content/Stat';
import { Stage } from '../Stage';
import { ActorLike, ReferenceMultiSelect, ReferenceSelect, TextInput } from './UiComponents';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';

interface StatValueInputProps {
    stat?: Stat;
    value: StatValue;
    onChange: (value: StatValue) => void;
    actors?: ActorLike[];
    items?: ItemLike[];
    locations?: LocationLike[];
    stage?: Stage | (() => Stage);
    // When true, numeric stats accept dice/relative expressions (e.g. "1d6+1", "-2") instead of a plain number.
    allowExpression?: boolean;
    // The owning entity's statMap etc., so a sourced option stat only offers that entity's active options.
    optionContext?: OptionListSourceContext;
}

export const StatValueInput: FC<StatValueInputProps> = ({ stat, value, onChange, actors = [], items = [], locations = [], stage, allowExpression = false, optionContext }) => {
    if (!stat) {
        return <TextInput fullWidth value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
    }

    if (stat.type === 'checkbox') {
        return (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
                {value === true ? 'True' : 'False'}
            </label>
        );
    }

    if (stat.type === 'option') {
        const selectedOption = findStatOptionByValue(stat, value);
        return (
            <select className="input-base" value={selectedOption?.value || ''} onChange={(e) => onChange(e.target.value)}>
                {!selectedOption && <option value="" disabled>Select an option...</option>}
                {resolveAvailableStatOptions(stat, value, optionContext).map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                ))}
            </select>
        );
    }

    if (isOptionListStatType(stat.type)) {
        const selectedIds = Array.isArray(value) ? (normalizeStatValue(value, stat) as string[]) : [];
        const pool = resolveStatOptionPool(stat);
        if (pool.length === 0) {
            return <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>No options defined.</span>;
        }
        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {pool.map((option) => (
                    <label key={option.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--agenda-text-primary)' }}>
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(option.id!)}
                            onChange={(e) => onChange(e.target.checked
                                ? [...selectedIds, option.id!]
                                : selectedIds.filter((id) => id !== option.id))}
                        />
                        {option.name}
                    </label>
                ))}
            </div>
        );
    }

    if (stat.type === 'text') {
        return <TextInput fullWidth value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
    }

    const referenceKind = resolveReferenceKind(stat.type);
    if (referenceKind) {
        if (isReferenceListDisplayType(stat.type)) {
            return (
                <ReferenceMultiSelect
                    kind={referenceKind}
                    values={Array.isArray(value) ? value : []}
                    onChange={(ids) => onChange(ids)}
                    actors={actors}
                    items={items}
                    locations={locations}
                    stage={stage}
                />
            );
        }
        return (
            <ReferenceSelect
                kind={referenceKind}
                value={typeof value === 'string' ? value : ''}
                onChange={(id) => onChange(id)}
                actors={actors}
                items={items}
                locations={locations}
                stage={stage}
            />
        );
    }

    if (isNumericDisplayType(stat.type) && allowExpression) {
        return (
            <TextInput
                fullWidth
                value={typeof value === 'number' ? String(value) : (typeof value === 'string' ? value : '')}
                placeholder="e.g. 5, -2, or 1d6+1"
                onChange={(e) => {
                    const raw = e.target.value;
                    const numeric = Number(raw);
                    onChange(raw.trim() !== '' && Number.isFinite(numeric) ? numeric : raw);
                }}
            />
        );
    }

    return (
        <TextInput
            fullWidth
            type="number"
            value={String(Number.isFinite(value) ? Number(value) : 0)}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
    );
};

// Operation picker for a stat update action; only numeric and optionList stats have more than "Set to".
export const StatUpdateOperationSelect: FC<{ stat?: Stat; operation: StatUpdate['operation']; onChange: (operation: StatUpdate['operation']) => void; style?: CSSProperties }> = ({ stat, operation, onChange, style }) => {
    if (stat && isNumericDisplayType(stat.type)) {
        return (
            <select style={style} value={operation === 'remove' ? 'adjust' : operation} onChange={(e) => onChange(e.target.value as StatUpdate['operation'])}>
                <option value="adjust">Adjust by</option>
                <option value="set">Set to</option>
            </select>
        );
    }
    if (stat && isOptionListStatType(stat.type)) {
        return (
            <select style={style} value={operation} onChange={(e) => onChange(e.target.value as StatUpdate['operation'])}>
                <option value="adjust">Add</option>
                <option value="remove">Remove</option>
                <option value="set">Set to</option>
            </select>
        );
    }
    return <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Set to</span>;
};
