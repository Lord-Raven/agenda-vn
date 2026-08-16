import React, { FC, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Place } from '@mui/icons-material';
import { Stage } from '../Stage';
import { getLocationImageUrl, Location } from '../content/Location';
import { Button } from '../components/UiComponents';
import { LocationDetailPanel } from './LocationDetailPanel';
import { createLoreEntry } from '../content/Lore';
import {
    CategorizedEntrySection,
    CategorizedEntrySidebar,
    toggleSidebarCollapseState,
    useCachedSidebarCollapseState,
} from '../components/CategorizedEntrySidebar';

interface LocationManagementPanelProps {
    stage: () => Stage;
}

export const LocationManagementPanel: FC<LocationManagementPanelProps> = ({ stage }) => {
    const UNCATEGORIZED_LABEL = 'Uncategorized';
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useCachedSidebarCollapseState('location-management');
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

    const locations = useMemo(() => {
        return Object.values(stage().getSave().atlas || {})
            .filter((location) => location.active !== false)
            .sort(sortByName);
    }, [stage]);

    // Create a map of locations by their category property. locationsByCategory[category] = array of locations in that category.
    const locationsByCategory = useMemo<CategorizedEntrySection<Location>[]>(() => {
        const categoryMap: Record<string, Location[]> = {};
        for (const location of locations) {
            const normalizedCategory = (location.category || '').trim();
            const category = normalizedCategory || UNCATEGORIZED_LABEL;
            if (!categoryMap[category]) {
                categoryMap[category] = [];
            }
            categoryMap[category].push(location);
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
    }, [locations, UNCATEGORIZED_LABEL]);

    const selectedLocation = useMemo(() => {
        if (!selectedLocationId) {
            return null;
        }
        return locations.find((location) => location.id === selectedLocationId) || null;
    }, [locations, selectedLocationId]);

    const handleCreateLocation = (category: string) => {
        const save = stage().getSave();
        const baseName = 'New Location';
        const usedNames = new Set(Object.values(save.atlas || {}).map((location) => location.name?.trim().toLowerCase()));

        let candidateName = baseName;
        let counter = 1;
        while (usedNames.has(candidateName.toLowerCase())) {
            candidateName = `New Location ${counter}`;
            counter += 1;
        }

        const location = new Location({
            active: true,
            name: candidateName,
            description: '',
            category: category === UNCATEGORIZED_LABEL ? '' : category,
            imageUrl: '',
            focalPoint: { x: 0.5, y: 0.5 },
            themeColor: '',
        });

        save.atlas = save.atlas || {};
        save.atlas[location.id] = location;

        // If the location has no lorebook entry, create one with the same name and description.
        const existingLore = save.lorebook?.find((lore) => lore.type === 'location' && lore.title?.trim().toLowerCase() === location.name?.trim().toLowerCase());
        if (!existingLore) {
            const newLore = createLoreEntry({
                type: 'location',
                title: location.name,
                content: location.description,
                triggers: [location.name, ...location.name.split(' ').filter(word => word.length > 2 && word.charAt(word.length - 1) !== '.')],
                enabled: true,
                constant: false,
                insertionOrder: 0,
                priority: 0,
                probability: 100
            });
            save.lorebook = save.lorebook || [];
            save.lorebook.push(newLore);
        }

        setSelectedLocationId(location.id);
    };

    const renderLocationButton = (location: Location) => {
        const isSelected = location.id === selectedLocationId;
        return (
            <motion.button
                whileHover={{ scale: 1.01 }}
                type="button"
                onClick={() => setSelectedLocationId(location.id)}
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
                    gridTemplateColumns: '64px 1fr',
                    gap: '10px',
                    alignItems: 'center',
                }}
            >
                <div
                    style={{
                        width: '64px',
                        height: '48px',
                        borderRadius: '6px',
                        border: `2px solid ${location.themeColor || 'var(--agenda-line-strong)'}`,
                        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
                        backgroundImage: getLocationImageUrl(location, stage()) ? `url(${getLocationImageUrl(location, stage())})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: `${(location.focalPoint?.x ?? 0.5) * 100}% ${(location.focalPoint?.y ?? 0.5) * 100}%`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                    }}
                >
                    {!getLocationImageUrl(location, stage()) && <Place style={{ fontSize: '20px', color: 'var(--agenda-accent-primary)' }} />}
                </div>
                <div style={{ color: location.themeColor || 'var(--agenda-highlight)', fontSize: '14px', fontWeight: 700 }}>
                    {location.name || '(Unnamed Location)'}
                </div>
            </motion.button>
        );
    };

    return (
        <div style={shellStyle}>
            <CategorizedEntrySidebar
                sections={locationsByCategory}
                collapsedSections={collapsedCategories}
                onToggleSection={(sectionId) => {
                    setCollapsedCategories((current) => toggleSidebarCollapseState(current, sectionId, true));
                }}
                renderEntry={(location) => renderLocationButton(location)}
                getEntryKey={(location) => location.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No locations found in the current save."
                sectionEmptyMessage="No locations."
                renderSectionAction={(section) => {
                    handleCreateLocation(section.title);
                }}
            />

            <div style={detailPaneStyle}>
                {!selectedLocation ? (
                    <div
                        style={{
                            color: 'var(--agenda-text-muted)',
                            fontSize: '15px',
                            textAlign: 'center',
                            padding: '30px',
                        }}
                    >
                        Select a location to view and edit details.
                    </div>
                ) : (
                    <LocationDetailPanel
                        key={selectedLocation.id}
                        location={selectedLocation}
                        stage={stage}
                        onDeactivate={(locationId) => {
                            if (selectedLocationId === locationId) {
                                setSelectedLocationId(null);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};
