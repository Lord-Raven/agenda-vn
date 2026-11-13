import { CSSProperties, FC, useContext, useEffect, useRef, useState } from 'react';
import { findStatOptionByValue, isNumericDisplayType, isOptionListStatType, isReferenceListDisplayType, normalizeStatValue, OptionListSourceContext, resolveAvailableStatOptions, resolveReferenceKind, resolveStatOptionPool, statListMaxLength, OPPOSITE_BOOLEAN_VALUE, Stat, StatUpdate, StatValue, getStatOptionValue } from '../content/Stat';
import { Stage } from '../Stage';
import { ActorLike, ReferenceMultiSelect, ReferenceSelect, TextInput } from './UiComponents';
import { LocationLike } from './LocationPortrait';
import { ItemLike } from './ItemPortrait';
import { HEADER_VARIABLE_VALUE, valuePickerOptions, isValueReference } from '../content/Function';
import { HeaderVariableContext } from './VariableContentContext';
import { PickerAllowedOptionsContext, SearchableOptionPicker } from './SearchableOptionPicker';
import { IconPicker } from './StatRating';
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
    // Stat update values may set a boolean stat to the opposite of its current value.
    allowOpposite?: boolean;
    // The owning entity's statMap etc., so a sourced option stat only offers that entity's active options.
    optionContext?: OptionListSourceContext;
}

export const StatValueInput: FC<StatValueInputProps> = ({ stat, value, onChange, actors = [], items = [], locations = [], stage, allowExpression = false, allowOpposite = false, optionContext }) => {
    const stageInstance = typeof stage === 'function' ? stage() : stage;
    const allowedOptions = useContext(PickerAllowedOptionsContext);
    if (!stat) {
        return <FormulaValueInput value={value} onChange={onChange} />;
    }
    if (stageInstance) {
        optionContext = {
            sourceStats: stageInstance.getConfiguration().globalStats,
            globalStatValues: stageInstance.getSave().globalStatValues,
            ...optionContext,
            resolveValue: (source, type) => stageInstance.resolveValue(source, type),
        };
    }
    if (stat.type === 'boolean') {
        const showOpposite = allowOpposite || value === OPPOSITE_BOOLEAN_VALUE;
        if (showOpposite || valuePickerOptions(stageInstance?.getConfiguration(), stat.type).length || isValueReference(value)) {
            return <SearchableOptionPicker
                value={String(value)}
                onChange={next => {
                    if (typeof next === 'string') onChange(next === 'true' ? true : next === 'false' ? false : next);
                }}
                options={[
                    { key: 'true', label: 'True' },
                    { key: 'false', label: 'False' },
                    ...(showOpposite ? [{ key: OPPOSITE_BOOLEAN_VALUE, label: 'Opposite', description: "The opposite of the stat's current value when the update runs." }] : []),
                ]}
                functionType="boolean" stage={stage} title="Choose value"
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
        const pool = resolveAvailableStatOptions(stat, value, optionContext)
            .filter(option => !allowedOptions || allowedOptions.has(option.id!) || selectedIds.includes(option.id!));
        if (valuePickerOptions(stageInstance?.getConfiguration(), 'option').length || valuePickerOptions(stageInstance?.getConfiguration(), 'optionList').length || selectedIds.some(isValueReference)) {
            return <SearchableOptionPicker multiple values={selectedIds} maxSelections={statListMaxLength(stat)} onChange={next => onChange(Array.isArray(next) ? next : [])}
                options={pool.map(option => ({ key: option.id!, label: option.name, description: option.description }))}
                functionType="option" stage={stage} title="Choose active options" />;
        }
        if (pool.length === 0) {
            return <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>{allowedOptions ? 'No options available.' : 'No options defined.'}</span>;
        }
        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                {pool.map((option) => (
                    <label key={option.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--agenda-text-primary)' }}>
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(option.id!)}
                            disabled={!selectedIds.includes(option.id!) && statListMaxLength(stat) !== undefined && selectedIds.length >= statListMaxLength(stat)!}
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

    if (stat.type === 'icon') {
        // Icon stats pick from the shared icon pool; the picker also offers text functions and global text stats.
        return (
            <IconPicker
                stage={stage}
                allowClear
                value={typeof value === 'string' && value ? value : undefined}
                onChange={(iconName) => onChange(iconName || '')}
            />
        );
    }

    if (stat.type === 'text') {
        return <HeaderTextInput value={value} onChange={onChange} />;
    }

    const referenceKind = resolveReferenceKind(stat.type);
    if (isReferenceListDisplayType(stat.type)) {
        return (
            <ReferenceMultiSelect
                kind={referenceKind}
                values={Array.isArray(value) ? value : isValueReference(value) ? [value] : []}
                maxSelections={statListMaxLength(stat)}
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

    return <FormulaValueInput numeric value={value} onChange={onChange} allowExpression={allowExpression} stage={stage} />;
};

// Text input that, inside a list pop-up, can instead bind to the current page's header.
const HeaderTextInput: FC<Pick<StatValueInputProps, 'value' | 'onChange'>> = ({ value, onChange }) => {
    const headerAvailable = useContext(HeaderVariableContext);
    const buttonStyle = { border: '1px solid var(--agenda-line-subtle)', borderRadius: '8px', background: 'var(--agenda-surface-raised)', color: 'var(--agenda-text-primary)', cursor: 'pointer', padding: '4px 10px', whiteSpace: 'nowrap' as const };
    if (value === HEADER_VARIABLE_VALUE) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ padding: '4px 10px', borderRadius: '999px', border: '1px solid var(--agenda-highlight)', color: 'var(--agenda-text-primary)', fontSize: 12 }}>Header</span>
                <button type="button" style={buttonStyle} onClick={() => onChange('')}>Replace</button>
            </div>
        );
    }
    if (!headerAvailable) {
        return <FormulaValueInput value={value} onChange={onChange} />;
    }
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}><FormulaValueInput value={value} onChange={onChange} /></div>
            <button type="button" style={buttonStyle} title="Use the pop-up page's header text" onClick={() => onChange(HEADER_VARIABLE_VALUE)}>Use Header</button>
        </div>
    );
};

