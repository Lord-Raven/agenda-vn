import { FC, useEffect, useState } from 'react';
import { Add, KeyboardArrowDownRounded, KeyboardArrowUpRounded } from '@mui/icons-material';
import { Chip } from '@mui/material';
import { Stage } from '../Stage';
import { Lore } from '../content/Lore';
import { Button, TextArea, TextInput } from '../components/UiComponents';
import { ConditionEditor } from '../components/ConditionEditor';

interface LorebookDetailPanelProps {
    lore: Lore;
    stage: () => Stage;
    isCreatorMode: boolean;
    categories: { value: string; label: string }[];
    matchesExistingActor: boolean;
    matchesExistingLocation: boolean;
    onChange: (patch: Partial<Lore>) => void;
    onTitleChange: (title: string) => void;
    onClone: () => void;
    onDelete: () => void;
}

const parseTriggers = (value: string) => value
    .split(/\r?\n|,/)
    .map((trigger) => trigger.trim())
    .filter((trigger) => trigger.length > 0);

const asNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

interface NumberStepperInputProps {
    value: number;
    onChange: (value: number) => void;
    ariaLabel: string;
    disabled?: boolean;
}

const NumberStepperInput: FC<NumberStepperInputProps> = ({ value, onChange, ariaLabel, disabled }) => (
    <div className="number-stepper-shell">
        <TextInput
            type="number"
            step="any"
            value={String(value)}
            onChange={(event) => onChange(asNumber(event.target.value, value))}
            disabled={disabled}
            className="number-stepper-input"
            fullWidth
            aria-label={ariaLabel}
        />
        <div className="number-stepper-buttons" aria-hidden="true">
            <button
                type="button"
                className="number-stepper-button"
                onClick={() => onChange(value + 1)}
                disabled={disabled}
                tabIndex={-1}
            >
                <KeyboardArrowUpRounded fontSize="small" />
            </button>
            <button
                type="button"
                className="number-stepper-button"
                onClick={() => onChange(value - 1)}
                disabled={disabled}
                tabIndex={-1}
            >
                <KeyboardArrowDownRounded fontSize="small" />
            </button>
        </div>
    </div>
);

