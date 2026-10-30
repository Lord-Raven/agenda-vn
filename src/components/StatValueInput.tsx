import { CSSProperties, FC, useEffect, useState } from 'react';
import { findStatOptionByValue, isNumericDisplayType, isOptionListStatType, isReferenceListDisplayType, normalizeStatValue, OptionListSourceContext, resolveAvailableStatOptions, resolveReferenceKind, resolveStatOptionPool, Stat, StatUpdate, StatValue, getStatOptionValue } from '../content/Stat';
import { Stage } from '../Stage';
import { ActorLike, ReferenceMultiSelect, ReferenceSelect, TextInput } from './UiComponents';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';
import { valuePickerOptions, isValueReference } from '../content/Function';
import { SearchableOptionPicker } from './SearchableOptionPicker';
import { validateValueExpression } from '../content/ValueExpression';

interface StatValueInputProps {
    stat?: Stat;
    value: StatValue;
    onChange: (value: StatValue) => void;
    actors?: ActorLike[];
    items?: ItemLike[];
    locations?: LocationLike[];
    stage?: Stage | (() => Stage);
    // Adds dice/relative-expression guidance for stat update inputs. All numeric inputs support formulas.
    allowExpression?: boolean;
    // The owning entity's statMap etc., so a sourced option stat only offers that entity's active options.
    optionContext?: OptionListSourceContext;
}

export const StatValueInput: FC<StatValueInputProps> = ({ stat, value, onChange, actors = [], items = [], locations = [], stage, allowExpression = false, optionContext }) => {
    const stageInstance = typeof stage === 'function' ? stage() : stage;
    if (!stat) {
        return <FormulaValueInput value={value} onChange={onChange} />;
    }
    if (stageInstance) {
        optionContext = { ...optionContext, resolveValue: (source, type) => stageInstance.resolveValue(source, type) };
    }
    if (stat.type === 'checkbox') {
        if (valuePickerOptions(stageInstance?.getConfiguration(), stat.type).length || isValueReference(value)) {
            return <SearchableOptionPicker
                value={String(value)}
                onChange={next => {
                    if (typeof next === 'string') onChange(next === 'true' ? true : next === 'false' ? false : next);
                }}
                options={[{ key: 'true', label: 'True' }, { key: 'false', label: 'False' }]}
                functionType="checkbox" stage={stage} title="Choose value"
            />;
        }
        return (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
                {value === true ? 'True' : 'False'}
            </label>
        );
    }

    if (stat.type === 'option') {
        const selectedOption = findStatOptionByValue(stat, value, optionContext);
        const options = resolveAvailableStatOptions(stat, value, optionContext);
        return (
            <SearchableOptionPicker value={isValueReference(value) ? value : selectedOption?.value || ''}
                onChange={next => { if (typeof next === 'string') onChange(next); }}
                options={options.map((option, index) => ({ key: getStatOptionValue(option, index), label: option.name, description: option.description }))}
                functionType="option" stage={stage} title="Choose option" emptyLabel="Select an option..."
            />
        );
    }

    if (isOptionListStatType(stat.type)) {
        const selectedIds = Array.isArray(value)
            ? Array.from(new Set(value.map(entry => isValueReference(entry) ? entry : findStatOptionByValue(stat, entry, optionContext)?.value || entry)))
            : isValueReference(value) ? [value] : [];
        const pool = resolveAvailableStatOptions(stat, value, optionContext);
        if (valuePickerOptions(stageInstance?.getConfiguration(), 'option').length || valuePickerOptions(stageInstance?.getConfiguration(), 'optionList').length || selectedIds.some(isValueReference)) {
            return <SearchableOptionPicker multiple values={selectedIds} onChange={next => onChange(Array.isArray(next) ? next : [])}
                options={pool.map(option => ({ key: option.id!, label: option.name, description: option.description }))}
                functionType="option" stage={stage} title="Choose active options" />;
        }
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
        return <FormulaValueInput value={value} onChange={onChange} />;
    }

    const referenceKind = resolveReferenceKind(stat.type);
    if (isReferenceListDisplayType(stat.type)) {
        return (
            <ReferenceMultiSelect
                kind={referenceKind}
                values={Array.isArray(value) ? value : isValueReference(value) ? [value] : []}
                onChange={(ids) => onChange(ids)}
                actors={actors}
                items={items}
                locations={locations}
                stage={stage}
            />
        );
    }
    if (referenceKind) {
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

    return <FormulaValueInput numeric value={value} onChange={onChange} allowExpression={allowExpression} />;
};

const FormulaValueInput: FC<Pick<StatValueInputProps, 'value' | 'onChange' | 'allowExpression'> & { numeric?: boolean }> = ({ value, onChange, numeric = false, allowExpression }) => {
    const [draft, setDraft] = useState(String(value ?? ''));
    const [error, setError] = useState('');
    useEffect(() => {
        setDraft(String(value ?? ''));
        setError('');
    }, [value]);
    const commit = () => {
        if (draft === String(value ?? '')) return;
        try {
            const number = Number(draft);
            if (numeric && draft.trim() && !isValueReference(draft)) validateValueExpression(draft);
            onChange(numeric && Number.isFinite(number) ? number : draft);
            setError('');
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            console.error(message);
            setError(message);
        }
    };
    return <div style={{ display: 'grid', gap: 4, minWidth: 0 }}><TextInput fullWidth value={draft}
        aria-invalid={error ? true : undefined}
        placeholder={numeric ? (allowExpression ? 'e.g. 5, -2, 1d6+1, or Score() * 2' : 'e.g. 5 or Score() * 2') : 'Text, Greeting(), or {{Greeting}}'}
        title={numeric ? 'Arithmetic: +, -, *, /, %, parentheses, dice, Function name(args…), call("Function name", args…), get("Global Stat").' : 'Use Function name(args…) or {{Function name}} for text functions. References: function:<id>, globalStat:<id>.'}
        onChange={event => { setDraft(event.target.value); setError(''); }}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
        {error && <span role="alert" style={{ color: 'var(--agenda-text-primary)', fontSize: 12 }}>{error}</span>}
    </div>;
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
