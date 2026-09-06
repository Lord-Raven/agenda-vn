import { CSSProperties, FC, Fragment, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowOutward, EditNote, EventAvailable, MapRounded, MenuRounded, PlayArrow, Settings } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { getMapImageUrl, Map as GameMap } from '../content/Map';
import { getLocationImageUrl, getLocationName } from '../content/Location';
import { getCurrentLocation } from '../content/Skit';
import { Stage } from '../Stage';
import { ScreenType } from './BaseScreen';
import { ContentManagementScreen } from './ContentManagementScreen';
import { useTooltip } from '../components/TooltipContext';
import { Button } from '../components/UiComponents';
import { evaluateConditionCollections } from '../content/Condition';
import { LocationActorPortraits } from '../components/LocationActorPortraits';
import { GlobalStatBar } from '../components/GlobalStatBar';
import { useCachedImageUrl } from '../utils/ImageCache';
import { CachedBackgroundUrl } from '../components/CachedImage';

interface DefinedMapViewProps {
    stage: () => Stage;
    maps: GameMap[];
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const DEFAULT_BACKGROUND_IMAGE_URL = 'https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png';

interface MapMarkerButtonProps {
    isHovered: boolean;
    isInteractive: boolean;
    markerSize: number;
    label: string;
    secondaryLabel?: string;
    disabled: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    style: CSSProperties;
    'aria-label': string;
    children: ReactNode;
}

const MapMarkerButton: FC<MapMarkerButtonProps> = ({ isHovered, isInteractive, markerSize, label, secondaryLabel, style, children, ...buttonProps }) => {
    // Stay elevated through its own collapse animation so a newly hovered neighbor doesn't
    // cut off the shrink transition mid-flight, which otherwise reads as an instant snap.
    const [isElevated, setIsElevated] = useState(isHovered);
    const [expandedMarkerWidth, setExpandedMarkerWidth] = useState(markerSize);
    const measureRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (isHovered) {
            setIsElevated(true);
        }
    }, [isHovered]);

    useLayoutEffect(() => {
        const measure = measureRef.current;
        if (!measure) {
            return;
        }

        const updateWidth = () => setExpandedMarkerWidth(markerSize + measure.getBoundingClientRect().width);
        const observer = new ResizeObserver(updateWidth);
        observer.observe(measure);
        updateWidth();

        return () => observer.disconnect();
    }, [label, markerSize, secondaryLabel]);

    // A marker still collapsing (elevated but no longer hovered) must render above a freshly
    // hovered neighbor that's growing, otherwise the growing marker covers its shrink animation.
    const zIndex = isElevated && !isHovered ? 3 : isHovered ? 2 : 1;

    return (
        <motion.button
            type="button"
            {...buttonProps}
            initial={{ opacity: 0, scale: 0.86, x: '-50%', y: '-50%', width: markerSize }}
            animate={{ opacity: isInteractive ? 1 : 0.5, scale: 1, x: '-50%', y: '-50%', width: isHovered ? expandedMarkerWidth : markerSize }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onAnimationComplete={() => {
                if (!isHovered) {
                    setIsElevated(false);
                }
            }}
            style={{ ...style, boxSizing: 'border-box', zIndex }}
        >
            {children}
            <span ref={measureRef} aria-hidden="true" style={{ position: 'absolute', display: 'block', boxSizing: 'border-box', width: 'max-content', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'nowrap', padding: '0 12px 0 6px', fontSize: '0.82rem', fontWeight: 700 }}>
                {label}
                {secondaryLabel && <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 400 }}>{secondaryLabel}</span>}
            </span>
        </motion.button>
    );
};

