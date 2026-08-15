import React, { FC, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Add, Close, KeyboardArrowDownRounded, KeyboardArrowUpRounded, Visibility, VisibilityOff } from '@mui/icons-material';
import { Chip } from '@mui/material';
import { Stage } from '../Stage';
import { createLoreEntry, Lore } from '../content/Lore';
import { Button, ConfirmDialog, TextArea, TextInput } from '../components/UiComponents';
import { findBestNameMatch, getLinkedActorLore, updateActorLore } from '../content/Actor';
import { getLinkedLocationLore, updateLocationDescription } from '../content/Location';
import { CategorizedEntrySection, CategorizedEntrySidebar, useCachedSidebarCollapseState } from '../components/CategorizedEntrySidebar';
import { ConditionEditor } from '../components/ConditionEditor';


interface LorebookManagementPanelProps {
    stage: () => Stage;
}

type LoreCategory = Lore['type'];

const CORE_CATEGORY_ORDER = ['character', 'location', 'world', 'other'] as const;
const CORE_CATEGORY_SET = new Set<string>(CORE_CATEGORY_ORDER);

const CATEGORY_LABELS: Record<(typeof CORE_CATEGORY_ORDER)[number], string> = {
    character: 'Character',
    location: 'Location',
    world: 'World',
    other: 'Other',
};

const getCategoryLabel = (category: string) => {
    return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
};

const sortLoreEntries = (entries: Lore[]) => {
    return [...entries].sort((a, b) => {
        if (a.insertionOrder !== b.insertionOrder) {
            return a.insertionOrder - b.insertionOrder;
        }
        return a.title.localeCompare(b.title);
    });
};

const parseTriggers = (value: string) => {
    return value
        .split(/\r?\n|,/)
        .map((trigger) => trigger.trim())
        .filter((trigger) => trigger.length > 0);
};

const asNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

interface NumberStepperInputProps {
    value: number;
    onChange: (value: number) => void;
    ariaLabel: string;
}

const NumberStepperInput: FC<NumberStepperInputProps> = ({ value, onChange, ariaLabel }) => {
    return (
        <div className="number-stepper-shell">
            <TextInput
                type="number"
                step="any"
                value={String(value)}
                onChange={(event) => onChange(asNumber(event.target.value, value))}
                className="number-stepper-input"
                fullWidth
                aria-label={ariaLabel}
            />
            <div className="number-stepper-buttons" aria-hidden="true">
                <button
                    type="button"
                    className="number-stepper-button"
                    onClick={() => onChange(value + 1)}
                    tabIndex={-1}
                >
                    <KeyboardArrowUpRounded fontSize="small" />
                </button>
                <button
                    type="button"
                    className="number-stepper-button"
                    onClick={() => onChange(value - 1)}
                    tabIndex={-1}
                >
                    <KeyboardArrowDownRounded fontSize="small" />
                </button>
            </div>
        </div>
    );
};

