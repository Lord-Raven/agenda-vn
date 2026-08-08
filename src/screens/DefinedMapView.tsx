import { FC, useEffect, useMemo, useState } from 'react';
import { EventAvailable, MapRounded, MenuRounded, Settings } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { Map as GameMap } from '../content/Map';
import { getLocationImageUrl } from '../content/Location';
import { getCurrentLocation } from '../content/Skit';
import { Stage } from '../Stage';
import { ScreenType } from './BaseScreen';
import { ContentManagementScreen } from './ContentManagementScreen';
import { useTooltip } from './TooltipContext';
import { Button, GlassPanel } from './UiComponents';

interface DefinedMapViewProps {
    stage: () => Stage;
    maps: GameMap[];
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

export const DefinedMapView: FC<DefinedMapViewProps> = ({ stage, maps, setScreenType, isVerticalLayout }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);
    const [hoveredLink, setHoveredLink] = useState<string | null>(null);
    const save = stage().getSave();
    const sortedMaps = useMemo(() => [...maps].sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name)), [maps]);

    const latestLocationId = useMemo(() => {
        for (let index = save.timeline.length - 1; index >= 0; index -= 1) {
            const skit = save.timeline[index]?.skit;
            if (skit) {
                return getCurrentLocation(skit, Math.max(-1, (skit.script?.length || 0) - 1));
            }
        }
        return '';
    }, [save.timeline]);

    const preferredMap = useMemo(() => {
        if (latestLocationId) {
            const linkedMap = sortedMaps.find(map => map.links.some(link => link.childId === latestLocationId));
            if (linkedMap) {
                return linkedMap;
            }
        }
        return sortedMaps[0];
    }, [latestLocationId, sortedMaps]);

    const [displayedMapId, setDisplayedMapId] = useState(preferredMap?.id || '');

    useEffect(() => {
        if (!displayedMapId || !sortedMaps.some(map => map.id === displayedMapId)) {
            setDisplayedMapId(preferredMap?.id || '');
        }
    }, [displayedMapId, preferredMap, sortedMaps]);

    const displayedMap = sortedMaps.find(map => map.id === displayedMapId) || preferredMap;
    const currentTimeOfDay = save.currentTimeOfDay || 'morning';
    const configuredBackgroundImageUrl = stage().getConfiguration().backgroundImageUrl || '';

    if (!displayedMap) {
        return null;
    }

    return (
        <>
            <Box sx={{ width: '100vw', height: '100dvh', boxSizing: 'border-box', p: { xs: '12px', md: '18px' }, overflow: 'hidden', background: 'var(--agenda-surface-base)' }}>
                <GlassPanel variant="bright" style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                        <Button
                            variant="secondary"
                            onClick={() => setScreenType(ScreenType.CALENDAR)}
                            onMouseEnter={() => setTooltip('Switch to calendar', EventAvailable)}
                            onMouseLeave={clearTooltip}
                            style={{ padding: '8px 14px' }}
                        >
                            Calendar
                        </Button>
                        <Box sx={{ minWidth: 0, textAlign: 'center' }}>
                            <Typography sx={{ color: 'var(--agenda-text-primary)', fontFamily: 'var(--agenda-font-display)', fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.8rem' }, lineHeight: 1.1 }}>
                                {displayedMap.name || 'Unnamed Map'}
                            </Typography>
                            {displayedMap.description && (
                                <Typography sx={{ color: 'var(--agenda-text-muted)', fontSize: '0.78rem', mt: 0.35, maxWidth: 620, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {displayedMap.description}
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                            <Button variant="secondary" onClick={() => setShowContentManagement(true)} onMouseEnter={() => setTooltip('Manage configuration, actors, locations, maps, and more', Settings)} onMouseLeave={clearTooltip} style={{ padding: '8px 10px' }}><Settings fontSize="small" /></Button>
                            <Button variant="secondary" onClick={() => setScreenType(ScreenType.MENU)} onMouseEnter={() => setTooltip('Main menu', MenuRounded)} onMouseLeave={clearTooltip} style={{ padding: '8px 10px' }}><MenuRounded fontSize="small" /></Button>
                        </Box>
                    </Box>

                    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--agenda-line-strong)', borderRadius: '8px', background: 'color-mix(in srgb, var(--agenda-surface-base) 90%, black 10%)' }}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={displayedMap.id}
                                initial={{ opacity: 0, scale: 1.025 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.985 }}
                                transition={{ duration: 0.32, ease: 'easeInOut' }}
                                style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.16)), url(${displayedMap.imageUrl || configuredBackgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
                            >
                                {displayedMap.links.map((link, index) => {
                                    const linkedLocation = save.atlas?.[link.childId];
                                    const linkedMap = sortedMaps.find(map => map.id === link.childId);
                                    if (!linkedLocation && !linkedMap) {
                                        return null;
                                    }
                                    const markerKey = `${link.childId}-${index}`;
                                    const isHovered = hoveredLink === markerKey;
                                    const locationImageUrl = getLocationImageUrl(linkedLocation, stage(), currentTimeOfDay);
                                    const markerName = linkedLocation?.name || linkedMap?.name || 'Unnamed';
                                    const markerSize = isVerticalLayout ? 44 : 52;

                                    return (
                                        <motion.button
                                            key={markerKey}
                                            type="button"
                                            aria-label={linkedMap ? `Open map ${markerName}` : markerName}
                                            onClick={linkedMap ? () => setDisplayedMapId(linkedMap.id) : undefined}
                                            onMouseEnter={() => setHoveredLink(markerKey)}
                                            onMouseLeave={() => setHoveredLink(null)}
                                            animate={{ width: isHovered ? Math.max(markerSize, Math.min(220, markerName.length * 9 + markerSize)) : markerSize }}
                                            transition={{ duration: 0.2, ease: 'easeOut' }}
                                            style={{ position: 'absolute', left: `${link.coordinates.x * 100}%`, top: `${link.coordinates.y * 100}%`, transform: 'translate(-50%, -50%)', height: markerSize, padding: 0, display: 'flex', alignItems: 'center', overflow: 'hidden', borderRadius: markerSize / 2, border: '2px solid var(--agenda-text-primary)', background: 'color-mix(in srgb, var(--agenda-surface-base) 82%, transparent)', boxShadow: '0 4px 14px rgba(0,0,0,.7)', color: 'var(--agenda-text-primary)', cursor: linkedMap ? 'pointer' : 'default', zIndex: isHovered ? 2 : 1 }}
                                        >
                                            <span style={{ width: markerSize - 4, height: markerSize - 4, flex: `0 0 ${markerSize - 4}px`, display: 'grid', placeItems: 'center', borderRadius: '50%', backgroundImage: locationImageUrl ? `url(${locationImageUrl})` : (linkedMap?.imageUrl ? `url(${linkedMap.imageUrl})` : 'none'), backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                                {!locationImageUrl && !linkedMap?.imageUrl && <MapRounded fontSize="small" />}
                                            </span>
                                            <span style={{ padding: '0 12px 0 6px', whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: 700 }}>{markerName}</span>
                                        </motion.button>
                                    );
                                })}
                            </motion.div>
                        </AnimatePresence>
                    </Box>
                </GlassPanel>
            </Box>
            {showContentManagement && <ContentManagementScreen stage={stage} onClose={() => { stage().saveGame(); setShowContentManagement(false); }} />}
        </>
    );
};