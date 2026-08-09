import { FC, useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ScreenType } from './BaseScreen';
import { Stage } from '../Stage';
import { GlassPanel, Title } from './UiComponents';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_ATLAS_LOCATIONS, getLocationImageUrl } from '../content/Location';

/*
 * Loading screen that displays while content is being loaded.
 * Monitors the loadPromises and automatically transitions to the Studio screen when complete.
 */

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const CALENDAR_ROWS = 5;
const TOTAL_DAYS = DAY_LABELS.length * CALENDAR_ROWS; // 35
const LOADABLE_DAYS = 31;

interface LoadingScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
}

function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export const LoadingScreen: FC<LoadingScreenProps> = ({ stage, setScreenType }) => {
    const [progress, setProgress] = useState(0);
    const [animatedMarkedCount, setAnimatedMarkedCount] = useState(0);
    const seenPromiseKeysRef = useRef<Set<string>>(new Set());
    const hasObservedPromiseActivityRef = useRef(false);

    const bgQueueRef = useRef<string[]>([]);
    const bgQueueIndexRef = useRef(0);
    const [bgUrl, setBgUrl] = useState<string>(() => {
        const urls = shuffleArray(
            DEFAULT_ATLAS_LOCATIONS.map((location) => getLocationImageUrl(location)).filter(Boolean)
        );
        bgQueueRef.current = urls;
        bgQueueIndexRef.current = 0;
        return urls[0] ?? '';
    });

    useEffect(() => {
        const bgInterval = setInterval(() => {
            bgQueueIndexRef.current += 1;
            if (bgQueueIndexRef.current >= bgQueueRef.current.length) {
                bgQueueRef.current = shuffleArray(bgQueueRef.current);
                bgQueueIndexRef.current = 0;
            }
            setBgUrl(bgQueueRef.current[bgQueueIndexRef.current]);
        }, 10000);
        return () => clearInterval(bgInterval);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const currentStage = stage();
            const normalizedAnticipatedPromiseCount = Math.max(currentStage.anticipatedLoadingPromiseCount, 1);
            const loadPromises = currentStage.generationPromises;
            const currentPromiseKeys = Object.keys(loadPromises || {});
            const currentPromiseKeySet = new Set(currentPromiseKeys);

            if (currentPromiseKeys.length > 0) {
                hasObservedPromiseActivityRef.current = true;
            }

            currentPromiseKeys.forEach((key) => {
                seenPromiseKeysRef.current.add(key);
            });

            let nextCompletedPromiseCount = 0;
            seenPromiseKeysRef.current.forEach((key) => {
                if (!currentPromiseKeySet.has(key)) {
                    nextCompletedPromiseCount += 1;
                }
            });

            setProgress(Math.min((nextCompletedPromiseCount / normalizedAnticipatedPromiseCount) * 100, 100));

            if (currentPromiseKeys.length === 0 && hasObservedPromiseActivityRef.current) {
                console.log('Done loading');
                currentStage.saveGame();
                setScreenType(currentStage.getCurrentSkit() ? ScreenType.SKIT : ScreenType.MAP);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [setScreenType, stage]);

    const targetMarkedCount = Math.floor((progress / 100) * LOADABLE_DAYS);

    useEffect(() => {
        if (animatedMarkedCount === targetMarkedCount) {
            return;
        }

        // Draw one strike at a time so progress advances in a readable sequence.
        const timeout = setTimeout(() => {
            if (animatedMarkedCount < targetMarkedCount) {
                setAnimatedMarkedCount((prev) => Math.min(prev + 1, targetMarkedCount));
            } else {
                setAnimatedMarkedCount(targetMarkedCount);
            }
        }, 42);

        return () => clearTimeout(timeout);
    }, [animatedMarkedCount, targetMarkedCount]);

    return (
        <Box
            className="agenda-screen-root"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                width: '100vw',
                background: 'linear-gradient(160deg, #171b2d 0%, #1f2438 50%, #161a2a 100%)',
                position: 'relative',
                overflow: 'hidden',
                isolation: 'isolate',
            }}
        >
            <AnimatePresence>
                {bgUrl && (
                    <motion.div
                        key={bgUrl}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.35 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.8, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `url(${bgUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            zIndex: 0,
                        }}
                    />
                )}
            </AnimatePresence>
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background:
                        'radial-gradient(120% 100% at 12% 16%, rgba(138, 176, 204, 0.2) 0%, rgba(26, 30, 48, 0) 52%), radial-gradient(95% 95% at 86% 82%, rgba(137, 205, 135, 0.18) 0%, rgba(26, 30, 48, 0) 58%), linear-gradient(160deg, rgba(23,27,45,0.55) 0%, rgba(31,36,56,0.55) 50%, rgba(22,26,42,0.55) 100%)',
                    zIndex: 1,
                    pointerEvents: 'none',
                }}
            />
            <motion.div
                className="agenda-entrance"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', zIndex: 2 }}
            >
                <GlassPanel
                    variant="bright"
                    style={{
                        width: 'min(560px, 92vw)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '12px',
                        padding: '20px 22px 18px',
                    }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
                        <Title variant="glow" style={{ margin: 0, fontSize: 'clamp(1.2rem, 2.7vw, 1.65rem)' }}>
                            Generating Content...
                        </Title>
                        <Typography
                            sx={{
                                fontFamily: 'var(--agenda-font-display)',
                                fontSize: '0.85rem',
                                color: 'var(--agenda-text-muted)',
                                opacity: 0.8,
                                flexShrink: 0,
                            }}
                        >
                            {Math.round(progress)}%
                        </Typography>
                    </Box>

                    {/* Calendar grid */}
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '5px',
                        }}
                    >
                        {/* Day-of-week headers */}
                        {DAY_LABELS.map((label) => (
                            <Box
                                key={label}
                                sx={{
                                    textAlign: 'center',
                                    fontSize: '0.65rem',
                                    fontFamily: 'var(--agenda-font-base)',
                                    letterSpacing: '0.08em',
                                    color: 'var(--agenda-text-muted)',
                                    pb: '2px',
                                    opacity: 0.7,
                                }}
                            >
                                {label}
                            </Box>
                        ))}

                        {/* Day cells */}
                        {Array.from({ length: TOTAL_DAYS }).map((_, i) => {
                            const isLoadableDay = i < LOADABLE_DAYS;
                            const isMarked = isLoadableDay && i < animatedMarkedCount;
                            return (
                                <Box
                                    key={i}
                                    sx={{
                                        position: 'relative',
                                        aspectRatio: '1',
                                        borderRadius: '4px',
                                        border: '1px solid',
                                        borderColor: isMarked
                                            ? 'rgba(185, 143, 110, 0.35)'
                                            : isLoadableDay
                                                ? 'rgba(138, 176, 204, 0.2)'
                                                : 'rgba(14, 18, 30, 0.58)',
                                        background: isMarked
                                            ? 'rgba(185, 143, 110, 0.08)'
                                            : isLoadableDay
                                                ? 'rgba(138, 176, 204, 0.04)'
                                                : 'rgba(11, 14, 24, 0.64)',
                                        overflow: 'hidden',
                                        transition: 'border-color 0.3s, background 0.3s',
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            position: 'absolute',
                                            top: '3px',
                                            left: '4px',
                                            fontSize: 'clamp(0.5rem, 1.5vw, 0.7rem)',
                                            fontFamily: 'var(--agenda-font-display)',
                                            color: isMarked
                                                ? 'rgba(185, 143, 110, 0.55)'
                                                : isLoadableDay
                                                    ? 'var(--agenda-text-muted)'
                                                    : 'rgba(117, 132, 154, 0.42)',
                                            opacity: isMarked ? 0.6 : isLoadableDay ? 0.5 : 0.4,
                                            userSelect: 'none',
                                            lineHeight: 1,
                                            transition: 'color 0.3s, opacity 0.3s',
                                        }}
                                    >
                                        {isLoadableDay ? i + 1 : ''}
                                    </Typography>

                                    <AnimatePresence>
                                        {isMarked && (
                                            <motion.div
                                                key={`strike-${i}`}
                                                initial={{ scaleX: 0, opacity: 0 }}
                                                animate={{ scaleX: 1, opacity: 1 }}
                                                exit={{ scaleX: 0, opacity: 0 }}
                                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                                style={{
                                                    position: 'absolute',
                                                    width: '150%',
                                                    height: '1.6px',
                                                    background: 'rgba(185, 143, 110, 0.76)',
                                                    top: '50%',
                                                    left: '-25%',
                                                    borderRadius: '1px',
                                                    transform: 'translateY(-50%) rotate(-45deg)',
                                                    transformOrigin: 'left center',
                                                }}
                                            />
                                        )}
                                    </AnimatePresence>
                                </Box>
                            );
                        })}
                    </Box>
                </GlassPanel>
            </motion.div>
        </Box>
    );
};
