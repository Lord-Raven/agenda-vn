import { CSSProperties, FC, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowOutward, EditNote, EventAvailable, MapRounded, MenuRounded, PlayArrow, Settings, TouchApp } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { getMapImageRect, getMapImageUrl, getMapLinkAvailability, Map as GameMap, MapFitMode, previewToImageCoordinates } from '../content/Map';
import { getLocationImageUrl, getLocationName } from '../content/Location';
import { getCurrentLocation, Skit } from '../content/Skit';
import { Stage } from '../Stage';
import { ScreenType } from './BaseScreen';
import { ContentManagementScreen } from './ContentManagementScreen';
import { useTooltip } from '../components/TooltipContext';
import { Button } from '../components/UiComponents';
import { LocationActorPortraits } from '../components/LocationActorPortraits';
import { GlobalStatBar } from '../components/GlobalStatBar';
import { ControlDock } from '../components/ControlDock';
import { useCachedImageUrl } from '../utils/ImageCache';
import { CachedBackgroundUrl } from '../components/CachedImage';
import { resolveIcon } from '../components/StatRating';
import { ContentListPortraits } from '../components/ContentListControl';
import { normalizeReferenceListValue, StatType } from '../content/Stat';
import { processLoreText, stripLoreIcons } from '../content/Lore';
import { isControlAvailable, markerVariableBindings } from '../content/Control';

interface DefinedMapViewProps {
    stage: () => Stage;
    maps: GameMap[];
    onAction: (skit?: Skit | null) => void;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
    embedded?: boolean;
    initialMapId?: string;
    overlay?: ReactNode;
}

interface MapMarkerButtonProps {
    isInteractive: boolean;
    markerSize: number;
    disabled: boolean;
    onClick: () => void;
    style: CSSProperties;
    'aria-label': string;
    children: ReactNode;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const MapMarkerButton: FC<MapMarkerButtonProps> = ({ isInteractive, markerSize, style, children, ...buttonProps }) => {
    return (
        <motion.button
            type="button"
            {...buttonProps}
            initial={{ opacity: 0, scale: 0.86, x: '-50%', y: '-50%', width: markerSize }}
            animate={{ opacity: isInteractive ? 1 : 0.5, scale: 1, x: '-50%', y: '-50%', width: markerSize }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ ...style, zIndex: 1 }}
        >
            {children}
        </motion.button>
    );
};

