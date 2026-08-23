import { FC, ReactNode, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DoNotDisturb } from '@mui/icons-material';

const MAX_SELECTED_PREVIEW = 6;

export type PickerOption = {
    key: string;
    label: string;
    category?: string;
    icon?: any;
    imageUrl?: string;
    description?: string;
    renderAvatar?: (size: number, active: boolean) => ReactNode;
};

export interface SearchableOptionPickerProps {
    value?: string;
    values?: string[];
    multiple?: boolean;
    onChange: (value: string | string[] | undefined) => void;
    options: PickerOption[];
    allowClear?: boolean;
    placeholder?: string;
    defaultOptionKeys?: string[];
    emptyLabel?: string;
    title?: string;
    renderButton?: (selectedValue: string | string[] | undefined) => ReactNode;
}

export const SearchableOptionPicker: FC<SearchableOptionPickerProps> = ({
    value,
    values,
    multiple = false,
    onChange,
    options,
    allowClear = false,
    placeholder = 'Search',
    defaultOptionKeys = [],
    emptyLabel = 'None',
    title = 'Choose option',
    renderButton,
}) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const optionGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: '8px' };

    const orderedOptions = useMemo(() => {
        const allOptions = [...options];
        const preferred = defaultOptionKeys.length > 0
            ? [...allOptions].sort((a, b) => {
                const aIndex = defaultOptionKeys.indexOf(a.key);
                const bIndex = defaultOptionKeys.indexOf(b.key);
                if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label);
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            })
            : allOptions;
        const query = search.trim().toLowerCase();
        if (!query) {
            return preferred;
        }
        return preferred.filter((option) => {
            const haystack = `${option.label} ${option.category || ''} ${option.description || ''} ${option.key}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [defaultOptionKeys, options, search]);

    const optionSections = useMemo(() => {
        const shouldGroup = orderedOptions.some((option) => option.category?.trim());
        if (!shouldGroup) {
            return [{ key: 'all-options', label: '', options: orderedOptions }];
        }

        const sections: Array<{ key: string; label: string; options: PickerOption[] }> = [];
        const sectionByLabel = new Map<string, PickerOption[]>();
        orderedOptions.forEach((option) => {
            const label = option.category?.trim() || 'Uncategorized';
            const key = label.toLowerCase();
            if (!sectionByLabel.has(key)) {
                const sectionOptions: PickerOption[] = [];
                sectionByLabel.set(key, sectionOptions);
                sections.push({ key, label, options: sectionOptions });
            }
            sectionByLabel.get(key)?.push(option);
        });
        return sections;
    }, [orderedOptions]);

    const selectedValues = multiple ? (values ?? []) : (value ? [value] : []);
    const selectedValue = value ?? (allowClear ? undefined : defaultOptionKeys[0] || options[0]?.key);
    const selectedOption = options.find((option) => option.key === selectedValue);

    const renderOptionAvatar = (option: PickerOption, active: boolean, size: number = 30) => {
        if (option.renderAvatar) {
            return option.renderAvatar(size, active);
        }

        if (option.imageUrl) {
            return (
                <img
                    src={option.imageUrl}
                    alt={option.label}
                    style={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: active ? '2px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                        background: 'var(--agenda-surface-base)',
                        display: 'block',
                        flexShrink: 0,
                    }}
                />
            );
        }

        if (option.icon) {
            const Icon = option.icon;
            return <Icon style={{ fontSize: size, color: active ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)', flexShrink: 0 }} />;
        }

        return <span style={{ fontSize: Math.max(12, size * 0.6), fontWeight: 700, color: active ? 'var(--agenda-highlight)' : 'var(--agenda-text-primary)', flexShrink: 0 }}>{option.label.slice(0, 2).toUpperCase()}</span>;
    };

    const handleSelect = (nextValue?: string) => {
        if (multiple) {
            const nextSelection = [...(values ?? [])];
            if (!nextValue) {
                onChange([]);
                return;
            }

            if (nextSelection.includes(nextValue)) {
                onChange(nextSelection.filter((item) => item !== nextValue));
                return;
            }

            onChange([...nextSelection, nextValue]);
            return;
        }

        onChange(nextValue);
        setIsOpen(false);
    };

    const renderClearOption = () => (
        <button
            key="picker-clear"
            type="button"
            onClick={() => handleSelect(undefined)}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: multiple ? (selectedValues.length === 0 ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)') : (selectedValue === undefined ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)'),
                border: multiple ? (selectedValues.length === 0 ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)') : (selectedValue === undefined ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)'),
                borderRadius: '8px',
                color: 'var(--agenda-text-primary)',
                cursor: 'pointer',
                padding: '10px 8px',
                minHeight: '88px',
                fontSize: '11px',
                lineHeight: 1.2,
                whiteSpace: 'normal',
                textAlign: 'center',
                overflowWrap: 'anywhere',
            }}
        >
            <DoNotDisturb style={{ fontSize: 24, color: multiple ? (selectedValues.length === 0 ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)') : (selectedValue === undefined ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)') }} />
            <span>{emptyLabel}</span>
        </button>
    );

    const renderOptionButton = (option: PickerOption) => {
        const active = multiple ? selectedValues.includes(option.key) : selectedValue === option.key;
        return (
            <button
                key={`picker-option-${option.key}`}
                type="button"
                onClick={() => handleSelect(option.key)}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: active ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)',
                    border: active ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                    borderRadius: '8px',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    padding: '10px 8px',
                    minHeight: '88px',
                    fontSize: '11px',
                    lineHeight: 1.2,
                    whiteSpace: 'normal',
                    textAlign: 'center',
                    overflowWrap: 'anywhere',
                }}
            >
                {renderOptionAvatar(option, active, 30)}
                <span style={{ maxWidth: '100%' }}>{option.label}</span>
            </button>
        );
    };

    const pickerContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
                type="text"
                className="input-base"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={placeholder}
                autoFocus
            />
            <div style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {allowClear && (
                    <div style={optionGridStyle}>{renderClearOption()}</div>
                )}
                {optionSections.map((section) => (
                    <div key={`picker-section-${section.key}`} style={{ display: 'grid', gap: 6 }}>
                        {section.label && <div style={{ color: 'var(--agenda-text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{section.label}</div>}
                        <div style={optionGridStyle}>{section.options.map(renderOptionButton)}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const selectedOptions = selectedValues
        .map((key) => options.find((option) => option.key === key))
        .filter((option): option is PickerOption => Boolean(option));
    const visibleSelectedOptions = selectedOptions.slice(0, MAX_SELECTED_PREVIEW);
    const overflowSelectedCount = selectedOptions.length - visibleSelectedOptions.length;

    const buttonContent = renderButton
        ? renderButton(multiple ? selectedValues : value)
        : multiple
            ? (selectedOptions.length > 0
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                        {visibleSelectedOptions.map((option, index) => (
                            <span key={`picker-selected-${option.key}`} style={{ display: 'inline-flex', marginLeft: index === 0 ? 0 : -8, flexShrink: 0 }}>
                                {renderOptionAvatar(option, false, 22)}
                            </span>
                        ))}
                    </span>
                    {selectedOptions.length === 1 && (
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{selectedOptions[0].label}</span>
                    )}
                    {overflowSelectedCount > 0 && (
                        <span style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>+{overflowSelectedCount}</span>
                    )}
                </span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: '12px', color: 'var(--agenda-text-muted)' }}><DoNotDisturb style={{ fontSize: 18 }} />{emptyLabel}</span>)
            : selectedOption
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                    {renderOptionAvatar(selectedOption, false, 22)}
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{selectedOption.label}</span>
                </span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: '12px', color: 'var(--agenda-text-muted)' }}><DoNotDisturb style={{ fontSize: 18 }} />{emptyLabel}</span>;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: '52px',
                    minHeight: '38px',
                    border: '1px solid var(--agenda-line-subtle)',
                    borderRadius: '8px',
                    background: 'var(--agenda-surface-raised)',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    padding: '6px 10px',
                    overflow: 'hidden',
                }}
                aria-label={multiple
                    ? (selectedOptions.length > 0 ? `Selected options: ${selectedOptions.map((option) => option.label).join(', ')}` : title)
                    : (selectedOption ? `Selected option: ${selectedOption.label}` : title)}
                title={multiple ? selectedOptions.map((option) => option.label).join(', ') || undefined : selectedOption?.label}
            >
                {buttonContent}
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--agenda-surface-base) 72%, transparent)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 2000 }} onClick={() => setIsOpen(false)}>
                    <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(560px, 100%)', background: 'linear-gradient(135deg, var(--agenda-panel-surface) 0%, color-mix(in srgb, var(--agenda-surface-base) 92%, var(--agenda-panel-surface)) 100%)', border: '1px solid var(--agenda-panel-border)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--agenda-shadow)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>{title}</div>
                            <button type="button" onClick={() => setIsOpen(false)} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: '8px', background: 'var(--agenda-surface-raised)', color: 'var(--agenda-text-primary)', cursor: 'pointer', padding: '6px 10px' }}>Close</button>
                        </div>
                        {pickerContent}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};