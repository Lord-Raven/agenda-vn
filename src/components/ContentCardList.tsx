import { FC, ReactNode, useEffect, useState } from 'react';
import { ArrowBackRounded, ArrowForwardRounded } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Stage } from '../Stage';
import { ContentType } from '../content/Condition';
import { getLocationImageUrl } from '../content/Location';
import { useTooltip } from './TooltipContext';
import { Button } from './UiComponents';
import { CachedBackgroundUrl } from './CachedImage';
import { ActorPortrait } from './ActorPortrait';
import { ItemPortrait } from './ItemPortrait';

export const CONTENT_CARD_LIST_EDGE_MASK = 'linear-gradient(to bottom, transparent, black 24px, black calc(100% - 24px), transparent)';

export type ContentCard = {
    key: string;
    kind: ContentType;
    id: string;
    subtitle?: ReactNode;
    highlightSubtitle?: boolean;
    disabled?: boolean;
    // Cards without a click handler render as non-interactive panels.
    onClick?: () => void;
    // Mixed content shown at the card's right end (e.g. present actors or stat values).
    trailing?: ReactNode;
};

export type ContentCardPage = {
    key: string;
    title: string;
    cards: ContentCard[];
};

interface ContentCardListProps {
    stage: () => Stage;
    pages: ContentCardPage[];
    isVerticalLayout: boolean;
    emptyTitle?: string;
    emptyMessage?: string;
}

const headerSideTextSx = {
    color: 'var(--agenda-text-muted)',
    fontFamily: 'var(--agenda-font-flavor)',
    fontWeight: 600,
    fontSize: { xs: '0.8rem', md: '1.15rem' },
    opacity: 0.58,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const cardTitleSx = {
    color: 'var(--agenda-text-primary)',
    fontFamily: 'var(--agenda-font-flavor)',
    fontWeight: 700,
    lineHeight: 1.15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

// A paged vertical column of horizontal content cards: one header page at a time with previous/next
// navigation. Pages without cards are hidden. Shared by the default location list and List Screens.
export const ContentCardList: FC<ContentCardListProps> = ({ stage, pages, isVerticalLayout, emptyTitle = 'Nothing Here', emptyMessage = 'Nothing is available yet.' }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const reduceMotion = useReducedMotion();
    const visiblePages = pages.filter(page => page.cards.length > 0);
    const pageKeys = visiblePages.map(page => page.key);
    const [selectedKey, setSelectedKey] = useState<string>(pageKeys[0] || '');
    const pageKeySignature = JSON.stringify(pageKeys);

    useEffect(() => {
        if (!pageKeys.includes(selectedKey)) {
            setSelectedKey(pageKeys[0] || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageKeySignature, selectedKey]);

    const selectedIndex = Math.max(0, pageKeys.indexOf(selectedKey));
    const currentPage = visiblePages[selectedIndex];
    const pageCount = visiblePages.length;
    // Two pages never wrap, so each arrow points at the only other page; three or more cycle.
    const previousPage = pageCount <= 1 ? undefined
        : pageCount === 2 ? visiblePages[selectedIndex - 1]
            : visiblePages[(selectedIndex - 1 + pageCount) % pageCount];
    const nextPage = pageCount <= 1 ? undefined
        : pageCount === 2 ? visiblePages[selectedIndex + 1]
            : visiblePages[(selectedIndex + 1) % pageCount];

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                    alignItems: 'center',
                    gap: 1,
                    mt: 1,
                    mb: 1.5,
                    width: '100%',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, minWidth: 0 }}>
                    {previousPage && (
                        <>
                            <Typography sx={headerSideTextSx}>{previousPage.title}</Typography>
                            <Button
                                variant="secondary"
                                onClick={() => setSelectedKey(previousPage.key)}
                                onMouseEnter={() => setTooltip(`Previous: ${previousPage.title}`, ArrowBackRounded)}
                                onMouseLeave={clearTooltip}
                                aria-label={`Previous: ${previousPage.title}`}
                                style={{ padding: '8px 10px', flexShrink: 0 }}
                            >
                                <ArrowBackRounded fontSize="small" />
                            </Button>
                        </>
                    )}
                </Box>

                <Box sx={{ textAlign: 'center', minWidth: 0, maxWidth: { xs: '46vw', md: 'min(42vw, 620px)' } }}>
                    <Typography
                        component="h2"
                        sx={{
                            m: 0,
                            color: 'var(--agenda-text-primary)',
                            fontFamily: 'var(--agenda-font-flavor)',
                            fontWeight: 700,
                            fontSize: { xs: '1.7rem', md: '2.5rem' },
                            letterSpacing: '0.04em',
                            lineHeight: 1,
                            textShadow: '0 3px 14px color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {currentPage ? currentPage.title : emptyTitle}
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    {nextPage && (
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setSelectedKey(nextPage.key)}
                                onMouseEnter={() => setTooltip(`Next: ${nextPage.title}`, ArrowForwardRounded)}
                                onMouseLeave={clearTooltip}
                                aria-label={`Next: ${nextPage.title}`}
                                style={{ padding: '8px 10px', flexShrink: 0 }}
                            >
                                <ArrowForwardRounded fontSize="small" />
                            </Button>
                            <Typography sx={headerSideTextSx}>{nextPage.title}</Typography>
                        </>
                    )}
                </Box>
            </Box>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateRows: 'minmax(0, 1fr)',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    maskImage: CONTENT_CARD_LIST_EDGE_MASK,
                    WebkitMaskImage: CONTENT_CARD_LIST_EDGE_MASK,
                }}
            >
                <AnimatePresence>
                    <Box
                        component={motion.div}
                        key={currentPage?.key ?? ''}
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduceMotion ? 0 : -16, pointerEvents: 'none' }}
                        transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
                        sx={{
                            gridArea: '1 / 1',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1.25,
                            minHeight: 0,
                            overflowX: 'hidden',
                            overflowY: 'auto',
                            // Keep resting cards outside the fades and leave room for the hover shift.
                            py: '24px',
                            pr: '14px',
                        }}
                    >
                        {!currentPage && (
                            <Box
                                sx={{
                                    minHeight: 220,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '16px',
                                    border: '1px solid var(--agenda-panel-border)',
                                    background: 'linear-gradient(180deg, var(--agenda-panel-surface), color-mix(in srgb, var(--agenda-surface-base) 86%, transparent))',
                                    color: 'var(--agenda-text-muted)',
                                    textAlign: 'center',
                                    px: 2,
                                }}
                            >
                                <Typography sx={{ fontSize: '0.95rem' }}>{emptyMessage}</Typography>
                            </Box>
                        )}
                        {currentPage?.cards.map((card, index) => (
                            <ContentCardView key={card.key} card={card} index={index} stage={stage} isVerticalLayout={isVerticalLayout} reduceMotion={!!reduceMotion} />
                        ))}
                    </Box>
                </AnimatePresence>
            </Box>
        </Box>
    );
};

