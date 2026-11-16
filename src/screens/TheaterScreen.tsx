import React, { FC, useCallback, useEffect } from "react";
import { Stage } from "../Stage";
import { BlurredBackground, NovelVisualizer, getActorVoiceVolume } from "@lord-raven/novel-visualizer";
import { NamePlate } from "../components/UiComponents";
import { ActorCard } from "../components/ActorCard";
import { useTooltip } from "../components/TooltipContext";
import { getEmotionImage, getOutfitById } from "../content/Actor";
import { accumulateOutcomes, Skit } from "../content/Skit";
import { getLocationImageUrl } from "../content/Location";
import { Outcome } from "../content/Outcome";
import { OutcomeDisplay } from "../components/OutcomeDisplay";
import { getActorOutfitsAtIndex, getActorsAtIndex, getSceneLocationIdAtIndex } from "./SkitScreen";
import { Emotion } from "../content/Emotion";
import { DEFAULT_TYPE_OUT_SPEED } from "./SettingsScreen";

import { PlayArrow, Close, VolumeUp, VolumeOff } from '@mui/icons-material';
import { IconButton } from '@mui/material';

interface TheaterScreenProps {
    stage: () => Stage;
    skit: Skit;
    onClose: () => void;
}

/**
 * Full-screen, read-only playback of a past skit. Presents the skit through NovelVisualizer
 * in its ineditable state so the user can step back through the scene without altering it.
 */