export const LorebookManagementPanel: FC<LorebookManagementPanelProps> = ({ stage }) => {
    const shouldReduceMotion = useReducedMotion();
    const save = stage().getSave();
    const activeActors = useMemo(() => Object.values(save.actors || {}).filter((actor) => actor.active !== false), [save]);
    const activeLocations = useMemo(() => Object.values(save.atlas || {}).filter((location) => location.active !== false), [save]);
    const actorLoreIdToCategory = useMemo(() => {
        const map = new Map<string, string>();
        for (const actor of activeActors) {
            if (actor.loreId) {
                map.set(actor.loreId, actor.category?.trim() || 'Other');
            }
        }
        return map;
    }, [activeActors]);
    const locationLoreIds = useMemo(() => new Set(
        activeLocations
            .filter((location) => location.loreId)
            .map((location) => location.loreId),
    ), [activeLocations]);
    const [loreEntries, setLoreEntries] = useState<Lore[]>(() => sortLoreEntries(save.lorebook || []));
    const [selectedLoreId, setSelectedLoreId] = useState<string | null>(() => {
        const initialEntries = sortLoreEntries(save.lorebook || []);
        return initialEntries[0]?.id || null;
    });
    const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | 'new' | null>(null);
    const [editingTriggerValue, setEditingTriggerValue] = useState('');
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [collapsedCategories, setCollapsedCategories] = useCachedSidebarCollapseState('lorebook-management');
    const [collapsedCharacterCategories, setCollapsedCharacterCategories] = useCachedSidebarCollapseState('lorebook-character-categories');

    const categoryOrder = useMemo(() => {
        // Add a category for each Actor name not present in the groups, to allow users to assign lore entries to them
        const playerId = save.playerId;
        const extraCategories = activeActors
            .filter(actor => actor.id !== playerId)
            .map((actor) => actor.name.trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));

        return [...CORE_CATEGORY_ORDER, ...extraCategories];
    }, [activeActors, save.playerId]);

    const loreSections = useMemo<CategorizedEntrySection<Lore>[]>(() => {
        const groups: Record<string, Lore[]> = {};

        for (const category of categoryOrder) {
            groups[category] = [];
        }

        for (const entry of loreEntries) {
            const category = (entry.type || 'other').trim() || 'other';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(entry);
        }

        return categoryOrder.map((category) => {
            const entries = sortLoreEntries(groups[category] || []);
            if (category !== 'character' || entries.length === 0) {
                return {
                    id: category,
                    title: getCategoryLabel(category),
                    entries,
                };
            }

            const characterGroups = new Map<string, Lore[]>();
            for (const entry of entries) {
                const actorCategory = actorLoreIdToCategory.get(entry.id)?.trim() || 'Other';
                characterGroups.set(actorCategory, [...(characterGroups.get(actorCategory) || []), entry]);
            }

            const characterCategories = [...characterGroups.keys()].sort((left, right) => {
                if (left === 'Other') return 1;
                if (right === 'Other') return -1;
                return left.localeCompare(right);
            });

            return {
                id: category,
                title: getCategoryLabel(category),
                entries,
                subsections: characterCategories.map((actorCategory) => ({
                    id: `character:${actorCategory}`,
                    title: actorCategory,
                    entries: sortLoreEntries(characterGroups.get(actorCategory) || []),
                })),
            };
        });
    }, [loreEntries, categoryOrder, actorLoreIdToCategory]);

    const selectedLore = useMemo(() => loreEntries.find((entry) => entry.id === selectedLoreId) || null, [loreEntries, selectedLoreId]);

    const selectedLoreMatchesExistingActor = useMemo(() => {
        if (!selectedLore || selectedLore.type !== 'character') {
            return false;
        }

        const normalizedTitle = selectedLore.title.trim().toLowerCase();
        if (!normalizedTitle) {
            return false;
        }

        return !!findBestNameMatch(
            normalizedTitle,
            activeActors,
            ['name'],
        );
    }, [selectedLore, activeActors]);

    const selectedLoreMatchesExistingLocation = useMemo(() => {
        if (!selectedLore || selectedLore.type !== 'location') {
            return false;
        }

        return locationLoreIds.has(selectedLore.id);
    }, [selectedLore, locationLoreIds]);

    const applyLorebookChange = (updater: (entries: Lore[]) => Lore[]) => {
        setLoreEntries((currentEntries) => {
            const nextEntries = sortLoreEntries(updater(currentEntries));
            const save = stage().getSave();
            save.lorebook = nextEntries;
            return nextEntries;
        });
    };

    const getNextInsertionOrder = () => {
        if (loreEntries.length === 0) {
            return 0;
        }
        return Math.max(...loreEntries.map((entry) => entry.insertionOrder)) + 1;
    };

    const createNewLoreEntry = (type: LoreCategory) => {
        const newEntry = createLoreEntry({
            type,
            insertionOrder: getNextInsertionOrder(),
        });

        applyLorebookChange((entries) => [...entries, newEntry]);
        setSelectedLoreId(newEntry.id);
        setCollapsedCategories((current) => ({
            ...current,
            [type]: false,
        }));
    };

    const cloneSelectedLore = () => {
        if (!selectedLore) {
            return;
        }

        const clonedEntry = createLoreEntry({
            ...selectedLore,
            title: `${selectedLore.title} (Copy)`,
            triggers: [...selectedLore.triggers],
        });

        applyLorebookChange((entries) => [...entries, clonedEntry]);
    };

    const deleteSelectedLore = () => {
        if (!selectedLore) {
            return;
        }

        setIsDeleteConfirmOpen(true);
    };

    const confirmDeleteSelectedLore = () => {
        if (!selectedLore) {
            return;
        }

        const deletedIndex = loreEntries.findIndex((entry) => entry.id === selectedLore.id);
        const remainingEntries = loreEntries.filter((entry) => entry.id !== selectedLore.id);

        applyLorebookChange(() => remainingEntries);
        setIsDeleteConfirmOpen(false);

        if (remainingEntries.length === 0) {
            setSelectedLoreId(null);
            return;
        }

        const nextIndex = Math.min(Math.max(deletedIndex, 0), remainingEntries.length - 1);
        setSelectedLoreId(remainingEntries[nextIndex].id);
    };

    const updateSelectedLore = (patch: Partial<Lore>) => {
        if (!selectedLoreId) {
            return;
        }

        applyLorebookChange((entries) => entries.map((entry) => (
            entry.id === selectedLoreId ? { ...entry, ...patch } : entry
        )));
    };

    const getLinkedActorByLoreId = (loreId: string) => {
        return Object.values(stage().getSave().actors || {}).find((actor) => {
            if (actor.active === false) {
                return false;
            }
            const linkedLore = getLinkedActorLore(actor, stage());
            return linkedLore?.id === loreId;
        }) || null;
    };

    const getLinkedLocationByLoreId = (loreId: string) => {
        return Object.values(stage().getSave().atlas || {}).find((location) => {
            if (location.active === false) {
                return false;
            }
            const linkedLore = getLinkedLocationLore(location, stage());
            return linkedLore?.id === loreId;
        }) || null;
    };

    const updateSelectedLoreTitle = (title: string) => {
        if (!selectedLoreId || !selectedLore) {
            return;
        }

        if (selectedLore.type === 'character') {
            const linkedActor = getLinkedActorByLoreId(selectedLore.id);
            console.log('Updating linked actor name for lore entry:', selectedLore.id, 'to', title);
            if (linkedActor) {
                console.log('Found linked actor:', linkedActor.id, linkedActor.name);
                linkedActor.name = title;
            }
        }

        if (selectedLore.type === 'location') {
            const linkedLocation = getLinkedLocationByLoreId(selectedLore.id);
            if (linkedLocation) {
                linkedLocation.name = title;
            }
        }

        updateSelectedLore({ title });
    };

    const updateSelectedLoreContent = (content: string) => {
        if (!selectedLore) {
            return;
        }

        if (selectedLore.type === 'character') {
            const linkedActor = getLinkedActorByLoreId(selectedLore.id);

            if (linkedActor) {
                updateActorLore(linkedActor.id, content, stage());
                setLoreEntries(sortLoreEntries([...(stage().getSave().lorebook || [])]));
                return;
            }
        }

        if (selectedLore.type === 'location') {
            const linkedLocation = getLinkedLocationByLoreId(selectedLore.id);

            if (linkedLocation) {
                updateLocationDescription(linkedLocation.id, content, stage());
                setLoreEntries(sortLoreEntries([...(stage().getSave().lorebook || [])]));
                return;
            }
        }

        updateSelectedLore({ content });
    };

    const toggleLoreEnabled = (loreId: string) => {
        applyLorebookChange((entries) => entries.map((entry) => (
            entry.id === loreId ? { ...entry, enabled: !entry.enabled } : entry
        )));
    };

    const cancelTriggerEdit = () => {
        setEditingTriggerIndex(null);
        setEditingTriggerValue('');
    };

    const commitTriggerEdit = () => {
        if (!selectedLore || editingTriggerIndex === null) {
            return;
        }

        const nextValues = parseTriggers(editingTriggerValue);

        if (editingTriggerIndex === 'new') {
            if (nextValues.length > 0) {
                updateSelectedLore({ triggers: [...selectedLore.triggers, ...nextValues] });
            }
            cancelTriggerEdit();
            return;
        }

        const nextTriggers = [...selectedLore.triggers];
        nextTriggers.splice(editingTriggerIndex, 1, ...nextValues);
        updateSelectedLore({ triggers: nextTriggers });
        cancelTriggerEdit();
    };

    useEffect(() => {
        cancelTriggerEdit();
    }, [selectedLoreId]);

    useEffect(() => {
        if (selectedLore?.constant && editingTriggerIndex !== null) {
            cancelTriggerEdit();
        }
    }, [selectedLore?.constant, editingTriggerIndex]);

    useEffect(() => {
        setIsDeleteConfirmOpen(false);
    }, [selectedLoreId]);

    return (
        <>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(280px, 360px) 1fr',
                    gap: '20px',
                    flex: 1,
                    minHeight: 0,
                }}
            >
                <CategorizedEntrySidebar
                    sections={loreSections}
                    collapsedSections={collapsedCategories}
                    onToggleSection={(sectionId) => {
                        setCollapsedCategories((current) => ({
                            ...current,
                            [sectionId]: !(current[sectionId] ?? true),
                        }));
                    }}
                    collapsedSubsections={collapsedCharacterCategories}
                    onToggleSubsection={(subsectionId) => {
                        setCollapsedCharacterCategories((current) => ({
                            ...current,
                            [subsectionId]: !(current[subsectionId] ?? false),
                        }));
                    }}
                    renderEntry={(entry) => {
                        const isSelected = selectedLoreId === entry.id;
                        return (
                            <motion.div
                                whileHover={{ scale: 1.01 }}
                                style={{
                                    background: isSelected
                                        ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                                        : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                                    border: `1px solid ${isSelected ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                                    borderRadius: '8px',
                                    padding: '8px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    color: 'var(--agenda-text-primary)',
                                    opacity: entry.enabled ? 1 : (isSelected ? 0.75 : 0.55),
                                }}
                            >
                                <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => toggleLoreEnabled(entry.id)}
                                    aria-label={entry.enabled ? 'Disable lore entry' : 'Enable lore entry'}
                                    title={entry.enabled ? 'Disable entry' : 'Enable entry'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'transparent',
                                        border: 'none',
                                        color: entry.enabled ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)',
                                        cursor: 'pointer',
                                        padding: 0,
                                        flexShrink: 0,
                                    }}
                                >
                                    {entry.enabled ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                                </motion.button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedLoreId(entry.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--agenda-text-primary)',
                                        padding: 0,
                                        flex: 1,
                                        alignSelf: 'stretch',
                                        fontWeight: 600,
                                    }}
                                >
                                    {entry.title || '(Untitled)'}
                                </button>
                            </motion.div>
                        );
                    }}
                    getEntryKey={(entry) => entry.id}
                    shouldReduceMotion={Boolean(shouldReduceMotion)}
                    emptyListMessage="No lore entries found."
                    defaultCollapsed
                    sectionEmptyMessage="No entries"
                    shouldHideSection={(section) => !CORE_CATEGORY_SET.has(section.id) && section.entries.length === 0}
                    renderSectionAction={(section) => {
                        createNewLoreEntry(section.id as LoreCategory);
                    }}
                />

                            <div
                                style={{
                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
                                    border: '1px solid var(--agenda-line-subtle)',
                                    borderRadius: '12px',
                                    padding: '18px',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minHeight: 0,
                                }}
                            >
                                {!selectedLore ? (
                                    <div
                                        style={{
                                            color: 'var(--agenda-text-muted)',
                                            fontSize: '15px',
                                            textAlign: 'center',
                                            padding: '30px',
                                        }}
                                    >
                                        Select a lore entry to view and edit details.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%', minHeight: 0 }}>
                                        {selectedLoreMatchesExistingActor && (
                                            <div
                                                style={{
                                                    color: 'var(--agenda-text-primary)',
                                                    background: 'color-mix(in srgb, var(--agenda-highlight) 14%, transparent)',
                                                    border: '1px solid var(--agenda-line-strong)',
                                                    borderRadius: '10px',
                                                    padding: '10px 12px',
                                                    fontSize: '13px',
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                This entry is providing the lore for a matching character.
                                            </div>
                                        )}

                                        {selectedLoreMatchesExistingLocation && (
                                            <div
                                                style={{
                                                    color: 'var(--agenda-text-primary)',
                                                    background: 'color-mix(in srgb, var(--agenda-accent-primary) 14%, transparent)',
                                                    border: '1px solid color-mix(in srgb, var(--agenda-accent-primary) 42%, transparent)',
                                                    borderRadius: '10px',
                                                    padding: '10px 12px',
                                                    fontSize: '13px',
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                This entry is providing the description for a matching location.
                                            </div>
                                        )}

                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Title</label>
                                            <TextInput
                                                value={selectedLore.title}
                                                onChange={(event) => updateSelectedLoreTitle(event.target.value)}
                                                fullWidth
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Category</label>
                                            <select
                                                value={selectedLore.type}
                                                onChange={(event) => updateSelectedLore({ type: event.target.value as LoreCategory })}
                                                className="input-base"
                                                style={{ width: '100%' }}
                                            >
                                                {categoryOrder.map((category) => (
                                                    <option key={category} value={category}>{getCategoryLabel(category)}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Availability</label>
                                            <ConditionEditor
                                                conditionCollections={selectedLore.conditionCollections || []}
                                                playerStats={stage().getConfiguration().playerStats || []}
                                                onChange={(conditionCollections) => updateSelectedLore({ conditionCollections })}
                                            />
                                        </div>

                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                                                gap: '10px',
                                            }}
                                        >
                                            <div style={{ display: 'grid', gap: '6px' }}>
                                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Order</label>
                                                <NumberStepperInput
                                                    value={selectedLore.insertionOrder}
                                                    onChange={(value) => updateSelectedLore({ insertionOrder: value })}
                                                    ariaLabel="Lore insertion order"
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gap: '6px' }}>
                                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Priority</label>
                                                <NumberStepperInput
                                                    value={selectedLore.priority}
                                                    onChange={(value) => updateSelectedLore({ priority: value })}
                                                    ariaLabel="Lore priority"
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gap: '6px' }}>
                                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Probability</label>
                                                <NumberStepperInput
                                                    value={selectedLore.probability}
                                                    onChange={(value) => updateSelectedLore({ probability: value })}
                                                    ariaLabel="Lore probability"
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gap: '6px' }}>
                                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Scan Depth</label>
                                                <NumberStepperInput
                                                    value={selectedLore.scanDepth}
                                                    onChange={(value) => updateSelectedLore({ scanDepth: value })}
                                                    ariaLabel="Lore scan depth"
                                                />
                                            </div>
                                        </div>

                                        <label
                                            style={{
                                                color: 'var(--agenda-text-muted)',
                                                fontSize: '13px',
                                                display: 'flex',
                                                gap: '8px',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedLore.updatable ?? true}
                                                onChange={(event) => updateSelectedLore({ updatable: event.target.checked })}
                                            />
                                            Generatively Maintained
                                        </label>

                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '12px',
                                                }}
                                            >
                                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Triggers</label>
                                                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLore.constant}
                                                        onChange={(event) => updateSelectedLore({ constant: event.target.checked })}
                                                    />
                                                    Constant
                                                </label>
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: '8px',
                                                    padding: '8px',
                                                    borderRadius: '10px',
                                                    border: '1px solid var(--agenda-line-subtle)',
                                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)',
                                                    minHeight: '44px',
                                                    alignItems: 'center',
                                                    opacity: selectedLore.constant ? 0.5 : 1,
                                                    pointerEvents: selectedLore.constant ? 'none' : 'auto',
                                                }}
                                            >
                                                {selectedLore.triggers.map((trigger, index) => {
                                                    if (editingTriggerIndex === index) {
                                                        return (
                                                            <input
                                                                key={`editing-${index}`}
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
                                                                className="input-base"
                                                                style={{ width: '160px', height: '34px' }}
                                                            />
                                                        );
                                                    }

                                                    return (
                                                        <Chip
                                                            key={`${trigger}-${index}`}
                                                            label={trigger}
                                                            disabled={selectedLore.constant}
                                                            onClick={() => {
                                                                setEditingTriggerIndex(index);
                                                                setEditingTriggerValue(trigger);
                                                            }}
                                                            onDelete={() => {
                                                                const nextTriggers = selectedLore.triggers.filter((_, triggerIndex) => triggerIndex !== index);
                                                                updateSelectedLore({ triggers: nextTriggers });
                                                            }}
                                                            size="small"
                                                            sx={{
                                                                color: 'rgba(224, 240, 255, 0.95)',
                                                                backgroundColor: 'rgba(0, 255, 136, 0.16)',
                                                                border: '1px solid rgba(0, 255, 136, 0.35)',
                                                                '.MuiChip-deleteIcon': {
                                                                    color: 'rgba(224, 240, 255, 0.7)',
                                                                    '&:hover': {
                                                                        color: 'rgba(224, 240, 255, 1)',
                                                                    },
                                                                },
                                                            }}
                                                        />
                                                    );
                                                })}

                                                {editingTriggerIndex === 'new' ? (
                                                    <input
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
                                                        placeholder="new trigger"
                                                        className="input-base"
                                                        style={{ width: '160px', height: '34px' }}
                                                    />
                                                ) : (
                                                    <Chip
                                                        icon={<Add />}
                                                        label="Add trigger"
                                                        variant="outlined"
                                                        disabled={selectedLore.constant}
                                                        onClick={() => {
                                                            setEditingTriggerIndex('new');
                                                            setEditingTriggerValue('');
                                                        }}
                                                        size="small"
                                                        sx={{
                                                            color: 'rgba(224, 240, 255, 0.85)',
                                                            borderColor: 'rgba(0, 255, 136, 0.35)',
                                                            backgroundColor: 'rgba(0, 255, 136, 0.08)',
                                                            '& .MuiChip-icon': {
                                                                color: 'rgba(224, 240, 255, 0.8)',
                                                            },
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
                                            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>Content</label>
                                            <TextArea
                                                value={selectedLore.content}
                                                onChange={(event) => updateSelectedLoreContent(event.target.value)}
                                                style={{ width: '100%', flex: 1, minHeight: 0, resize: 'none', overflowY: 'auto' }}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                            <Button variant="secondary" onClick={cloneSelectedLore}>Clone</Button>
                                            <Button variant="danger" onClick={deleteSelectedLore}>Delete</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
            </div>
            <ConfirmDialog
                isOpen={isDeleteConfirmOpen && selectedLore !== null}
                title={selectedLore ? `Delete ${selectedLore.title || '(Untitled)'}?` : 'Delete lore entry?'}
                message="This will permanently remove the selected lore entry. This cannot be undone."
                confirmText="Delete"
                confirmVariant="danger"
                cancelText="Cancel"
                onConfirm={confirmDeleteSelectedLore}
                onCancel={() => setIsDeleteConfirmOpen(false)}
            />
        </>
    );
};
