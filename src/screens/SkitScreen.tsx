import { FC, useCallback, useEffect, useRef, useState } from "react";
import { SaveType, Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { BlurredBackground, NovelVisualizer } from "@lord-raven/novel-visualizer";
import { Box, Typography } from "@mui/material";
import { Button, NamePlate } from "../components/UiComponents";
import { ActorCard } from "../components/ActorCard";
import { useTooltip } from "../components/TooltipContext";
import { Actor, getActorLore, getEmotionImage } from "../content/Actor";
import { accumulateOutcomes, determineEmotion, generateSkitScript, getCurrentLocation, Skit } from "../content/Skit";
import { getLocationImageUrl } from "../content/Location";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { Outcome } from "../content/Outcome";
import { OutcomeDisplay } from "../components/OutcomeDisplay";


import {
    Send,
    LastPage,
    PlayArrow,
    Menu as MenuIcon,
    EditNote,
    Close,
    Warning,
    VolumeUp,
    VolumeOff
} from '@mui/icons-material';
import { IconButton } from '@mui/material';
import React from "react";
import { Emotion } from "../content/Emotion";

interface SkitScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

/**
 * Helper function to get the active scene location ID at a given script index.
 * Applies scene-level location transitions up to and including the index.
 */
const getSceneLocationIdAtIndex = (skit: Skit, scriptIndex: number): string => {
    let sceneLocationId = skit.initialLocationId;

    for (let i = 0; i <= scriptIndex && i < skit.script.length; i++) {
        const entry = skit.script[i];
        if (entry.updatedLocationId) {
            sceneLocationId = entry.updatedLocationId;
        }
    }

    return sceneLocationId;
};

/**
 * Helper function to get the actors present in the scene at a given script index.
 * Walks through movements from initialActorLocations, filtering by scene location at index.
 */
const getActorsAtIndex = (skit: Skit, scriptIndex: number, allActors: {[key: string]: Actor}, save: SaveType): Actor[] => {
    // Start with initial actor locations
    const currentLocations = {...(skit.initialActors || {})};
    const movedActorIds = new Set<string>();
    
    // Apply movements up to and including the current index
    /*for (let i = 0; i <= scriptIndex && i < skit.script.length; i++) {
        const entry = skit.script[i];
        if (entry.movements) {
            Object.entries(entry.movements).forEach(([actorId, newLocationId]) => {
                movedActorIds.add(actorId);
                currentLocations[actorId] = newLocationId;
            });
        }
    }*/
    
    const sceneLocationId = getSceneLocationIdAtIndex(skit, scriptIndex);

    // Filter actors who are at the skit's location and are active in the save
    const actorsInScene: Actor[] = [];
    Object.entries(currentLocations).forEach(([actorId, locationId]) => {
        if (locationId === sceneLocationId && allActors[actorId]) {
            actorsInScene.push(allActors[actorId]);
        }
    });
    
    return actorsInScene;
};

/**
 * Helper function to get actor outfit IDs at a given script index.
 * Walks from initialActorOutfits and applies per-entry outfitChanges.
 */
const getActorOutfitsAtIndex = (skit: Skit, scriptIndex: number, allActors: {[key: string]: Actor}): {[actorId: string]: string} => {
    const currentOutfits = {
        ...Object.values(allActors).reduce((acc, actor) => {
            acc[actor.id] = actor.outfitId;
            return acc;
        }, {} as {[actorId: string]: string}),
        ...(skit.initialActorOutfits || {})
    };

    for (let i = 0; i <= scriptIndex && i < skit.script.length; i++) {
        const entry = skit.script[i];
        if (entry.actorOutfits) {
            Object.entries(entry.actorOutfits).forEach(([actorId, newOutfitId]) => {
                currentOutfits[actorId] = newOutfitId;
            });
        }
    }

    return currentOutfits;
};

export const SkitScreen: FC<SkitScreenProps> = ({ stage, setScreenType, isVerticalLayout }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [skit, setSkit] = React.useState<Skit>(stage().getCurrentSkit() as Skit);
    const [, setSkitRevision] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState<boolean>(false);
    const [accumulatedOutcomes, setAccumulatedOutcomes] = React.useState<Outcome[]>([]);
    const [showContentManagement, setShowContentManagement] = React.useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = React.useState<boolean>(stage().getSave().enableTextToSpeech || true);
    const isTextToSpeechEnabled = stage().getSave().enableTextToSpeech;
    const currentScriptIndex = Math.min(Math.max(skit.currentIndex || 0, 0), Math.max(skit.script.length - 1, 0));
    const shouldHighlightCloseButton = !isLoading && skit.script.length >= 3 && currentScriptIndex >= skit.script.length - 1;

    const currentLocationId = getSceneLocationIdAtIndex(skit, skit.currentIndex || 0);
    const location = stage().getSave().atlas[currentLocationId || ''];
    const locationImageUrl = getLocationImageUrl(location);
    const cornerButtonSx = {
        color: 'var(--agenda-accent-primary)',
        opacity: 0.8,
        '&:hover': {
            color: 'var(--agenda-text-muted)',
            backgroundColor: 'color-mix(in srgb, var(--agenda-accent-primary) 10%, transparent)'
        }
    };
    
    const actors = {...stage().getSave().actors};

    
    const onSkitChange = useCallback((newSkit: Skit) => {
        // Keep skit object identity stable, but force this component to re-render.
        setSkitRevision(prev => prev + 1);
    }, [stage]);

    useEffect(() => {
        setSkitRevision(prev => prev + 1);
    }, [isLoading]);

    const handleClose = useCallback(() => {
        const clampedCurrentIndex = Math.min(Math.max(skit.currentIndex || 0, 0), Math.max(skit.script.length - 1, 0));
        const endedEarly = clampedCurrentIndex < skit.script.length - 1;
        const finalizedSkit: Skit = {
            ...skit,
            script: skit.script.slice(0, clampedCurrentIndex + 1)
        };

        console.log('handleClose called. Ended early:', endedEarly, 'Finalized skit length:', finalizedSkit.script.length);
        setSkit(finalizedSkit);
        stage().endSkit();
        setScreenType(ScreenType.MAP);
    }, [stage, setScreenType]);

	const handleSkitSubmit = useCallback(async (input: string, skitArg: Skit, index: number) => {
		index = Math.max(0, index);
        setIsLoading(true);
        const nextEntries = await generateSkitScript(skitArg, stage());
        setIsLoading(false);
        skitArg.script.push(...nextEntries);
        console.log('handleSkitSubmit: Updated skitArg.script length:', skitArg.script.length);
        stage().saveGame();

        return skitArg;
	}, [stage]);

    useEffect(() => {
        if (skit.script.length == 0 && !isLoading) {
            if (stage().getCurrentSkit() === null) {
                console.log('No current skit. Returning to map.');
                setScreenType(ScreenType.MAP);
                return;
            }
            console.log('Initial skit script is empty. Triggering continueSkit.');
            setIsLoading(true);
            stage().continueSkit().then(() => {
                console.log('continueSkit resolved.');
                setIsLoading(false);
                stage().saveGame();
            });
        }
        const visibleScriptEntries = skit.script.slice(0, Math.min((skit.currentIndex || 0) + 1, skit.script.length));

        const outcomes = accumulateOutcomes(visibleScriptEntries, stage()) || [];
        setAccumulatedOutcomes(outcomes);

    }, [skit, skit.currentIndex, isLoading]);

    // Handle Escape key to open menu
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !showContentManagement) {
                setScreenType(ScreenType.MENU);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setScreenType, showContentManagement]);

    const outcomesAnimationKey = React.useMemo(() => {
        if (accumulatedOutcomes.length === 0) {
            return 'no-outcomes';
        }

        return accumulatedOutcomes
            .map((outcome, index) => JSON.stringify({ ...outcome, index }))
            .join('|');
    }, [accumulatedOutcomes]);

    return (
        <BlurredBackground
            imageUrl={locationImageUrl}
            // overlay="linear-gradient(130deg, rgba(5, 24, 34, 0.78) 0%, rgba(18, 47, 32, 0.72) 50%, rgba(37, 24, 57, 0.78) 100%)"
        >
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Top right control buttons */}
                <div style={{
                    justifyContent: 'flex-end',
                    padding: '1rem',
                    display: 'flex',
                    gap: '0.5rem',
                    zIndex: 10
                }}>
                    {isTextToSpeechEnabled && (
                        <IconButton
                            onClick={() => setIsAudioEnabled(prev => !prev)}
                            onMouseEnter={() => setTooltip(isAudioEnabled ? 'Mute Audio' : 'Enable Audio', isAudioEnabled ? VolumeUp : VolumeOff)}
                            onMouseLeave={() => clearTooltip()}
                            sx={{
                                ...cornerButtonSx,
                                opacity: isAudioEnabled ? 0.95 : 0.55,
                            }}
                        >
                            {isAudioEnabled ? <VolumeUp /> : <VolumeOff />}
                        </IconButton>
                    )}
                    <IconButton
                        onClick={() => setShowContentManagement(true)}
                        onMouseEnter={() => setTooltip('Content Management', EditNote)}
                        onMouseLeave={() => clearTooltip()}
                        sx={cornerButtonSx}
                    >
                        <EditNote />
                    </IconButton>
                    <IconButton
                        onClick={() => setScreenType(ScreenType.MENU)}
                        onMouseEnter={() => setTooltip('Main Menu', MenuIcon)}
                        onMouseLeave={() => clearTooltip()}
                        sx={cornerButtonSx}
                    >
                        <MenuIcon />
                    </IconButton>
                    <IconButton
                        onClick={handleClose}
                        onMouseEnter={() => setTooltip(isLoading ? 'Cannot close while content is generating' : ((accumulatedOutcomes.length > 0 ? 'Accept Outcomes and ' : '') + (shouldHighlightCloseButton ? 'End Scene Here' : 'End Scene Here (Discard Remaining Entries)')), shouldHighlightCloseButton ? Close : Warning)}
                        onMouseLeave={() => clearTooltip()}
                        disabled={isLoading || skit.script.length < 3}
                        sx={{
                            ...cornerButtonSx,
                            ...(!isLoading && shouldHighlightCloseButton ? {
                                color: 'var(--agenda-warning)',
                                backgroundColor: 'color-mix(in srgb, var(--agenda-warning) 12%, transparent)',
                                animation: 'closeButtonPulse 1.6s ease-in-out infinite',
                                '@keyframes closeButtonPulse': {
                                    '0%, 100%': {
                                        transform: 'scale(1)',
                                        boxShadow: '0 0 0 0 color-mix(in srgb, var(--agenda-text-primary) 35%, transparent)'
                                    },
                                    '50%': {
                                        transform: 'scale(1.08)',
                                        boxShadow: '0 0 0 8px transparent'
                                    }
                                }
                            } : {}),
                            '&.Mui-disabled': {
                                color: 'color-mix(in srgb, var(--agenda-text-primary) 25%, transparent)'
                            }
                        }}
                    >
                        <Close />
                    </IconButton>
                </div>
                    <NovelVisualizer
                        skit={skit}
                        loading={isLoading}
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
                            />;
                        }}
                        typingSpeed={10}
                        setTooltip={setTooltip}
                        isVerticalLayout={isVerticalLayout}
                        actors={actors}
                        playerActorId={'player'}
                        getPresentActors={(_script, _index) =>
                            getActorsAtIndex(_script, _index, stage().getSave().actors, stage().getSave()) || []
                        }
                        getActorImageUrl={(actor, _script, index) => {
                            let emotion = Emotion.neutral;

                            if (skit.script && skit.script.length > 0 && index < skit.script.length) {
                                for (let j = index; j >= 0; j--) {
                                    const entry = skit.script[j];
                                    if (entry.actorEmotions && entry.actorEmotions[actor.name]) {
                                        emotion = entry.actorEmotions[actor.name];
                                        break;
                                    }
                                }
                            }

                            const outfitId = getActorOutfitsAtIndex(_script, index, stage().getSave().actors)[actor.id] || actor.outfitId;
                            return getEmotionImage(actor, emotion, stage(), outfitId);
                        }}
                        getActorFilter={(actor, _script, index) => {
                            return {
                                filter: undefined,
                                filterColor: undefined,
                            };
                        }}
                        onSubmitInput={handleSkitSubmit}
                        onSkitChange={onSkitChange}
                        getSubmitButtonConfig={(_script, index, inputText) => {
                            return {
                                label: inputText.trim().length > 0 ? 'Send' : 'Continue',
                                enabled: true,
                                colorScheme: inputText.trim().length > 0 ? 'secondary' : 'primary',
                                icon: inputText.trim().length > 0 ? <Send /> : <PlayArrow />,
                            };
                        }}
                        enableAudio={isTextToSpeechEnabled && isAudioEnabled}
                        enablePopInSpeakers={true}
                        enableTalkingAnimation={true}
                        enableFontEffects={stage().getSave().enableFontEffects}
                        responsiveOverlay={(_skit, actor) => {
                            const overlayContent = actor && actor.id !== stage().getPlayerActor().id
                                ? <ActorCard actor={actor as Actor} stage={stage} />
                                : null;
                            return (
                                <>
                                    {overlayContent}
                                    <OutcomeDisplay outcomes={accumulatedOutcomes} stage={stage} />
                                </>
                            );
                        }}
                    />
            </div>

            {/* Content Management Modal */}
            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => setShowContentManagement(false)}
                />
            )}
        </BlurredBackground>
    );

}