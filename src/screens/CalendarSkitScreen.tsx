import { FC, useCallback, useEffect, useRef, useState } from "react";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { BlurredBackground, NovelVisualizer } from "@lord-raven/novel-visualizer";
import { Box, Typography } from "@mui/material";
import { LastPage, PlayArrow, Send } from "@mui/icons-material";
import { NamePlate } from "./UiComponents";
import { useTooltip } from "./TooltipContext";
import { Actor, getEmotionImage } from "../content/Actor";
import { determineEmotion, generateSkitScript, getCurrentLocation, Skit } from "../content/Skit";

interface CalendarSkitScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const CALENDAR_BACKGROUND_IMAGE = "https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png";
export const CalendarSkitScreen: FC<CalendarSkitScreenProps> = ({ stage, setScreenType, isVerticalLayout }) => {
    const { setTooltip } = useTooltip();
    const [isGeneratingNextSkit, setIsGeneratingNextSkit] = useState(false);
    const initializedSkitIdRef = useRef<string | null>(null);
    const currentSkit = stage().getCurrentSkit();

    useEffect(() => {
        if (!currentSkit) {
            setScreenType(ScreenType.CALENDAR);
            return;
        }

        if (currentSkit.script.length > 0) {
            return;
        }

        if (initializedSkitIdRef.current === currentSkit.id) {
            return;
        }

        initializedSkitIdRef.current = currentSkit.id;

        const initScript = async () => {
            setIsGeneratingNextSkit(true);
            try {
                const nextEntries = await generateSkitScript(currentSkit, stage());
                if (nextEntries.length > 0) {
                    currentSkit.script.push(...nextEntries);
                    stage().saveGame();
                }
            } finally {
                setIsGeneratingNextSkit(false);
            }
        };

        initScript();
    }, [currentSkit, setScreenType, stage]);

    const handleSkitSubmit = useCallback(async (input: string, skitArg: any, index: number) => {
        index = Math.max(0, index);
        if (input.trim() === "" && skitArg.script.length > 0 && skitArg.script[index].endScene) {
            stage().endSkit();
            setScreenType(ScreenType.CALENDAR);
            return null;
        }

        const nextEntries = await generateSkitScript(skitArg as Skit, stage());
        (skitArg as Skit).script.push(...nextEntries);
        const currentTimelineEvent = stage().getSave().timeline?.find(entry => entry.skit?.id === skitArg.id);
        if (currentTimelineEvent) {
            currentTimelineEvent.skit = skitArg as Skit;
            stage().saveGame();
        }
        return skitArg;
    }, [setScreenType, stage]);

    if (!currentSkit) {
        return null;
    }

    return (
        <BlurredBackground
            imageUrl={CALENDAR_BACKGROUND_IMAGE}
            overlay="linear-gradient(130deg, var(--agenda-calendar-overlay-start) 0%, var(--agenda-calendar-overlay-mid) 48%, var(--agenda-calendar-overlay-end) 100%)"
        >
            <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
                <Box
                    sx={{
                        position: "absolute",
                        top: 16,
                        left: 16,
                        zIndex: 1000,
                        backgroundColor: "rgba(22, 28, 44, 0.76)",
                        backdropFilter: "blur(6px)",
                        padding: "8px 24px",
                        borderRadius: "20px",
                        border: "1px solid rgba(138, 176, 204, 0.48)",
                        boxShadow: "0 4px 18px rgba(10, 16, 29, 0.55), 0 0 16px rgba(138, 176, 204, 0.2)",
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{
                            color: "#edf2f2",
                            fontWeight: "bold",
                            fontSize: "1.1rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                        }}
                    >
                        {currentSkit.initialLocationId
                            ? (stage().getSave().atlas[currentSkit.initialLocationId]?.name || currentSkit.initialLocationId)
                            : (stage().getUiSettings().gameTitle || "Agenda VN")}
                    </Typography>
                </Box>

                <NovelVisualizer
                    skit={currentSkit}
                    loading={isGeneratingNextSkit}
                    renderNameplate={(actor: any) => {
                        if (!actor || !actor.name) return null;
                        return <NamePlate actor={actor as Actor} />;
                    }}
                    setTooltip={setTooltip}
                    isVerticalLayout={isVerticalLayout}
                    actors={stage().getSave().actors}
                    playerActorId={stage().getPlayerActor().id}
                    getPresentActors={(_script, _index) =>
                        currentSkit.initialActors?.map((id) => stage().getSave().actors[id]).filter(Boolean) || []
                    }
                    getActorImageUrl={(actor, _script, index) => {
                        const emotion = determineEmotion(actor.id, currentSkit, index);
                        return (
                            getEmotionImage(actor as Actor, emotion, stage(), (actor as Actor).outfitId) ||
                            getEmotionImage(actor as Actor, "neutral", stage(), (actor as Actor).outfitId) ||
                            ""
                        );
                    }}
                    getActorImageColorMultiplier={(_actor, _script, index: number) => {
                        return stage().getSave().atlas?.[getCurrentLocation(currentSkit, index) || ""]?.lightColor || "#eeeeee";
                    }}
                    onSubmitInput={handleSkitSubmit}
                    getSubmitButtonConfig={(_script, index, inputText) => {
                        const endScene = index >= 0 ? (currentSkit.script[index]?.endScene || false) : false;
                        return {
                            label: inputText.trim().length > 0 ? "Send" : (endScene ? "End" : "Continue"),
                            enabled: true,
                            colorScheme: inputText.trim().length > 0 ? "primary" : (endScene ? "error" : "primary"),
                            icon: inputText.trim().length > 0 ? <Send /> : (endScene ? <LastPage /> : <PlayArrow />),
                        };
                    }}
                    enableAudio={stage().getSave().textToSpeech}
                    enablePopInSpeakers={true}
                    enableTalkingAnimation={true}
                    responsiveOverlay={(_skit, actor) => {
                        if (!actor || actor.id === stage().getPlayerActor().id) return null;
                        const typedActor = actor as Actor;
                        return (
                            <Box
                                sx={{
                                    padding: 2,
                                    backgroundColor: "rgba(21, 27, 41, 0.9)",
                                    borderRadius: 2,
                                    border: `1px solid ${typedActor.themeColor || "#8ab0cc"}`,
                                    maxWidth: 300,
                                    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.55)",
                                }}
                            >
                                <Box sx={{ marginBottom: 1 }}>
                                    <NamePlate actor={typedActor} />
                                </Box>
                                <Box sx={{ color: "#edf2f2", fontSize: "0.9rem", lineHeight: 1.4 }}>
                                    {typedActor.profile}
                                </Box>
                            </Box>
                        );
                    }}
                />
            </Box>
        </BlurredBackground>
    );
};
