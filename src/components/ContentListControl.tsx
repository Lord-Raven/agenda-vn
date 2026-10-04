import { FC, useLayoutEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ChevronLeft, ChevronRight, Inventory2, Person, Place } from '@mui/icons-material';
import { Stage } from '../Stage';
import { ContentListDisplay } from '../content/Control';
import { ReferenceKind } from '../content/Stat';
import { ActorPortrait } from './ActorPortrait';
import { ItemPortrait } from './ItemPortrait';
import { LocationPortrait } from './LocationPortrait';
import { ReferenceMultiSelect } from './UiComponents';

interface ContentListControlProps {
    kind: ReferenceKind;
    values: string[];
    stage: Stage;
    display: ContentListDisplay;
    label: string;
    onChange?: (values: string[]) => void;
}

interface ContentListPortraitsProps {
    kind: ReferenceKind;
    values: string[];
    stage: Stage;
    label: string;
}

const PORTRAIT_SIZE = 36;
const PORTRAIT_OVERLAP = 6;

export const ContentListPortraits: FC<ContentListPortraitsProps> = ({ kind, values, stage, label }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [navigation, setNavigation] = useState({ overflow: false, previous: false, next: false });
    const save = stage.getSave();

    const updateNavigation = () => {
        const root = rootRef.current;
        const viewport = viewportRef.current;
        const track = trackRef.current;
        if (!root || !viewport || !track) {
            return;
        }
        setNavigation({
            overflow: track.offsetWidth > root.clientWidth,
            previous: viewport.scrollLeft > 1,
            next: viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1,
        });
    };

    useLayoutEffect(() => {
        const observer = new ResizeObserver(updateNavigation);
        [rootRef.current, viewportRef.current, trackRef.current].forEach((element) => {
            if (element) {
                observer.observe(element);
            }
        });
        updateNavigation();
        return () => observer.disconnect();
    }, [values]);

    const scroll = (direction: number) => {
        const viewport = viewportRef.current;
        if (viewport) {
            viewport.scrollBy({
                left: direction * Math.max(PORTRAIT_SIZE - PORTRAIT_OVERLAP, viewport.clientWidth - PORTRAIT_SIZE),
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
        }
    };

    const edgeMask = navigation.overflow
        ? `linear-gradient(to right, ${navigation.previous ? 'transparent' : 'black'}, black 12px, black calc(100% - 12px), ${navigation.next ? 'transparent' : 'black'})`
        : 'none';

    return (
        <Box ref={rootRef} role="group" aria-label={label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', width: '100%', minWidth: 0 }}>
            {navigation.overflow && (
                <IconButton size="small" aria-label={`Previous ${label}`} disabled={!navigation.previous} onClick={() => scroll(-1)} sx={{ padding: 0, color: 'var(--agenda-text-primary)' }}>
                    <ChevronLeft />
                </IconButton>
            )}
            <Box
                ref={viewportRef}
                onScroll={updateNavigation}
                sx={{
                    flex: 1,
                    minWidth: 0,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    scrollSnapType: 'x proximity',
                    maskImage: edgeMask,
                    WebkitMaskImage: edgeMask,
                    '&::-webkit-scrollbar': { display: 'none' },
                }}
            >
                {/* A horizontal scroll container also clips vertically, so reserve room for scaled portraits and shadows. */}
                <Box ref={trackRef} role="list" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '16px 8px', width: 'max-content', overflow: 'visible' }}>
                    {values.length === 0 && <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>None</span>}
                    {values.map((id, index) => {
                        const actor = kind === 'actor' ? save.actors?.[id] : undefined;
                        const item = kind === 'item' ? save.inventory?.find((candidate) => candidate.id === id) : undefined;
                        const location = kind === 'location' ? save.atlas?.[id] : undefined;
                        const name = actor ? actor.displayName ?? actor.name : item?.name ?? location?.name ?? `Unknown ${kind}`;
                        const FallbackIcon = kind === 'actor' ? Person : kind === 'item' ? Inventory2 : Place;
                        return (
                            <Tooltip key={`${id}-${index}`} title={name} arrow enterTouchDelay={0}>
                                <Box
                                    role="listitem"
                                    tabIndex={0}
                                    aria-label={name}
                                    sx={{
                                        flexShrink: 0,
                                        marginLeft: index > 0 ? `-${PORTRAIT_OVERLAP}px` : 0,
                                        position: 'relative',
                                        overflow: 'visible',
                                        scrollSnapAlign: 'start',
                                        borderRadius: '50%',
                                        '&:hover, &:focus-visible': { zIndex: 1, transform: 'scale(1.1)', outline: '2px solid var(--agenda-highlight)', outlineOffset: 1 },
                                        '@media (prefers-reduced-motion: no-preference)': { transition: 'transform 0.15s ease-out' },
                                    }}
                                >
                                    {actor ? <ActorPortrait actor={actor} stage={stage} size={PORTRAIT_SIZE} title={name} />
                                        : item ? <ItemPortrait item={item} stage={stage} width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} borderRadius="50%" title={name} />
                                            : location ? <LocationPortrait location={location} stage={stage} width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} borderRadius="50%" title={name} />
                                                : <Box sx={{ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, display: 'grid', placeItems: 'center', borderRadius: '50%', border: '2px solid var(--agenda-line-strong)', color: 'var(--agenda-text-muted)' }}><FallbackIcon /></Box>}
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>
            </Box>
            {navigation.overflow && (
                <IconButton size="small" aria-label={`Next ${label}`} disabled={!navigation.next} onClick={() => scroll(1)} sx={{ padding: 0, color: 'var(--agenda-text-primary)' }}>
                    <ChevronRight />
                </IconButton>
            )}
        </Box>
    );
};

export const ContentListControl: FC<ContentListControlProps> = ({ kind, values, stage, display, label, onChange }) => {
    const save = stage.getSave();
    const carousel = display !== 'abbreviated';
    const actors = Object.values(save.actors || {});
    const items = save.inventory || [];
    const locations = Object.values(save.atlas || {});

    return (
        <>
            {carousel && <ContentListPortraits kind={kind} values={values} stage={stage} label={label} />}
            {(!carousel || onChange) && (
                <ReferenceMultiSelect
                    kind={kind}
                    values={values}
                    onChange={(nextValues) => onChange?.(nextValues)}
                    actors={actors.filter((actor) => actor.active !== false)}
                    items={items.filter((item) => item.active !== false)}
                    locations={locations.filter((location) => location.active !== false)}
                    stage={stage}
                    disabled={!onChange}
                    renderButton={carousel ? () => <span style={{ fontSize: 12 }}>Edit {label}</span> : undefined}
                />
            )}
        </>
    );
};
