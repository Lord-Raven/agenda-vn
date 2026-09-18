import { FC } from 'react';
import { findStatOptionByValue, getStatOptionValue, isReferenceListDisplayType, resolveReferenceKind, Stat, StatValue, isNumericDisplayType } from '../content/Stat';
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
}

export const StatValueInput: FC<StatValueInputProps> = ({ stat, value, onChange, actors = [], items = [], locations = [], stage, allowExpression = false }) => {
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
                {(stat.options || []).map((option, optionIndex) => {
                    const optionValue = getStatOptionValue(option, optionIndex);
                    return <option key={optionValue} value={optionValue}>{option.name}</option>;
                })}
            </select>
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
