import React, { FC, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Place } from '@mui/icons-material';
import { Stage } from '../Stage';
import { Location } from '../content/Location';
import { Button } from './UiComponents';
import { LocationDetailPanel } from './LocationDetailPanel';
import { createLoreEntry } from '../content/Lore';

interface LocationManagementPanelProps {
    stage: () => Stage;
}

export const LocationManagementPanel: FC<LocationManagementPanelProps> = ({ stage }) => {
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const shouldReduceMotion = useReducedMotion();

    const shellStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: '20px',
        flex: 1,
        minHeight: 0,
    };

    const sidebarStyle: React.CSSProperties = {
        background: 'rgba(0, 20, 40, 0.45)',
        border: '1px solid rgba(0, 255, 136, 0.25)',
        borderRadius: '12px',
        padding: '14px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    };

    const detailPaneStyle: React.CSSProperties = {
        background: 'rgba(0, 20, 40, 0.45)',
        border: '1px solid rgba(0, 255, 136, 0.25)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
    };

    const sortByName = <T extends { name?: string }>(a: T, b: T) =>
        (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' });

    const locations = useMemo(() => {
        return Object.values(stage().getSave().atlas || {})
            .filter((location) => location.active !== false)
            .sort(sortByName);
    }, [stage]);

    // Create a map of locations by their category property. locationsByCategory[category] = array of locations in that category.
    const locationsByCategory = useMemo(() => {
        const categoryMap: Record<string, Location[]> = {};
        for (const location of locations) {
            const normalizedCategory = (location.category || '').trim();
            const category = normalizedCategory || 'Uncategorized';
            if (!categoryMap[category]) {
                categoryMap[category] = [];
            }
            categoryMap[category].push(location);
        }
        return Object.entries(categoryMap)
            .map(([title, entries]) => ({ title, entries: entries.sort(sortByName) }))
            .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }, [locations]);

    const selectedLocation = useMemo(() => {
        if (!selectedLocationId) {
            return null;
        }
        return locations.find((location) => location.id === selectedLocationId) || null;
    }, [locations, selectedLocationId]);

    const handleCreateLocation = () => {
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
            imageUrl: '',
            focalPoint: { x: 0.5, y: 0.5 },
            lightColor: '',
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
                probability: 1.0
            });
            save.lorebook = save.lorebook || [];
            save.lorebook.push(newLore);
        }

        stage().saveGame();
        setSelectedLocationId(location.id);
    };

    const renderLocationButton = (location: Location) => {
        const isSelected = location.id === selectedLocationId;
        return (
            <motion.button
                key={location.id}
                whileHover={{ scale: 1.01 }}
                type="button"
                onClick={() => setSelectedLocationId(location.id)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    background: isSelected ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 30, 60, 0.5)',
                    border: `1px solid ${isSelected ? 'rgba(0, 255, 136, 0.6)' : 'rgba(0, 255, 136, 0.22)'}`,
                    borderRadius: '8px',
                    padding: '10px',
                    color: '#e0f0ff',
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
                        border: `2px solid ${location.themeColor || 'rgba(0, 255, 136, 0.35)'}`,
                        backgroundColor: 'rgba(0, 20, 40, 0.8)',
                        backgroundImage: location.imageUrl ? `url(${location.imageUrl})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: `${(location.focalPoint?.x ?? 0.5) * 100}% ${(location.focalPoint?.y ?? 0.5) * 100}%`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                    }}
                >
                    {!location.imageUrl && <Place style={{ fontSize: '20px', color: 'rgba(0, 255, 136, 0.35)' }} />}
                </div>
                <div style={{ color: location.themeColor || '#00ff88', fontSize: '14px', fontWeight: 700 }}>
                    {location.name || '(Unnamed Location)'}
                </div>
            </motion.button>
        );
    };

    return (
        <div style={shellStyle}>
            <div style={sidebarStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ color: 'rgba(0, 255, 136, 0.9)', fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Locations ({locations.length})
                    </div>
                    <Button
                        onClick={handleCreateLocation}
                        variant="secondary"
                        style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '8px' }}
                    >
                        New
                    </Button>
                </div>

                {locations.length === 0 ? (
                    <div style={{ color: 'rgba(224, 240, 255, 0.6)', fontSize: '13px', padding: '8px 0' }}>
                        No locations found in the current save.
                    </div>
                ) : (
                    <>
                        {locationsByCategory.map((section) => {
                            const isCollapsed = collapsedCategories[section.title] ?? false;
                            return (
                                <div key={section.title}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCollapsedCategories((current) => ({
                                                ...current,
                                                [section.title]: !(current[section.title] ?? false),
                                            }));
                                        }}
                                        aria-expanded={!isCollapsed}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: '8px',
                                            background: 'transparent',
                                            border: 'none',
                                            padding: 0,
                                            color: 'rgba(224, 240, 255, 0.9)',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.08em',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid rgba(0, 255, 136, 0.25)',
                                            paddingBottom: '6px',
                                        }}
                                    >
                                        <span>{section.title} ({section.entries.length})</span>
                                        <motion.span
                                            aria-hidden="true"
                                            animate={{ rotate: isCollapsed ? 0 : 90 }}
                                            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            ▸
                                        </motion.span>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {!isCollapsed && (
                                            <motion.div
                                                key={`${section.title}-locations`}
                                                initial={shouldReduceMotion ? false : { height: 0, opacity: 0, y: -6 }}
                                                animate={shouldReduceMotion ? { height: 'auto', opacity: 1 } : { height: 'auto', opacity: 1, y: 0 }}
                                                exit={shouldReduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, y: -6 }}
                                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
                                                style={{ overflow: 'hidden', marginBottom: '10px' }}
                                            >
                                                {section.entries.length === 0 ? (
                                                    <div style={{ color: 'rgba(224, 240, 255, 0.6)', fontSize: '13px', fontStyle: 'italic' }}>
                                                        No locations.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', gap: '10px' }}>
                                                        {section.entries.map((location) => renderLocationButton(location))}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            <div style={detailPaneStyle}>
                {!selectedLocation ? (
                    <div
                        style={{
                            color: 'rgba(224, 240, 255, 0.7)',
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