interface ContentCardViewProps {
    card: ContentCard;
    index: number;
    stage: () => Stage;
    isVerticalLayout: boolean;
    reduceMotion: boolean;
}

export const ContentCardView: FC<ContentCardViewProps> = ({ card, index, stage, isVerticalLayout, reduceMotion }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const interactive = !!card.onClick && !card.disabled;
    const delay = reduceMotion ? 0 : Math.min(index * 0.04, 0.18);
    const motionProps = {
        initial: { opacity: 0, y: reduceMotion ? 0 : 16 },
        animate: { opacity: 1, y: 0 },
        whileHover: interactive ? { x: 10 } : undefined,
        transition: {
            opacity: { duration: reduceMotion ? 0 : 0.22, delay },
            y: { duration: reduceMotion ? 0 : 0.22, delay },
            x: { duration: 0.2, ease: 'easeOut' },
        },
    };
    const shellStyle: React.CSSProperties = {
        width: '100%', flexShrink: 0, padding: 0, border: 0, background: 'transparent', textAlign: 'left', color: 'inherit',
        cursor: interactive ? 'pointer' : card.onClick ? 'not-allowed' : 'default', opacity: card.disabled ? 0.56 : 1,
    };
    const shell = (body: ReactNode) => card.onClick
        ? <motion.button type="button" disabled={card.disabled} onClick={card.onClick} {...motionProps} style={shellStyle}>{body}</motion.button>
        : <motion.div {...motionProps} style={shellStyle}>{body}</motion.div>;
    const subtitle = card.subtitle ? (
        <Typography sx={{ color: card.highlightSubtitle ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)', fontSize: '0.76rem', fontWeight: card.highlightSubtitle ? 700 : 500, mt: 0.5 }}>
            {card.subtitle}
        </Typography>
    ) : null;

    if (card.kind === 'location') {
        const location = save.atlas?.[card.id];
        const imageUrl = getLocationImageUrl(location, stageInstance);
        const focalPoint = location?.focalPoint || { x: 0.5, y: 0.5 };
        const borderColor = location?.themeColor || 'var(--agenda-accent-primary)';
        const shade = 'linear-gradient(110deg, color-mix(in srgb, var(--agenda-surface-base) 84%, transparent) 0%, color-mix(in srgb, var(--agenda-surface-base) 55%, transparent) 42%, color-mix(in srgb, var(--agenda-surface-base) 80%, transparent) 100%)';
        return (
            <CachedBackgroundUrl url={imageUrl}>
                {(cachedImageUrl) => shell(
                    <Box
                        data-content-card="location"
                        sx={{
                            position: 'relative',
                            minHeight: isVerticalLayout ? 180 : 210,
                            borderRadius: '18px',
                            overflow: 'hidden',
                            border: `1px solid ${borderColor}`,
                            backgroundImage: cachedImageUrl ? `${shade}, url(${cachedImageUrl})` : shade,
                            backgroundSize: 'cover',
                            backgroundPosition: `${focalPoint.x * 100}% ${focalPoint.y * 100}%`,
                            boxShadow: '0 10px 28px color-mix(in srgb, var(--agenda-surface-base) 55%, transparent)',
                        }}
                    >
                        {card.trailing && (
                            <Box sx={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>{card.trailing}</Box>
                        )}
                        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--agenda-surface-base) 20%, transparent) 0%, color-mix(in srgb, var(--agenda-surface-base) 14%, transparent) 36%, color-mix(in srgb, var(--agenda-surface-base) 76%, transparent) 100%)' }} />
                        <Box sx={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', p: { xs: 1.5, md: 2 } }}>
                            <Box
                                sx={{
                                    maxWidth: 'min(100%, 540px)',
                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 72%, transparent)',
                                    border: '1px solid color-mix(in srgb, var(--agenda-text-primary) 18%, transparent)',
                                    backdropFilter: 'blur(8px)',
                                    borderRadius: '12px',
                                    px: 1.4,
                                    py: 1.1,
                                }}
                            >
                                <Typography sx={{ ...cardTitleSx, fontSize: { xs: '1.15rem', md: '1.45rem' }, textShadow: '0 2px 10px color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)' }}>
                                    {location?.name || 'Unnamed Location'}
                                </Typography>
                                {subtitle}
                            </Box>
                        </Box>
                    </Box>,
                )}
            </CachedBackgroundUrl>
        );
    }

    const actor = card.kind === 'actor' ? save.actors?.[card.id] : undefined;
    const item = card.kind === 'item' ? save.inventory?.find(candidate => candidate.id === card.id) : undefined;
    const name = actor ? actor.displayName || actor.name : item?.name || `Unknown ${card.kind}`;
    const themeColor = actor?.themeColor || item?.themeColor || 'var(--agenda-accent-primary)';
    const portraitSize = isVerticalLayout ? 48 : 60;
    return shell(
        <Box
            data-content-card={card.kind}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: 1.25, md: 1.75 },
                minHeight: portraitSize + 20,
                px: { xs: 1.25, md: 1.75 },
                py: 1.25,
                borderRadius: '14px',
                border: `1px solid color-mix(in srgb, ${themeColor} 55%, var(--agenda-line-subtle))`,
                background: `linear-gradient(110deg, color-mix(in srgb, ${themeColor} 16%, var(--agenda-surface-raised)) 0%, var(--agenda-surface-raised) 70%)`,
                boxShadow: '0 6px 18px color-mix(in srgb, var(--agenda-surface-base) 45%, transparent)',
            }}
        >
            <Box sx={{ flexShrink: 0, display: 'flex' }}>
                {actor ? (
                    <ActorPortrait actor={actor} stage={stageInstance} size={portraitSize} borderRadius="12px" objectPosition="center 20%" title={name}
                        style={{ border: `2px solid ${themeColor}` }} />
                ) : (
                    <ItemPortrait item={item} stage={stageInstance} width={portraitSize} height={portraitSize} borderRadius="12px" title={name}
                        style={{ border: `2px solid ${themeColor}` }} />
                )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ ...cardTitleSx, fontSize: { xs: '1.05rem', md: '1.25rem' }, whiteSpace: 'nowrap' }}>{name}</Typography>
                {subtitle}
            </Box>
            {card.trailing && <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', maxWidth: '50%' }}>{card.trailing}</Box>}
        </Box>,
    );
};