export const DefinedMapView: FC<DefinedMapViewProps> = ({ stage, maps, onAction: handleAction, setScreenType, isVerticalLayout, embedded = false, initialMapId, overlay }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);
    const mapViewportRef = useRef<HTMLDivElement>(null);
    const [mapViewportSize, setMapViewportSize] = useState({ width: 0, height: 0 });
    const [mapImageSize, setMapImageSize] = useState({ width: 0, height: 0 });
    const save = stage().getSave();
    const sortedMaps = useMemo(() => [...maps]
        .sort((left, right) => left.priority - right.priority), [maps]);

    let latestLocationId = '';
    for (let index = save.timeline.length - 1; index >= 0; index -= 1) {
        const skit = save.timeline[index]?.skit;
        if (skit) {
            latestLocationId = getCurrentLocation(skit, Math.max(-1, (skit.script?.length || 0) - 1));
            break;
        }
    }

    const preferredMap = useMemo(() => {
        const initialMap = sortedMaps.find(map => map.id === initialMapId);
        if (initialMap) {
            return initialMap;
        }
        if (latestLocationId) {
            const linkedMap = sortedMaps.find(map => map.links.some(link => link.type !== 'button' && stage().resolveValue(link.childId, 'location') === latestLocationId));
            if (linkedMap) {
                return linkedMap;
            }
        }
        return sortedMaps[0];
    }, [initialMapId, latestLocationId, sortedMaps]);

    const [displayedMapId, setDisplayedMapId] = useState(preferredMap?.id || '');

    useEffect(() => {
        if (!displayedMapId || !sortedMaps.some(map => map.id === displayedMapId)) {
            setDisplayedMapId(preferredMap?.id || '');
        }
    }, [displayedMapId, preferredMap, sortedMaps]);

    const displayedMap = sortedMaps.find(map => map.id === displayedMapId) || preferredMap;
    const configuredBackgroundImageUrl = stage().getConfiguration().backgroundImageUrl?.trim();
    const cachedBackgroundImageUrl = useCachedImageUrl(configuredBackgroundImageUrl);
    const screenBackgroundImage = cachedBackgroundImageUrl
        ? `linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%), url(${cachedBackgroundImageUrl})`
        : 'radial-gradient(900px 560px at 18% 12%, color-mix(in srgb, var(--agenda-accent-primary) 22%, transparent), transparent 62%), radial-gradient(840px 520px at 82% 88%, color-mix(in srgb, var(--agenda-highlight) 18%, transparent), transparent 64%), linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%)';
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

    const { width: viewportWidth, height: viewportHeight } = mapViewportSize;
    const { width: imageWidth, height: imageHeight } = mapImageSize;
    const hasMeasuredMap = Boolean(viewportWidth && viewportHeight && imageWidth && imageHeight);

    const fitMode: MapFitMode = displayedMap.fitMode === 'contain' ? 'contain' : 'cover';
    const isContained = fitMode === 'contain';
    const imageSize = { width: imageWidth, height: imageHeight };

    // The editor stores coordinates in its fixed 16:9 preview space. Map a point from that
    // space onto the source image so it can be projected through the runtime fit.
    const toSourceCoordinates = (x: number, y: number) => previewToImageCoordinates(fitMode, imageSize, x, y);

    const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
    const rawFocalPoint = hasMeasuredMap && !isContained
        ? toSourceCoordinates(displayedMap.focalPoint?.x ?? 0.5, displayedMap.focalPoint?.y ?? 0.5)
        : { x: 0.5, y: 0.5 };
    const focalPoint = { x: clampUnit(rawFocalPoint.x), y: clampUnit(rawFocalPoint.y) };

    const getMarkerPosition = (x: number, y: number, markerSize: number, contentHeight = 0): { style: { left: string; top: string } } => {
        let left = x;
        let top = y;

        if (hasMeasuredMap) {
            const source = toSourceCoordinates(x, y);
            // Matches the background-size/position used to render the map so markers track the image.
            const rendered = getMapImageRect(fitMode, { width: viewportWidth, height: viewportHeight }, imageSize, focalPoint);
            left = (rendered.left + source.x * rendered.width) / viewportWidth;
            top = (rendered.top + source.y * rendered.height) / viewportHeight;
        }

        // Keep markers clear of the viewport edges so nothing is clipped by the focal shift.
        if (viewportWidth && viewportHeight) {
            const marginX = (markerSize / 2 + 10) / viewportWidth;
            const marginY = (markerSize) / viewportHeight;
            const bottomMargin = (markerSize / 2 + contentHeight + 10) / viewportHeight;
            left = marginX * 2 >= 1 ? 0.5 : Math.min(1 - marginX, Math.max(marginX, left));
            top = marginY + Math.max(marginY, bottomMargin) >= 1 ? 0.5 : Math.min(1 - Math.max(marginY, bottomMargin), Math.max(marginY, top));
        }

        return { style: { left: `${left * 100}%`, top: `${top * 100}%` } };
    };

    return (
        <>
            <Box sx={{ width: embedded ? '100%' : '100vw', height: embedded ? '100%' : '100dvh', boxSizing: 'border-box', p: embedded ? 0 : { xs: '12px', md: '18px' }, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden', backgroundImage: embedded ? undefined : screenBackgroundImage, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
                {!embedded && <Box sx={{ flexShrink: 0 }}>
                    <GlobalStatBar
                        stage={stage}
                        isVerticalLayout={isVerticalLayout}
                        onActivate={handleAction}
                        buttons={
                            <>
                                {stage().areEventsEnabled() && (
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.CALENDAR)}
                                    onMouseEnter={() => setTooltip('Switch to calendar', EventAvailable)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: '8px 10px' }}
                                >
                                    <EventAvailable fontSize="small" />
                                </Button>
                                )}
                                {!isVerticalLayout && (
                                    <Button variant="secondary" onClick={() => setShowContentManagement(true)} onMouseEnter={() => setTooltip('Manage configuration, actors, locations, maps, and more', EditNote)} onMouseLeave={clearTooltip} style={{ padding: '8px 10px' }}><EditNote fontSize="small" /></Button>
                                )}
                                <Button variant="secondary" onClick={() => setScreenType(ScreenType.MENU)} onMouseEnter={() => setTooltip('Main menu', MenuRounded)} onMouseLeave={clearTooltip} style={{ padding: '8px 10px' }}><MenuRounded fontSize="small" /></Button>
                            </>
                        }
                    />
                </Box>}

                <Box ref={mapViewportRef} sx={{ position: 'relative', isolation: 'isolate', flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--agenda-line-strong)', borderRadius: '8px', background: 'color-mix(in srgb, var(--agenda-surface-base) 90%, black 10%)' }}>
                        {!embedded && <AnimatePresence mode="wait">
                            <motion.div
                                key={`${displayedMap.id}-label`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.28, ease: 'easeInOut' }}
                                style={{ position: 'absolute', top: 0, left: 0, zIndex: 3, maxWidth: 'min(72%, 800px)', pointerEvents: 'none' }}
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
                        </AnimatePresence>}
                        <AnimatePresence initial={false}>
                            <motion.div
                                key={displayedMap.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.45, ease: 'easeInOut' }}
                                style={{ position: 'absolute', inset: 0, backgroundImage: displayedMapImageUrl ? `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.16)), url(${displayedMapImageUrl})` : 'linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.16))', backgroundColor: isContained && displayedMap.fillColor ? displayedMap.fillColor : undefined, backgroundSize: fitMode, backgroundPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`, backgroundRepeat: 'no-repeat' }}
                            >
                                {displayedMap.links.map((link, index) => {
                                    const isButton = link.type === 'button';
                                    const isMarker = link.type === 'marker';
                                    const markerControl = isMarker
                                        ? (stage().getConfiguration().controls || []).find(control => control.id === (link.markerControlId || link.markerId) && control.type === 'marker')
                                        : undefined;
                                    if (isMarker && !markerControl) {
                                        return null;
                                    }
                                    const markerContent = isMarker ? (link.content || link.input || link.markerContent || '') : '';
                                    const markerVariables = markerControl ? markerVariableBindings(markerControl.markerInputType, markerContent) : undefined;
                                    const markerContext = isMarker ? {
                                        ...stage().getScheduleContext(save),
                                        skitState: stage().getSkitConditionState(),
                                        resolveValue: (value: unknown, type: StatType) => stage().resolveValue(value, type, save, [], markerVariables),
                                        ...(markerControl?.markerInputType === 'actor' ? { currentActor: save.actors?.[markerContent] } : {}),
                                        ...(markerControl?.markerInputType === 'location' ? { currentLocation: save.atlas?.[markerContent] } : {}),
                                        ...(markerControl?.markerInputType === 'item' ? { currentItem: save.inventory?.find(item => item.id === markerContent) } : {}),
                                    } : undefined;
                                    if (isMarker && markerControl && markerContext && !isControlAvailable(markerControl, markerContext)) {
                                        return null;
                                    }
                                    const childId = isButton || isMarker ? '' : String(stage().resolveValue(link.childId, 'location', save));
                                    const linkedLocation = isButton || isMarker ? undefined : save.atlas?.[childId];
                                    const linkedMap = isButton || isMarker ? undefined : sortedMaps.find(map => map.id === childId);
                                    if (!isButton && !isMarker && !linkedLocation && !linkedMap) {
                                        return null;
                                    }
                                    if (linkedLocation && !stage().isLocationVisible(linkedLocation.id)) {
                                        return null;
                                    }
                                    const availability = isMarker
                                        ? { visible: true, enabled: true }
                                        : getMapLinkAvailability(link, stage().getScheduleContext(save));
                                    if (!availability.visible) {
                                        return null;
                                    }
                                    const markerKey = `${displayedMap.id}-${index}`;
                                    const locationImageUrl = getLocationImageUrl(linkedLocation, stage());
                                    const linkedMapImageUrl = getMapImageUrl(linkedMap, stage());
                                    const currentEvent = linkedLocation ? stage().getCurrentLocationEvent(linkedLocation.id) : null;
                                    const canVisitLocation = linkedLocation ? stage().canVisitLocation(linkedLocation.id) : false;
                                    const markerName = isMarker
                                        ? processLoreText(markerControl?.label?.trim() || markerControl?.name?.trim() || markerContent || 'Marker', stage(), undefined, markerVariables, undefined, { icons: 'token' })
                                        : isButton ? processLoreText(link.label?.trim() || link.name?.trim() || 'Button', stage(), undefined, undefined, undefined, { icons: 'token' }) : currentEvent?.name || (linkedLocation?.name ? getLocationName(linkedLocation.id, stage()) : linkedMap?.name) || 'Unnamed';
                                    // Plain-text name for aria/portrait labels, which cannot carry inline icons.
                                    const plainMarkerName = stripLoreIcons(markerName);
                                    const ButtonIcon = isMarker
                                        ? (markerControl?.iconName ? resolveIcon(String(stage().resolveValue(markerControl.iconName, 'text', save, [], markerVariables))) : TouchApp)
                                        : isButton && link.iconName ? resolveIcon(link.iconName, stage()) : TouchApp;
                                    const markerSize = isVerticalLayout ? 48 : 64;
                                    const actorPortraitSize = isVerticalLayout ? 28 : 40;
                                    const isInteractive = availability.enabled && Boolean(isMarker || isButton || linkedMap || canVisitLocation);
                                    const contentValues = isMarker && markerControl?.contentList
                                        ? [...new Set(normalizeReferenceListValue(stage().resolveValue(markerControl.contentList.values, markerControl.contentList.kind === 'actor'
                                            ? 'actorList'
                                            : markerControl.contentList.kind === 'item'
                                                ? 'itemList'
                                                : markerControl.contentList.kind === 'location'
                                                    ? 'locationList'
                                                    : 'contentList', save, [], markerVariables)))]
                                        : isButton && link.contentList
                                            ? [...new Set(normalizeReferenceListValue(stage().resolveValue(link.contentList.values, link.contentList.kind === 'mixed' ? 'contentList' : `${link.contentList.kind}List`, save)))]
                                            : [];
                                    const contentWidth = Math.min(200, Math.max(0, mapViewportSize.width - 16) || 200, 12 + contentValues.length * actorPortraitSize - Math.max(0, contentValues.length - 1) * Math.round(actorPortraitSize * 0.32));
                                    const markerPosition = getMarkerPosition(link.coordinates.x, link.coordinates.y, markerSize, contentValues.length ? actorPortraitSize * 5 / 6 + 8 : 0);
                                    const handleMarkerClick = () => {
                                        if (!isInteractive) return;
                                        if (isMarker && markerControl) {
                                            let skit: Skit | null;
                                            try {
                                                skit = stage().runControlActions(markerControl, markerVariables);
                                            } catch (error) {
                                                console.error('Failed to run marker actions:', error);
                                                stage().showPriorityMessage(`Failed to run marker actions: ${error instanceof Error ? error.message : String(error)}`);
                                                handleAction();
                                                return;
                                            }
                                            handleAction(skit);
                                            return;
                                        }
                                        if (isButton) {
                                            let skit: Skit | null;
                                            try {
                                                skit = stage().runButtonActions(link.actions || []);
                                            } catch (error) {
                                                console.error('Failed to run map button actions:', error);
                                                stage().showPriorityMessage(`Failed to run button actions: ${error instanceof Error ? error.message : String(error)}`);
                                                handleAction();
                                                return;
                                            }
                                            handleAction(skit);
                                            return;
                                        }
                                        if (linkedMap) {
                                            setDisplayedMapId(linkedMap.id);
                                            return;
                                        }
                                        if (linkedLocation) {
                                            const skit = stage().startLocationVisit(linkedLocation.id);
                                            if (skit) {
                                                if (embedded) {
                                                    handleAction(skit);
                                                }
                                                setScreenType(ScreenType.SKIT);
                                            }
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
                                                        aria-label={linkedMap ? `Open map ${plainMarkerName}` : currentEvent ? `${linkedLocation?.name}: ${currentEvent.name}` : plainMarkerName}
                                                        disabled={!isInteractive}
                                                        onClick={handleMarkerClick}
                                                        onMouseEnter={() => isMarker ? setTooltip(processLoreText(markerControl?.description || markerControl?.label || markerName, stage(), undefined, markerVariables).trim() || null, markerControl?.iconName ? ButtonIcon : undefined) : undefined}
                                                        onMouseLeave={clearTooltip}
                                                        isInteractive={isInteractive}
                                                        markerSize={markerSize}
                                                        style={{ position: 'absolute', ...markerPosition.style, height: markerSize, padding: 0, display: 'flex', alignItems: 'center', overflow: 'visible', borderRadius: markerSize / 2, border: `2px solid ${currentEvent ? 'var(--agenda-highlight)' : 'var(--agenda-text-primary)'}`, background: 'color-mix(in srgb, var(--agenda-surface-base) 82%, transparent)', boxShadow: '0 4px 14px rgba(0,0,0,.7)', color: 'var(--agenda-text-primary)', cursor: isInteractive ? 'pointer' : 'not-allowed' }}
                                                    >
                                                        <span style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', overflow: 'hidden', borderRadius: markerSize / 2 }}>
                                                        <span style={{ position: 'relative', width: markerSize - 4, height: markerSize - 4, flex: `0 0 ${markerSize - 4}px`, display: 'grid', placeItems: 'center', borderRadius: '50%', backgroundImage: markerImageUrl ? `url(${markerImageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                                            {!markerImageUrl && (isButton || isMarker ? <ButtonIcon sx={{ fontSize: markerSize / 2 }} /> : <MapRounded fontSize="small" />)}
                                                        </span>
                                                        </span>
                                                        {isInteractive && !isButton && !isMarker && (
                                                            <span style={{ position: 'absolute', top: -2, left: -2, display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: '50%', background: 'var(--agenda-highlight)', color: 'var(--agenda-surface-base)', boxShadow: '0 1px 4px rgba(0,0,0,.6)' }}>
                                                                {linkedMap ? <ArrowOutward sx={{ fontSize: 11 }} /> : <PlayArrow sx={{ fontSize: 11 }} />}
                                                            </span>
                                                        )}
                                                    </MapMarkerButton>
                                                );
                                            }}
                                        </CachedBackgroundUrl>
                                        {linkedLocation && (
                                            <div style={{ position: 'absolute', ...markerPosition.style, transform: `translate(-50%, calc(-50% + ${markerSize / 2 + actorPortraitSize / 3}px))`, zIndex: 3 }}>
                                                <LocationActorPortraits
                                                    locationId={linkedLocation.id}
                                                    stage={stage()}
                                                    size={actorPortraitSize}
                                                />
                                            </div>
                                        )}
                                        {(isMarker || (isButton && link.contentList)) && contentValues.length > 0 && (
                                            <div
                                                style={{ position: 'absolute', ...markerPosition.style, left: `clamp(${contentWidth / 2 + 8}px, ${markerPosition.style.left}, calc(100% - ${contentWidth / 2 + 8}px))`, transform: `translate(-50%, calc(-50% + ${markerSize / 2 + actorPortraitSize / 3}px))`, width: contentWidth, zIndex: 3 }}
                                            >
                                                <ContentListPortraits kind={isMarker ? (markerControl?.contentList.kind === 'actor' || markerControl?.contentList.kind === 'item' || markerControl?.contentList.kind === 'location' ? markerControl.contentList.kind : undefined) : link.contentList?.kind === 'mixed' ? undefined : link.contentList?.kind} values={contentValues} stage={stage()} label={`${plainMarkerName} contents`} variant="overlay" size={actorPortraitSize} />
                                            </div>
                                        )}
                                        </Fragment>
                                    );
                                })}
                            </motion.div>
                        </AnimatePresence>
                    {overlay}
                </Box>

                {!embedded && <ControlDock stage={stage} isVerticalLayout={isVerticalLayout} onActivate={handleAction} />}
            </Box>
            {showContentManagement && <ContentManagementScreen stage={stage} onClose={() => { stage().saveGame(); setShowContentManagement(false); handleAction(); }} />}
        </>
    );
};