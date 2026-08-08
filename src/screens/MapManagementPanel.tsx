import { FC, useMemo, useState } from 'react';
import { Map as MapIcon } from '@mui/icons-material';
import { motion, useReducedMotion } from 'framer-motion';
import { Map as GameMap } from '../content/Map';
import { Stage } from '../Stage';
import { CategorizedEntrySection, CategorizedEntrySidebar } from './CategorizedEntrySidebar';
import { MapDetailPanel } from './MapDetailPanel';

interface MapManagementPanelProps {
    stage: () => Stage;
}

const UNCATEGORIZED_LABEL = 'Uncategorized';

export const MapManagementPanel: FC<MapManagementPanelProps> = ({ stage }) => {
    const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const [revision, setRevision] = useState(0);
    const shouldReduceMotion = useReducedMotion();
    const maps = (stage().getSave().maps || []).filter(map => map.active !== false);

    const sections = useMemo<CategorizedEntrySection<GameMap>[]>(() => {
        const grouped: Record<string, GameMap[]> = { [UNCATEGORIZED_LABEL]: [] };
        maps.forEach((map) => {
            const category = map.category.trim() || UNCATEGORIZED_LABEL;
            grouped[category] = grouped[category] || [];
            grouped[category].push(map);
        });
        return Object.entries(grouped)
            .map(([title, entries]) => ({ id: title, title, entries: entries.sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name)) }))
            .sort((left, right) => left.title.localeCompare(right.title));
    }, [maps, revision]);

    const selectedMap = maps.find(map => map.id === selectedMapId) || null;

    const createMap = (category: string) => {
        const save = stage().getSave();
        const usedNames = new Set((save.maps || []).map(map => map.name.toLowerCase()));
        let name = 'New Map';
        let suffix = 1;
        while (usedNames.has(name.toLowerCase())) {
            name = `New Map ${suffix++}`;
        }
        const priority = Math.max(-1, ...(save.maps || []).filter(map => map.active !== false).map(map => map.priority)) + 1;
        const map = new GameMap({ name, category: category === UNCATEGORIZED_LABEL ? '' : category, priority });
        save.maps = [...(save.maps || []), map];
        stage().updateConfiguration({ maps: save.maps });
        setSelectedMapId(map.id);
        setRevision(current => current + 1);
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, flex: 1, minHeight: 0 }}>
            <CategorizedEntrySidebar
                sections={sections}
                collapsedSections={collapsedCategories}
                onToggleSection={sectionId => setCollapsedCategories(current => ({ ...current, [sectionId]: !(current[sectionId] ?? false) }))}
                renderEntry={map => (
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        type="button"
                        onClick={() => setSelectedMapId(map.id)}
                        style={{ width: '100%', minHeight: 58, display: 'grid', gridTemplateColumns: '44px 1fr', gap: 10, alignItems: 'center', textAlign: 'left', padding: 9, cursor: 'pointer', color: 'var(--agenda-text-primary)', background: map.id === selectedMapId ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)' : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)', border: `1px solid ${map.id === selectedMapId ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`, borderRadius: 8 }}
                    >
                        <span style={{ width: 44, height: 40, display: 'grid', placeItems: 'center', borderRadius: 6, backgroundImage: map.imageUrl ? `url(${map.imageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'var(--agenda-surface-base)' }}><MapIcon fontSize="small" /></span>
                        <span><strong style={{ display: 'block' }}>{map.name || '(Unnamed Map)'}</strong><small style={{ color: 'var(--agenda-text-muted)' }}>Priority {map.priority}</small></span>
                    </motion.button>
                )}
                getEntryKey={map => map.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No maps found in the current save."
                sectionEmptyMessage="No maps."
                renderSectionAction={section => createMap(section.title)}
            />
            <div style={{ background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)', border: '1px solid var(--agenda-line-subtle)', borderRadius: 12, overflow: 'hidden', minHeight: 0 }}>
                {selectedMap ? (
                    <MapDetailPanel key={selectedMap.id} map={selectedMap} stage={stage} onChange={() => setRevision(current => current + 1)} onDeactivate={() => setSelectedMapId(null)} />
                ) : (
                    <div style={{ color: 'var(--agenda-text-muted)', textAlign: 'center', padding: 30 }}>Select a map to view and edit details.</div>
                )}
            </div>
        </div>
    );
};