export const TheaterScreen: FC<TheaterScreenProps> = ({ stage, skit, onClose }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    // Shallow copy so playback never mutates the saved skit's currentIndex; start from the beginning.
    const [theaterSkit] = React.useState<Skit>(() => ({ ...skit, currentIndex: 0 }));
    const [, setSkitRevision] = React.useState(0);
    const [accumulatedOutcomes, setAccumulatedOutcomes] = React.useState<Outcome[]>([]);
    const [isVerticalLayout, setIsVerticalLayout] = React.useState<boolean>(stage().isVerticalLayout());
    const [isAudioEnabled, setIsAudioEnabled] = React.useState<boolean>(stage().getSave().enableTextToSpeech || true);
    const isTextToSpeechEnabled = stage().getSave().enableTextToSpeech;
    const isHapticsEnabled = stage().getSave().enableHaptics;

    const currentScriptIndex = Math.min(Math.max(theaterSkit.currentIndex || 0, 0), Math.max(theaterSkit.script.length - 1, 0));

    const currentLocationId = getSceneLocationIdAtIndex(theaterSkit, currentScriptIndex);
    const location = stage().getSave().atlas[currentLocationId || ''];
    const locationImageUrl = getLocationImageUrl(location);
    const actors = stage().getSave().actors;

    useEffect(() => {
        const handleResize = () => setIsVerticalLayout(stage().isVerticalLayout());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [stage]);

    // Close on Escape; capture so underlying screens' Escape handlers don't also fire.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [onClose]);

    useEffect(() => {
        const visibleScriptEntries = theaterSkit.script.slice(0, currentScriptIndex + 1);
        setAccumulatedOutcomes(accumulateOutcomes(visibleScriptEntries, stage()) || []);
    }, [theaterSkit, currentScriptIndex, stage]);

    const onSkitChange = useCallback(() => {
        // Keep skit object identity stable, but force this component to re-render.
        setSkitRevision(prev => prev + 1);
    }, []);

    // In read-only mode the continue button only submits at the final entry; treat that as closing.
    const handleSubmit = useCallback(async (_input: string, skitArg: Skit) => {
        onClose();
        return skitArg;
    }, [onClose]);

    const cornerButtonSx = {
        color: 'var(--agenda-accent-primary)',
        opacity: 0.8,
        '&:hover': {
            color: 'var(--agenda-text-muted)',
            backgroundColor: 'color-mix(in srgb, var(--agenda-accent-primary) 10%, transparent)'
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200 }}>
            <BlurredBackground imageUrl={locationImageUrl}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                    <NovelVisualizer
                        skit={theaterSkit}
                        readOnly={true}
                        renderNameplate={(actor: any) => {
                            if (!actor || !actor.name) return null;
                            return <NamePlate
                                actor={actor}
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    zIndex: 5
                                }}
                                includeRole={true}
                            />;
                        }}
                        typingSpeed={stage().getSave().typeOutSpeed ?? DEFAULT_TYPE_OUT_SPEED}
                        setTooltip={setTooltip}
                        isVerticalLayout={isVerticalLayout}
                        actors={actors}
                        playerActorId={stage().getSave().playerId}
                        getPresentActors={(_script, _index) =>
                            getActorsAtIndex(_script, _index, stage()) || []
                        }
                        getActorImageUrl={(actor, _script, index) => {
                            let emotion = Emotion.neutral;

                            if (theaterSkit.script && theaterSkit.script.length > 0 && index < theaterSkit.script.length) {
                                for (let j = index; j >= 0; j--) {
                                    const entry = theaterSkit.script[j];
                                    if (entry.actorEmotions && entry.actorEmotions[actor.id]) {
                                        emotion = entry.actorEmotions[actor.id];
                                        break;
                                    }
                                }
                            }

                            const outfitId = getActorOutfitsAtIndex(_script, index, stage().getSave().actors)[actor.id] || actor.outfitId;
                            return getEmotionImage(actor, emotion, stage(), outfitId);
                        }}
                        getActorFilter={() => ({
                            filter: undefined,
                            filterColor: undefined,
                        })}
                        getActorScaleOffset={(actor, _script, index) => {
                            const outfitId = getActorOutfitsAtIndex(_script, index, stage().getSave().actors)[actor.id] || actor.outfitId;
                            const outfit = getOutfitById(actor, outfitId);
                            return {
                                scale: outfit?.scale ?? 1,
                                offsetX: outfit?.offsetX ?? 0,
                                offsetY: outfit?.offsetY ?? 0,
                            };
                        }}
                        getActorVoiceModulation={(actor) => ({...actor.voiceModulation, volume: getActorVoiceVolume(actor.voiceId)})}
                        getActorTheme={(actor) => ({ color: actor.themeColor ?? 'default', fontFamily: actor.themeFontFamily ?? 'default' })}
                        onSubmitInput={handleSubmit}
                        onSkitChange={onSkitChange}
                        getSubmitButtonConfig={(skitArg, index) => {
                            const atEnd = index >= skitArg.script.length - 1;
                            return atEnd ? {
                                label: 'Close',
                                colorScheme: 'error',
                                icon: <Close />,
                            } : {
                                label: 'Continue',
                                colorScheme: 'primary',
                                icon: <PlayArrow />,
                            };
                        }}
                        enableAudio={isTextToSpeechEnabled && isAudioEnabled}
                        enableHaptics={isHapticsEnabled}
                        enablePopInSpeakers={true}
                        enableTalkingAnimation={true}
                        enableFontEffects={stage().getSave().enableFontEffects}
                        responsiveOverlay={(_skit, actor) => {
                            const overlayContent = actor && actor.id !== stage().getPlayerActor().id
                                ? <ActorCard actor={actor} stage={stage} />
                                : null;
                            return (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                                    {overlayContent}
                                    <OutcomeDisplay outcomes={accumulatedOutcomes} stage={stage} />
                                </div>
                            );
                        }}
                        additionalActionButtons={isTextToSpeechEnabled ? [
                            {
                                id: 'soundToggle',
                                label: isAudioEnabled ? 'Mute' : 'Unmute',
                                content: isAudioEnabled ? <VolumeUp /> : <VolumeOff />,
                                onClick: () => setIsAudioEnabled(prev => !prev)
                            }
                        ] : []}
                    />
                </div>
                <div style={{
                    position: 'absolute',
                    top: isVerticalLayout ? '1%' : 12,
                    right: isVerticalLayout ? '1%' : 16,
                    zIndex: 10
                }}>
                    <IconButton
                        aria-label="Exit Theater"
                        onClick={onClose}
                        onMouseEnter={() => setTooltip('Exit Theater', Close)}
                        onMouseLeave={() => clearTooltip()}
                        sx={cornerButtonSx}
                    >
                        <Close />
                    </IconButton>
                </div>
            </BlurredBackground>
        </div>
    );
};
