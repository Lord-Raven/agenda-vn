import { FC, ReactNode, useEffect, useState } from 'react';
import { ArrowBackRounded, ArrowForwardRounded } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Stage } from '../Stage';
import { ContentType } from '../content/Condition';
import { Control } from '../content/Control';
import { Skit } from '../content/Skit';
import { useTooltip } from './TooltipContext';
import { Button } from './UiComponents';
import { ContentCardControl } from './ContentCardControl';

export const CONTENT_CARD_LIST_EDGE_MASK = 'linear-gradient(to bottom, transparent, black 24px, black calc(100% - 24px), transparent)';

export type ContentCard = {
    key: string;
    kind: ContentType;
    id: string;
    control?: Control;
    header?: string;
    onAction?: (skit?: Skit | null) => void;
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

// A paged vertical column of horizontal content cards: one header page at a time with previous/next
// navigation. Pages without cards are hidden. Shared by the default location list and List Screens.
export const ContentCardList: FC<ContentCardListProps> = ({ stage, pages, isVerticalLayout, emptyTitle = 'Nothing Here', emptyMessage = 'Nothing is available yet.' }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const reduceMotion = useReducedMotion();
    const visiblePages = pages.map(page => ({
        ...page,
        cards: page.cards.filter(card => {
            const control = card.control || stage().getCardControl(card.kind);
            return control && stage().resolveCardState(control, card.kind, card.id, card.header).visible;
        }),
    })).filter(page => page.cards.length > 0);
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
    const control = card.control || stage().getCardControl(card.kind);
    if (!control) return null;
    const state = stage().resolveCardState(control, card.kind, card.id, card.header);
    if (!state.visible) return null;
    const interactive = (!!card.onClick || control.actions.length > 0) && !card.disabled && state.available;
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
    const subtitle = card.subtitle ? (
        <Typography sx={{ color: card.highlightSubtitle ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)', fontSize: '0.76rem', fontWeight: card.highlightSubtitle ? 700 : 500, mt: 0.5 }}>
            {card.subtitle}
        </Typography>
    ) : null;

    return (
        <motion.div {...motionProps} style={{ width: '100%', flexShrink: 0 }}>
            <ContentCardControl stage={stage} control={control} kind={card.kind} id={card.id} header={card.header}
                compact={isVerticalLayout} disabled={card.disabled} subtitle={subtitle} trailing={card.trailing}
                onClick={card.onClick} onAction={card.onAction} />
        </motion.div>
    );
};
