import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { BlurredBackground, NovelVisualizer } from "@lord-raven/novel-visualizer";
import { Box, Typography } from "@mui/material";
import { CalendarMonth, EventAvailable, EventBusy, Favorite, FavoriteBorder, LastPage, MenuRounded, PlayArrow, Send, Settings } from "@mui/icons-material";
import { AnimatePresence, motion } from "framer-motion";
import { Button, GlassPanel, NamePlate } from "./UiComponents";
import { useTooltip } from "./TooltipContext";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { Actor, clampActorAffinity, getEmotionImage } from "../content/Actor";
import { determineEmotion, generateSkitScript, getCurrentLocation, Skit } from "../content/Skit";

interface CalendarScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const CALENDAR_BACKGROUND_IMAGE = "https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png";
const HEART_COUNT = 10;

type CalendarMode = "calendar" | "skit";

const formatDate = (dateText: string) => {
    const parsedDate = new Date(`${dateText}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime())) {
        return dateText;
    }

    return parsedDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
};

export const CalendarScreen: FC<CalendarScreenProps> = ({ stage, setScreenType, isVerticalLayout }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [mode, setMode] = useState<CalendarMode>(stage().getCurrentSkit() ? "skit" : "calendar");
    const [showContentManagement, setShowContentManagement] = useState(false);
    const [isGeneratingNextSkit, setIsGeneratingNextSkit] = useState(false);
    const initializedSkitIdRef = useRef<string | null>(null);

    const save = stage().getSave();
    const uiSettings = stage().getUiSettings();
    const currentDate = save.currentDate || new Date().toISOString().slice(0, 10);
    const events = useMemo(() => stage().getUpcomingEvents(), [save.upcomingEvents, save.currentDate]);
    const currentSkit = stage().getCurrentSkit();

    useEffect(() => {
        stage().loadCalendarScreen();
    }, [stage]);

    useEffect(() => {
        if (!currentSkit && mode === "skit") {
            setMode("calendar");
        }
    }, [currentSkit, mode]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (mode === "skit") {
                    return;
                }
                setScreenType(ScreenType.MENU);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [mode, setScreenType]);

    useEffect(() => {
        if (mode !== "skit" || !currentSkit || currentSkit.script.length > 0) {
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
    }, [currentSkit, mode, stage]);

    const openEvent = (eventId: string) => {
        const opened = stage().startCalendarEventSkit(eventId);
        if (opened) {
            setMode("skit");
        }
    };

    const skipEvent = () => {
        const skipped = stage().skipNextEvent();
        if (skipped) {
            setTooltip(`Skipped: ${skipped.name}`, EventBusy, 3500);
            return;
        }

        stage().rebuildUpcomingEvents(stage().getSave()).then(() => {
            setTooltip("Generated more upcoming events.", EventAvailable, 3000);
        });
    };

    const handleSkitSubmit = useCallback(async (input: string, skitArg: any, index: number) => {
        index = Math.max(0, index);
        if (input.trim() === "" && skitArg.script.length > 0 && skitArg.script[index].endScene) {
            stage().endSkit();
            setMode("calendar");
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
    }, [stage]);

    return (
        <>
            <BlurredBackground
                imageUrl={CALENDAR_BACKGROUND_IMAGE}
                overlay="linear-gradient(130deg, var(--agenda-calendar-overlay-start) 0%, var(--agenda-calendar-overlay-mid) 48%, var(--agenda-calendar-overlay-end) 100%)"
            >
                <Box
                    sx={{
                        width: "100vw",
                        height: "100vh",
                        boxSizing: "border-box",
                        padding: { xs: "12px", md: "18px" },
                        display: "flex",
                        flexDirection: "column",
                        position: "relative",
                    }}
                >
                    {mode === "calendar" && (
                        <>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Button
                                        variant="secondary"
                                        onClick={() => setScreenType(ScreenType.MENU)}
                                        onMouseEnter={() => setTooltip("Back to menu", MenuRounded)}
                                        onMouseLeave={clearTooltip}
                                        style={{ padding: "10px 14px" }}
                                    >
                                        <MenuRounded fontSize="small" />
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() => setShowContentManagement(true)}
                                        onMouseEnter={() => setTooltip("Manage actors, locations, and lore", Settings)}
                                        onMouseLeave={clearTooltip}
                                        style={{ padding: "10px 14px" }}
                                    >
                                        <Settings fontSize="small" />
                                    </Button>
                                </Box>

                                <Button
                                    variant="primary"
                                    onClick={skipEvent}
                                    onMouseEnter={() => setTooltip("Skip to the next event date", EventBusy)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "10px 14px" }}
                                >
                                    Skip Next Event
                                </Button>
                            </Box>

                            <GlassPanel variant="bright" style={{ marginBottom: 16 }}>
                                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                                    <Box>
                                        <Typography sx={{ color: "var(--agenda-verdant)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.8rem", marginBottom: "2px" }}>
                                            {uiSettings.gameTitle || 'Agenda VN'}
                                        </Typography>
                                        <Typography sx={{ color: "rgba(185, 210, 227, 0.82)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.75rem" }}>
                                            Current Date
                                        </Typography>
                                        <Typography sx={{ color: "#edf2f2", fontWeight: 700, fontSize: { xs: "1rem", md: "1.4rem" } }}>
                                            {formatDate(currentDate)}
                                        </Typography>
                                    </Box>

                                    <Box sx={{ textAlign: { xs: "left", md: "right" } }}>
                                        <Typography sx={{ color: "rgba(185, 210, 227, 0.82)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.75rem" }}>
                                            Next Event
                                        </Typography>
                                        <Typography sx={{ color: "#edf2f2", fontWeight: 600, fontSize: { xs: "0.95rem", md: "1.1rem" } }}>
                                            {events[0] ? `${events[0].name} - ${formatDate(events[0].date)}` : "None scheduled"}
                                        </Typography>
                                    </Box>
                                </Box>
                            </GlassPanel>

                            <GlassPanel variant="default" style={{ flex: 1, overflow: "hidden" }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                                    <CalendarMonth sx={{ color: "var(--agenda-mist)" }} />
                                    <Typography sx={{ color: "#edf2f2", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                        Upcoming Events
                                    </Typography>
                                </Box>

                                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5, maxHeight: "100%", overflowY: "auto", pr: 1 }}>
                                    {events.length === 0 && (
                                        <Typography sx={{ color: "rgba(185, 210, 227, 0.72)" }}>
                                            No upcoming events. Use skip to generate the next date batch.
                                        </Typography>
                                    )}

                                    {events.map((eventItem) => {
                                        const location = save.atlas[eventItem.locationId];
                                        const participants = eventItem.participantActorIds
                                            .map(actorId => save.actors[actorId])
                                            .filter(Boolean) as Actor[];

                                        return (
                                            <motion.div
                                                key={eventItem.id}
                                                initial={{ opacity: 0, y: 16 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.25 }}
                                            >
                                                <button
                                                    onClick={() => openEvent(eventItem.id)}
                                                    onMouseEnter={() => setTooltip(`Open event: ${eventItem.name}`, EventAvailable)}
                                                    onMouseLeave={clearTooltip}
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        background: "linear-gradient(140deg, var(--agenda-calendar-card-bg), rgba(21, 27, 43, 0.9))",
                                                        border: "1px solid var(--agenda-calendar-card-border)",
                                                        borderRadius: 12,
                                                        color: "var(--agenda-fog)",
                                                        padding: "14px",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <Typography sx={{ fontSize: "0.78rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(185, 210, 227, 0.78)", mb: 0.4 }}>
                                                        {formatDate(eventItem.date)}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: "1.06rem", fontWeight: 700, mb: 0.4 }}>
                                                        {eventItem.name}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: "0.9rem", color: "rgba(185, 210, 227, 0.9)", mb: 1 }}>
                                                        {location?.name || "Unknown Location"}
                                                    </Typography>

                                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                                                        {participants.length === 0 && (
                                                            <Typography sx={{ color: "rgba(185, 210, 227, 0.66)", fontSize: "0.85rem" }}>
                                                                No listed participants
                                                            </Typography>
                                                        )}
                                                        {participants.map(actor => (
                                                            <Box
                                                                key={`${eventItem.id}-${actor.id}`}
                                                                sx={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: 0.8,
                                                                    backgroundColor: "rgba(17, 24, 39, 0.6)",
                                                                    border: `1px solid ${actor.themeColor || "rgba(138, 176, 204, 0.5)"}`,
                                                                    borderRadius: "999px",
                                                                    padding: "4px 10px 4px 4px",
                                                                }}
                                                            >
                                                                <Box
                                                                    sx={{
                                                                        width: 24,
                                                                        height: 24,
                                                                        borderRadius: "50%",
                                                                        backgroundImage: `url(${getEmotionImage(actor, "neutral", stage(), actor.outfitId) || actor.sampleImageUrl})`,
                                                                        backgroundSize: "cover",
                                                                        backgroundPosition: "top center",
                                                                        border: "1px solid rgba(237, 242, 242, 0.35)",
                                                                    }}
                                                                />
                                                                <Typography sx={{ fontSize: "0.78rem", color: "rgba(237, 242, 242, 0.95)" }}>{actor.name}</Typography>
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                </button>
                                            </motion.div>
                                        );
                                    })}
                                </Box>
                            </GlassPanel>
                        </>
                    )}

                    <AnimatePresence>
                        {mode === "skit" && currentSkit && (
                            <motion.div
                                key="calendar-skit"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35 }}
                                style={{ position: "absolute", inset: 0, zIndex: 8 }}
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
                                                : "Agenda VN"}
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
                                            const authorName = typedActor.fullPath?.split("/").filter(Boolean)[0] || "";
                                            const affinity = clampActorAffinity(typedActor.affinity);
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
                                                    {authorName && (
                                                        <Typography
                                                            variant="caption"
                                                            sx={{
                                                                display: "block",
                                                                marginBottom: 1,
                                                                color: "rgba(185, 210, 227, 0.84)",
                                                                fontStyle: "italic",
                                                                fontFamily: '"Lora", Georgia, serif',
                                                            }}
                                                        >
                                                            by {authorName}
                                                        </Typography>
                                                    )}
                                                    <Box
                                                        sx={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 0.5,
                                                            marginBottom: 1,
                                                            color: "#f2adb8",
                                                        }}
                                                    >
                                                        {Array.from({ length: HEART_COUNT }, (_, index) => (
                                                            index < affinity
                                                                ? <Favorite key={`heart-filled-${index}`} sx={{ fontSize: 16 }} />
                                                                : <FavoriteBorder key={`heart-empty-${index}`} sx={{ fontSize: 16, opacity: 0.65 }} />
                                                        ))}
                                                    </Box>
                                                    <Box sx={{ color: "#edf2f2", fontSize: "0.9rem", lineHeight: 1.4 }}>
                                                        {typedActor.profile}
                                                    </Box>
                                                </Box>
                                            );
                                        }}
                                    />
                                </Box>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Box>
            </BlurredBackground>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => setShowContentManagement(false)}
                />
            )}
        </>
    );
};