export const LorebookDetailPanel: FC<LorebookDetailPanelProps> = ({
    lore,
    stage,
    isCreatorMode,
    categories,
    matchesExistingActor,
    matchesExistingLocation,
    onChange,
    onTitleChange,
    onClone,
    onDelete,
}) => {
    const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | 'new' | null>(null);
    const [editingTriggerValue, setEditingTriggerValue] = useState('');

    const cancelTriggerEdit = () => {
        setEditingTriggerIndex(null);
        setEditingTriggerValue('');
    };

    const commitTriggerEdit = () => {
        if (editingTriggerIndex === null) {
            return;
        }

        const nextValues = parseTriggers(editingTriggerValue);
        if (editingTriggerIndex === 'new') {
            if (nextValues.length > 0) {
                onChange({ triggers: [...lore.triggers, ...nextValues] });
            }
        } else {
            const nextTriggers = [...lore.triggers];
            nextTriggers.splice(editingTriggerIndex, 1, ...nextValues);
            onChange({ triggers: Array.from(new Set(nextTriggers)) });
        }
        cancelTriggerEdit();
    };

    useEffect(() => {
        cancelTriggerEdit();
    }, [lore.id, lore.constant]);

    const renderTriggerInput = (key: string, placeholder?: string) => (
        <input
            key={key}
            value={editingTriggerValue}
            onChange={(event) => setEditingTriggerValue(event.target.value)}
            onBlur={commitTriggerEdit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commitTriggerEdit();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTriggerEdit();
                }
            }}
            autoFocus
            placeholder={placeholder}
            aria-label={placeholder ? 'New trigger' : 'Edit trigger'}
            className="input-base"
            style={{ width: '160px', maxWidth: '100%', minWidth: 0, height: '34px' }}
        />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px', minWidth: 0 }}>
            {matchesExistingActor && (
                <div style={{
                    color: 'var(--agenda-text-primary)',
                    background: 'color-mix(in srgb, var(--agenda-highlight) 14%, transparent)',
                    border: '1px solid var(--agenda-line-strong)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    lineHeight: 1.4,
                }}>
                    This entry is providing the lore for a matching character.
                </div>
            )}
            {matchesExistingLocation && (
                <div style={{
                    color: 'var(--agenda-text-primary)',
                    background: 'color-mix(in srgb, var(--agenda-accent-primary) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--agenda-accent-primary) 42%, transparent)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    lineHeight: 1.4,
                }}>
                    This entry is providing the description for a matching location.
                </div>
            )}
            <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Title</label>
                <TextInput value={lore.title} onChange={(event) => onTitleChange(event.target.value)} fullWidth />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Category</label>
                <select
                    value={lore.type}
                    onChange={(event) => onChange({ type: event.target.value })}
                    className="input-base"
                    style={{ width: '100%', minWidth: 0 }}
                >
                    {categories.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Availability</label>
                <ConditionEditor
                    conditionCollections={lore.conditionCollections || []}
                    globalStats={stage().getConfiguration().globalStats || []}
                    actors={Object.values(stage().getSave().actors || {})}
                    stage={stage}
                    onChange={(conditionCollections) => onChange({ conditionCollections })}
                />
            </div>
            <div style={{ display: 'grid', gap: '6px', opacity: lore.constant ? 0.5 : 1 }}>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Triggering Conditions</label>
                <div style={{ pointerEvents: lore.constant ? 'none' : 'auto' }}>
                    <ConditionEditor
                        conditionCollections={lore.triggerConditionCollections || []}
                        globalStats={stage().getConfiguration().globalStats || []}
                        actors={Object.values(stage().getSave().actors || {})}
                        stage={stage}
                        onChange={(triggerConditionCollections) => onChange({ triggerConditionCollections })}
                    />
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: '10px' }}>
                <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Order</label>
                    <NumberStepperInput value={lore.insertionOrder} onChange={(insertionOrder) => onChange({ insertionOrder })} ariaLabel="Lore insertion order" />
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Priority</label>
                    <NumberStepperInput value={lore.priority} onChange={(priority) => onChange({ priority })} ariaLabel="Lore priority" />
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Probability</label>
                    <NumberStepperInput value={lore.probability} onChange={(probability) => onChange({ probability })} ariaLabel="Lore probability" />
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Scan Depth</label>
                    <NumberStepperInput value={lore.scanDepth} onChange={(scanDepth) => onChange({ scanDepth })} disabled={lore.constant} ariaLabel="Lore scan depth" />
                </div>
            </div>
            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="checkbox" checked={lore.updatable ?? true} onChange={(event) => onChange({ updatable: event.target.checked })} />
                Generatively Maintained
            </label>
            <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Triggers</label>
                    <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="checkbox" checked={lore.constant} onChange={(event) => onChange({ constant: event.target.checked })} />
                        Constant
                    </label>
                </div>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    minWidth: 0,
                    gap: '8px',
                    padding: '8px',
                    borderRadius: '10px',
                    border: '1px solid var(--agenda-line-subtle)',
                    background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)',
                    minHeight: '44px',
                    alignItems: 'center',
                    opacity: lore.constant ? 0.5 : 1,
                    pointerEvents: lore.constant ? 'none' : 'auto',
                }}>
                    {lore.triggers.map((trigger, index) => editingTriggerIndex === index
                        ? renderTriggerInput(`editing-${index}`)
                        : (
                            <Chip
                                key={`${trigger}-${index}`}
                                label={trigger}
                                disabled={lore.constant}
                                onClick={() => {
                                    setEditingTriggerIndex(index);
                                    setEditingTriggerValue(trigger);
                                }}
                                onDelete={() => onChange({ triggers: lore.triggers.filter((_, triggerIndex) => triggerIndex !== index) })}
                                size="small"
                                sx={{
                                    maxWidth: '100%',
                                    color: 'rgba(224, 240, 255, 0.95)',
                                    backgroundColor: 'rgba(0, 255, 136, 0.16)',
                                    border: '1px solid rgba(0, 255, 136, 0.35)',
                                    '.MuiChip-deleteIcon': {
                                        color: 'rgba(224, 240, 255, 0.7)',
                                        '&:hover': { color: 'rgba(224, 240, 255, 1)' },
                                    },
                                }}
                            />
                        ))}
                    {editingTriggerIndex === 'new' ? renderTriggerInput('new', 'new trigger') : (
                        <Chip
                            icon={<Add />}
                            label="Add trigger"
                            variant="outlined"
                            disabled={lore.constant}
                            onClick={() => {
                                setEditingTriggerIndex('new');
                                setEditingTriggerValue('');
                            }}
                            size="small"
                            sx={{
                                maxWidth: '100%',
                                color: 'rgba(224, 240, 255, 0.85)',
                                borderColor: 'rgba(0, 255, 136, 0.35)',
                                backgroundColor: 'rgba(0, 255, 136, 0.08)',
                                '& .MuiChip-icon': { color: 'rgba(224, 240, 255, 0.8)' },
                            }}
                        />
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Content</label>
                <TextArea
                    value={lore.content}
                    onChange={(event) => onChange({ content: event.target.value })}
                    rows={10}
                    style={{ width: '100%', minHeight: '200px', resize: 'vertical' }}
                />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '10px' }}>
                {isCreatorMode && (
                    <Button variant="secondary" onClick={() => {
                        const applied = stage().applyConfigurationLoreToSave(lore.id);
                        stage().showPriorityMessage(applied
                            ? `${lore.title || 'Lore entry'} applied to the active save.`
                            : `${lore.title || 'Lore entry'} does not exist in the active save yet.`);
                    }}>
                        Apply
                    </Button>
                )}
                <Button variant="secondary" onClick={onClone}>Clone</Button>
                <Button variant="danger" onClick={onDelete}>Delete</Button>
            </div>
        </div>
    );
};
