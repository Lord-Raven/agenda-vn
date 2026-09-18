import React, { FC, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Stage } from '../Stage';
import { Item } from '../content/Item';
import { ItemPortrait } from '../components/ItemPortrait';
import { ItemDetailPanel } from './ItemDetailPanel';
import { createLoreEntry } from '../content/Lore';
import {
    CategorizedEntrySection,
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';

interface ItemManagementPanelProps {
    stage: () => Stage;
    isCreatorMode: boolean;
}

export const ItemManagementPanel: FC<ItemManagementPanelProps> = ({ stage, isCreatorMode }) => {
    const UNCATEGORIZED_LABEL = 'Uncategorized';
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useCachedSidebarCollapseState('item-management');
    const [itemRevision, setItemRevision] = useState(0);
    const shouldReduceMotion = useReducedMotion();

    const shellStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: '20px',
        flex: 1,
        minHeight: 0,
        height: '100%',
    };

    const detailPaneStyle: React.CSSProperties = {
        background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
        border: '1px solid var(--agenda-line-subtle)',
        borderRadius: '12px',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: '100%',
    };

    const sortByName = <T extends { name?: string }>(a: T, b: T) =>
        (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' });

    const items = useMemo(() => {
        const source = isCreatorMode
            ? stage().getConfiguration().items || []
            : stage().getSave().inventory || [];
        return source
            .filter((item) => item.active !== false)
            .sort(sortByName);
    }, [stage, itemRevision, isCreatorMode]);

    const itemsByCategory = useMemo<CategorizedEntrySection<Item>[]>(() => {
        const categoryMap: Record<string, Item[]> = {};
        for (const item of items) {
            const normalizedCategory = (item.category || '').trim();
            const category = normalizedCategory || UNCATEGORIZED_LABEL;
            if (!categoryMap[category]) {
                categoryMap[category] = [];
            }
            categoryMap[category].push(item);
        }

        if (!categoryMap[UNCATEGORIZED_LABEL]) {
            categoryMap[UNCATEGORIZED_LABEL] = [];
        }

        return Object.entries(categoryMap)
            .map(([title, entries]) => ({
                id: title,
                title,
                entries: entries.sort(sortByName),
            }))
            .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }, [items, UNCATEGORIZED_LABEL]);

    const selectedItem = useMemo(() => {
        if (!selectedItemId) {
            return null;
        }
        return items.find((item) => item.id === selectedItemId) || null;
    }, [items, selectedItemId]);

    const handleCreateItem = (category: string) => {
        const save = stage().getSave();
        const configuredItems = stage().getConfiguration().items || [];
        const items = isCreatorMode ? configuredItems : save.inventory || [];
        const baseName = 'New Item';
        const usedNames = new Set(items.map((item) => item.name?.trim().toLowerCase()));

        let candidateName = baseName;
        let counter = 1;
        while (usedNames.has(candidateName.toLowerCase())) {
            candidateName = `New Item ${counter}`;
            counter += 1;
        }

        const item = new Item({
            active: true,
            name: candidateName,
            description: '',
            category: category === UNCATEGORIZED_LABEL ? '' : category,
            imageUrl: '',
            themeColor: '',
            availabilityConditions: [],
            statMap: {},
        });

        if (isCreatorMode) {
            stage().updateConfiguration({ items: [...configuredItems, item] });
        } else {
            save.inventory = [...(save.inventory || []), item];
        }

        const lorebook = isCreatorMode ? stage().getConfiguration().lorebook : save.lorebook;
        const existingLore = lorebook?.find((lore) => lore.type === 'item' && lore.title?.trim().toLowerCase() === item.name?.trim().toLowerCase());
        if (!existingLore) {
            const newLore = createLoreEntry({
                type: 'item',
                title: item.name,
                content: item.description,
                triggers: [item.name, ...item.name.split(' ').filter(word => word.length > 2 && word.charAt(word.length - 1) !== '.')],
                enabled: true,
                constant: false,
                insertionOrder: 0,
                priority: 0,
                probability: 100,
            });
            if (isCreatorMode) {
                stage().updateConfiguration({ lorebook: [...(lorebook || []), newLore] });
            } else {
                save.lorebook = save.lorebook || [];
                save.lorebook.push(newLore);
            }
        }

        if (!isCreatorMode) {
            stage().saveGame();
        }
        setItemRevision((current) => current + 1);
        setSelectedItemId(item.id);
    };

    const renderItemButton = (item: Item) => {
        const isSelected = item.id === selectedItemId;
        return (
            <motion.button
                whileHover={{ scale: 1.01 }}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    background: isSelected
                        ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                        : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                    border: `1px solid ${isSelected ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                    borderRadius: '8px',
                    padding: '10px',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr',
                    gap: '10px',
                    alignItems: 'center',
                }}
            >
                <ItemPortrait item={item} stage={stage} width={56} height={56} />
                <div style={{ color: item.themeColor || 'var(--agenda-highlight)', fontSize: '14px', fontWeight: 700 }}>
                    {item.name || '(Unnamed Item)'}
                </div>
            </motion.button>
        );
    };

    return (
        <div style={shellStyle}>
            <CategorizedEntrySidebar
                sections={itemsByCategory}
                collapsedSections={collapsedCategories}
                onToggleSection={(sectionId) => {
                    setCollapsedCategories((current) => toggleSidebarCollapseState(current, sectionId, true));
                }}
                renderEntry={(item) => renderItemButton(item)}
                getEntryKey={(item) => item.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No items found in the current save."
                sectionEmptyMessage="No items."
                renderSectionAction={(section) => {
                    handleCreateItem(section.title);
                }}
            />

            <div style={detailPaneStyle}>
                {!selectedItem ? (
                    <div
                        style={{
                            color: 'var(--agenda-text-muted)',
                            fontSize: '15px',
                            textAlign: 'center',
                            padding: '30px',
                        }}
                    >
                        Select an item to view and edit details.
                    </div>
                ) : (
                    <ItemDetailPanel
                        key={selectedItem.id}
                        item={selectedItem}
                        stage={stage}
                        isCreatorMode={isCreatorMode}
                        onUpdate={() => setItemRevision((current) => current + 1)}
                        onDeactivate={(itemId) => {
                            setItemRevision((current) => current + 1);
                            if (selectedItemId === itemId) {
                                setSelectedItemId(null);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};