export const DefinedMapView: FC<DefinedMapViewProps> = ({ stage, maps, setScreenType, isVerticalLayout }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);
    const [hoveredLink, setHoveredLink] = useState<string | null>(null);
    const mapViewportRef = useRef<HTMLDivElement>(null);
    const [mapViewportSize, setMapViewportSize] = useState({ width: 0, height: 0 });
    const [mapImageSize, setMapImageSize] = useState({ width: 0, height: 0 });
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
    const configuredBackgroundImageUrl = stage().getConfiguration().backgroundImageUrl?.trim() || DEFAULT_BACKGROUND_IMAGE_URL;
    const cachedBackgroundImageUrl = useCachedImageUrl(configuredBackgroundImageUrl);
    const displayedMapImageUrl = useCachedImageUrl(displayedMap ? getMapImageUrl(displayedMap, stage()) : undefined);

    useEffect(() => {
        const viewport = mapViewportRef.current;
        if (!viewport) {
            return;
        }

        const updateViewportSize = () => {
            const bounds = viewport.getBoundingClientRect();
            setMapViewportSize({ width: bounds.width, height: bounds.height });
        };
        const observer = new ResizeObserver(updateViewportSize);
        observer.observe(viewport);
        updateViewportSize();

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setMapImageSize({ width: 0, height: 0 });
        if (!displayedMapImageUrl) {
            return;
        }

        const image = new Image();
        image.onload = () => setMapImageSize({ width: image.naturalWidth, height: image.naturalHeight });
        image.src = displayedMapImageUrl;
    }, [displayedMapImageUrl]);

    if (!displayedMap) {
        return null;
    }

    const getMarkerPosition = (x: number, y: number) => {
        const { width: viewportWidth, height: viewportHeight } = mapViewportSize;
        const { width: imageWidth, height: imageHeight } = mapImageSize;
        if (!viewportWidth || !viewportHeight || !imageWidth || !imageHeight) {
            return { left: `${x * 100}%`, top: `${y * 100}%` };
        }

        // The editor stores coordinates in its fixed 16:9 preview space. Map that
        // point through the source image and then through the runtime cover crop.
        const previewWidth = 16;
        const previewHeight = 9;
        const previewScale = Math.max(previewWidth / imageWidth, previewHeight / imageHeight);
        const previewRenderedWidth = imageWidth * previewScale;
        const previewRenderedHeight = imageHeight * previewScale;
        const sourceX = (x * previewWidth - (previewWidth - previewRenderedWidth) / 2) / previewRenderedWidth;
        const sourceY = (y * previewHeight - (previewHeight - previewRenderedHeight) / 2) / previewRenderedHeight;
        const runtimeScale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
        const renderedWidth = imageWidth * runtimeScale;
        const renderedHeight = imageHeight * runtimeScale;
        const offsetX = (viewportWidth - renderedWidth) / 2;
        const offsetY = (viewportHeight - renderedHeight) / 2;
        return {
            left: `${((offsetX + sourceX * renderedWidth) / viewportWidth) * 100}%`,
            top: `${((offsetY + sourceY * renderedHeight) / viewportHeight) * 100}%`,
        };
    };

    return (
        <>
            <Box sx={{ width: '100vw', height: '100dvh', boxSizing: 'border-box', p: { xs: '12px', md: '18px' }, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden', backgroundImage: `linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%), url(${cachedBackgroundImageUrl || ''})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
                <Box sx={{ flexShrink: 0 }}>
                    <GlobalStatBar
                        stage={stage}
                        buttons={
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.CALENDAR)}
                                    onMouseEnter={() => setTooltip('Switch to calendar', EventAvailable)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: '8px 10px' }}
                                >
                                    <EventAvailable fontSize="small" />
                                </Button>
                                <Button variant="secondary" onClick={() => setShowContentManagement(true)} onMouseEnter={() => setTooltip('Manage configuration, actors, locations, maps, and more', EditNote)} onMouseLeave={clearTooltip} style={{ padding: '8px 10px' }}><EditNote fontSize="small" /></Button>
                                <Button variant="secondary" onClick={() => setScreenType(ScreenType.MENU)} onMouseEnter={() => setTooltip('Main menu', MenuRounded)} onMouseLeave={clearTooltip} style={{ padding: '8px 10px' }}><MenuRounded fontSize="small" /></Button>
                            </>
                        }
                    />
                </Box>

                <Box ref={mapViewportRef} sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--agenda-line-strong)', borderRadius: '8px', background: 'color-mix(in srgb, var(--agenda-surface-base) 90%, black 10%)' }}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${displayedMap.id}-label`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.28, ease: 'easeInOut' }}
                                style={{ position: 'absolute', top: 0, left: 0, zIndex: 3, maxWidth: 'min(72%, 460px)', pointerEvents: 'none' }}
                            >
                                <Box
                                    sx={{
                                        background: 'linear-gradient(90deg, color-mix(in srgb, var(--agenda-surface-base) 80%, transparent) 0%, color-mix(in srgb, var(--agenda-surface-base) 55%, transparent) 60%, transparent 100%)',
                                        backdropFilter: 'blur(6px)',
                                        WebkitBackdropFilter: 'blur(6px)',
                                        px: { xs: 1.5, md: 2 },
                                        py: { xs: 1, md: 1.25 },
                                        pr: { xs: 4, md: 6 },
                                    }}
                                >
                                    <Typography sx={{ color: 'var(--agenda-text-primary)', fontFamily: 'var(--agenda-font-flavor)', fontWeight: 700, fontSize: { xs: '1.25rem', md: '1.8rem' }, lineHeight: 1.1 }}>
                                        {displayedMap.name || 'Unnamed Map'}
                                    </Typography>
                                    {displayedMap.description && (
                                        <Typography sx={{ color: 'var(--agenda-text-muted)', fontSize: '0.78rem', mt: 0.35, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {displayedMap.description}
                                        </Typography>
                                    )}
                                </Box>
                            </motion.div>
                        </AnimatePresence>
                        <AnimatePresence initial={false}>
                            <motion.div
                                key={displayedMap.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.45, ease: 'easeInOut' }}
                                style={{ position: 'absolute', inset: 0, backgroundImage: displayedMapImageUrl ? `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.16)), url(${displayedMapImageUrl})` : 'linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.16))', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
                            >
                                {displayedMap.links.map((link, index) => {
                                    const linkedLocation = save.atlas?.[link.childId];
                                    const linkedMap = sortedMaps.find(map => map.id === link.childId);
                                    if (!linkedLocation && !linkedMap) {
                                        return null;
                                    }
                                    if (linkedLocation && !stage().isLocationVisible(linkedLocation.id)) {
                                        return null;
                                    }
                                    const markerKey = `${link.childId}-${index}`;
                                    const isHovered = hoveredLink === markerKey;
                                    const locationImageUrl = getLocationImageUrl(linkedLocation, stage());
                                    const linkedMapImageUrl = getMapImageUrl(linkedMap, stage());
                                    const currentEvent = linkedLocation ? stage().getCurrentLocationEvent(linkedLocation.id) : null;
                                    const canVisitLocation = linkedLocation ? stage().canVisitLocation(linkedLocation.id) : false;
                                    const markerName = currentEvent?.name || (linkedLocation?.name ? getLocationName(linkedLocation.id, stage()) : linkedMap?.name) || 'Unnamed';
                                    const markerSize = isVerticalLayout ? 48 : 57;
                                    const actorPortraitSize = isVerticalLayout ? 28 : 32;
                                    const configuration = stage().getConfiguration();
                                    const isLinkAvailable = evaluateConditionCollections(link.conditionCollections, { ...save, globalStats: configuration.globalStats, actorStats: configuration.actorStats });
                                    const isInteractive = isLinkAvailable && Boolean(linkedMap || canVisitLocation);
                                    const markerPosition = getMarkerPosition(link.coordinates.x, link.coordinates.y);
                                    const handleMarkerClick = () => {
                                        if (linkedMap) {
                                            setDisplayedMapId(linkedMap.id);
                                            return;
                                        }
                                        if (linkedLocation && stage().startLocationVisit(linkedLocation.id)) {
                                            setScreenType(ScreenType.SKIT);
                                        }
                                    };

                                    return (
                                        <Fragment key={markerKey}>
                                        <CachedBackgroundUrl url={locationImageUrl || linkedMapImageUrl} thumbnailSize={markerSize * 2}>
                                            {(markerImageUrl) => {
                                                if ((locationImageUrl || linkedMapImageUrl) && !markerImageUrl) {
                                                    return null;
                                                }

                                                return (
                                                    <MapMarkerButton
                                                        isHovered={isHovered}
                                                        aria-label={linkedMap ? `Open map ${markerName}` : currentEvent ? `${linkedLocation?.name}: ${currentEvent.name}` : markerName}
                                                        disabled={!isInteractive}
                                                        onClick={handleMarkerClick}
                                                        onMouseEnter={() => setHoveredLink(markerKey)}
                                                        onMouseLeave={() => setHoveredLink(null)}
                                                        isInteractive={isInteractive}
                                                        markerSize={markerSize}
                                                        label={markerName}
                                                        secondaryLabel={currentEvent ? linkedLocation?.name : undefined}
                                                        style={{ position: 'absolute', ...markerPosition, height: markerSize, padding: 0, display: 'flex', alignItems: 'center', overflow: 'visible', borderRadius: markerSize / 2, border: `2px solid ${currentEvent ? 'var(--agenda-highlight)' : 'var(--agenda-text-primary)'}`, background: 'color-mix(in srgb, var(--agenda-surface-base) 82%, transparent)', boxShadow: '0 4px 14px rgba(0,0,0,.7)', color: 'var(--agenda-text-primary)', cursor: isInteractive ? 'pointer' : 'not-allowed' }}
                                                    >
                                                        <span style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', overflow: 'hidden', borderRadius: markerSize / 2 }}>
                                                        <span style={{ position: 'relative', width: markerSize - 4, height: markerSize - 4, flex: `0 0 ${markerSize - 4}px`, display: 'grid', placeItems: 'center', borderRadius: '50%', backgroundImage: markerImageUrl ? `url(${markerImageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                                            {!markerImageUrl && <MapRounded fontSize="small" />}
                                                        </span>
                                                            <span style={{ padding: '0 12px 0 6px', whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: 700, flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
                                                                {markerName}
                                                                {currentEvent && <span style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '0.65rem', fontWeight: 400 }}>{linkedLocation?.name}</span>}
                                                            </span>
                                                        </span>
                                                        {isInteractive && (
                                                            <span style={{ position: 'absolute', top: -2, left: -2, display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--agenda-highlight)', color: 'var(--agenda-surface-base)', boxShadow: '0 1px 4px rgba(0,0,0,.6)' }}>
                                                                {linkedMap ? <ArrowOutward sx={{ fontSize: 11 }} /> : <PlayArrow sx={{ fontSize: 11 }} />}
                                                            </span>
                                                        )}
                                                    </MapMarkerButton>
                                                );
                                            }}
                                        </CachedBackgroundUrl>
                                        {linkedLocation && (
                                            <div style={{ position: 'absolute', ...markerPosition, transform: `translate(-50%, calc(-50% + ${markerSize / 2 - actorPortraitSize * 0.35}px))`, zIndex: isHovered ? 5 : 3 }}>
                                                <LocationActorPortraits
                                                    locationId={linkedLocation.id}
                                                    stage={stage()}
                                                    size={actorPortraitSize}
                                                    onHoverChange={hovering => setHoveredLink(hovering ? markerKey : null)}
                                                />
                                            </div>
                                        )}
                                        </Fragment>
                                    );
                                })}
                            </motion.div>
                        </AnimatePresence>
                </Box>
            </Box>
            {showContentManagement && <ContentManagementScreen stage={stage} onClose={() => { stage().saveGame(); setShowContentManagement(false); }} />}
        </>
    );
};