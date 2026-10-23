import React, { FC, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Stage } from '../Stage';
import { createLoreEntry, Lore } from '../content/Lore';
import { ConfirmDialog } from '../components/UiComponents';
import { findBestNameMatch, getLinkedActorLore } from '../content/Actor';
import { getLinkedLocationLore } from '../content/Location';
import {
    CategorizedEntrySection,
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';
import { LorebookDetailPanel } from './LorebookDetailPanel';

interface LorebookManagementPanelProps {
    stage: () => Stage;
    isCreatorMode: boolean;
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

export const LorebookManagementPanel: FC<LorebookManagementPanelProps> = ({ stage, isCreatorMode }) => {
    const shouldReduceMotion = useReducedMotion();
    const save = stage().getSave();
    const activeActors = useMemo(() => (isCreatorMode ? stage().getConfiguration().actors || [] : Object.values(save.actors || {})).filter((actor) => actor.active !== false), [save, stage, isCreatorMode]);
    const activeLocations = useMemo(() => (isCreatorMode ? stage().getConfiguration().locations || [] : Object.values(save.atlas || {})).filter((location) => location.active !== false), [save, stage, isCreatorMode]);
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
    const locationLoreIdToCategory = useMemo(() => {
        const map = new Map<string, string>();
        for (const location of activeLocations) {
            if (location.loreId) {
                map.set(location.loreId, location.category?.trim() || 'Other');
            }
        }
        return map;
    }, [activeLocations]);
    const [loreEntries, setLoreEntries] = useState<Lore[]>(() => sortLoreEntries(isCreatorMode ? stage().getConfiguration().lorebook || [] : save.lorebook || []));
    const [selectedLoreId, setSelectedLoreId] = useState<string | null>(() => {
        const initialEntries = sortLoreEntries(isCreatorMode ? stage().getConfiguration().lorebook || [] : save.lorebook || []);
        return initialEntries[0]?.id || null;
    });
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [collapsedCategories, setCollapsedCategories] = useCachedSidebarCollapseState('lorebook-management');
    const [collapsedCharacterCategories, setCollapsedCharacterCategories] = useCachedSidebarCollapseState('lorebook-character-categories');
    const [collapsedLocationCategories, setCollapsedLocationCategories] = useCachedSidebarCollapseState('lorebook-location-categories');

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
            const secondaryLoreIdToCategory = category === 'character'
                ? actorLoreIdToCategory
                : category === 'location'
                    ? locationLoreIdToCategory
                    : null;

            if (!secondaryLoreIdToCategory || entries.length === 0) {
                return {
                    id: category,
                    title: getCategoryLabel(category),
                    entries,
                };
            }

            const secondaryGroups = new Map<string, Lore[]>();
            for (const entry of entries) {
                const secondaryCategory = secondaryLoreIdToCategory.get(entry.id)?.trim() || 'Other';
                secondaryGroups.set(secondaryCategory, [...(secondaryGroups.get(secondaryCategory) || []), entry]);
            }

            const secondaryCategories = [...secondaryGroups.keys()].sort((left, right) => {
                if (left === 'Other') return 1;
                if (right === 'Other') return -1;
                return left.localeCompare(right);
            });

            return {
                id: category,
                title: getCategoryLabel(category),
                entries,
                subsections: secondaryCategories.map((secondaryCategory) => ({
                    id: `${category}:${secondaryCategory}`,
                    title: secondaryCategory,
                    entries: sortLoreEntries(secondaryGroups.get(secondaryCategory) || []),
                })),
            };
        });
    }, [loreEntries, categoryOrder, actorLoreIdToCategory, locationLoreIdToCategory]);

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
            if (isCreatorMode) {
                stage().updateConfiguration({ lorebook: nextEntries });
            } else {
                stage().getSave().lorebook = nextEntries;
            }
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
        const actors = isCreatorMode ? stage().getConfiguration().actors || [] : Object.values(stage().getSave().actors || {});
        return actors.find((actor) => {
            if (actor.active === false) {
                return false;
            }
            const linkedLore = getLinkedActorLore(actor, stage(), isCreatorMode);
            return linkedLore?.id === loreId;
        }) || null;
    };

    const getLinkedLocationByLoreId = (loreId: string) => {
        const locations = isCreatorMode ? stage().getConfiguration().locations || [] : Object.values(stage().getSave().atlas || {});
        return locations.find((location) => {
            if (location.active === false) {
                return false;
            }
            const linkedLore = getLinkedLocationLore(location, stage(), isCreatorMode);
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
                // Persist actor changes back to configuration or save
                if (isCreatorMode) {
                    stage().updateConfiguration({ actors: stage().getConfiguration().actors || [] });
                } else {
                    stage().getSave().actors[linkedActor.id] = linkedActor;
                }
            }
        }

        if (selectedLore.type === 'location') {
            const linkedLocation = getLinkedLocationByLoreId(selectedLore.id);
            if (linkedLocation) {
                linkedLocation.name = title;
                // Persist location changes back to configuration or save
                if (isCreatorMode) {
                    stage().updateConfiguration({ locations: stage().getConfiguration().locations || [] });
                } else {
                    stage().getSave().atlas = stage().getSave().atlas || {};
                    stage().getSave().atlas[linkedLocation.id] = linkedLocation;
                }
            }
        }

        updateSelectedLore({ title });
    };

    const toggleLoreEnabled = (loreId: string) => {
        applyLorebookChange((entries) => entries.map((entry) => (
            entry.id === loreId ? { ...entry, enabled: !entry.enabled } : entry
        )));
    };

    useEffect(() => {
        setIsDeleteConfirmOpen(false);
    }, [selectedLoreId]);

    return (
        <>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
                    gap: '20px',
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    height: '100%',
                }}
            >
                <CategorizedEntrySidebar
                    sections={loreSections}
                    collapsedSections={collapsedCategories}
                    onToggleSection={(sectionId) => {
                        setCollapsedCategories((current) => toggleSidebarCollapseState(current, sectionId, true));
                    }}
                    collapsedSubsections={{ ...collapsedCharacterCategories, ...collapsedLocationCategories }}
                    onToggleSubsection={(subsectionId) => {
                        if (subsectionId.startsWith('location:')) {
                            setCollapsedLocationCategories((current) => toggleSidebarCollapseState(current, subsectionId, true));
                        } else {
                            setCollapsedCharacterCategories((current) => toggleSidebarCollapseState(current, subsectionId, true));
                        }
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
                                        fontWeight: 700,
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
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        minWidth: 0,
                        maxHeight: '100%',
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
                        <LorebookDetailPanel
                            key={selectedLore.id}
                            lore={selectedLore}
                            stage={stage}
                            isCreatorMode={isCreatorMode}
                            categories={categoryOrder.map((category) => ({ value: category, label: getCategoryLabel(category) }))}
                            matchesExistingActor={selectedLoreMatchesExistingActor}
                            matchesExistingLocation={selectedLoreMatchesExistingLocation}
                            onChange={updateSelectedLore}
                            onTitleChange={updateSelectedLoreTitle}
                            onClone={cloneSelectedLore}
                            onDelete={deleteSelectedLore}
                        />
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