const FormulaValueInput: FC<Pick<StatValueInputProps, 'value' | 'onChange' | 'allowExpression' | 'stage'> & { numeric?: boolean }> = ({ value, onChange, numeric = false, allowExpression, stage }) => {
    const [draft, setDraft] = useState(String(value ?? ''));
    const [error, setError] = useState('');
    const selection = useRef<{ start: number; end: number } | null>(null);
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
    const editor = <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <TextInput fullWidth value={draft}
            aria-label="Formula value"
            aria-invalid={error ? true : undefined}
            placeholder={numeric ? (allowExpression ? 'e.g. 5, -2, 1d6+1, or {{Money}} * 2' : 'e.g. 5 or {{Money}} * 2') : 'Text, Greeting(), or {{Greeting}}'}
            title={numeric ? 'Arithmetic: +, -, *, /, %, parentheses, dice, Function name(args…), call("Function name", args…), get("Global Stat"), {{Name}} (function first, then global Stat). References: function:<id>, globalStat:<id>.' : 'Use Function name(args…) or {{Function name}} for text functions. References: function:<id>, globalStat:<id>.'}
            onChange={event => { setDraft(event.target.value); setError(''); }}
            onSelect={event => {
                selection.current = { start: event.currentTarget.selectionStart ?? draft.length, end: event.currentTarget.selectionEnd ?? draft.length };
            }}
            onBlur={commit}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        {error && <span role="alert" style={{ color: 'var(--agenda-text-primary)', fontSize: 12 }}>{error}</span>}
    </div>;
    // Numeric values render as a picker button; its pop-up holds the formula blank and a source search.
    if (numeric && stage) {
        return <SearchableOptionPicker
            options={[]}
            functionType="number"
            stage={stage}
            title="Edit formula value"
            buttonAriaLabel="Edit formula value"
            renderButton={() => <span style={{ overflowWrap: 'anywhere' }}>{String(value ?? '') || 'Enter value'}</span>}
            valueEditor={editor}
            closeOnSelect={false}
            onChange={next => {
                if (typeof next !== 'string') return;
                // References inside macros retain ids and typed function arguments.
                const macro = `{{${JSON.stringify(next)}}}`;
                const range = selection.current ?? { start: draft.length, end: draft.length };
                const wrapReference = isValueReference(draft) && !(range.start === 0 && range.end === draft.length);
                const updated = wrapReference
                    ? `{{${JSON.stringify(draft)}}}${macro}`
                    : draft.slice(0, range.start) + macro + draft.slice(range.end);
                setDraft(updated);
                const caret = wrapReference ? updated.length : range.start + macro.length;
                selection.current = { start: caret, end: caret };
                setError('');
            }}
        />;
    }
    return editor;
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
