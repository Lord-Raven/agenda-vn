import { FC, useEffect, useMemo, useState } from "react";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { BlurredBackground } from "@lord-raven/novel-visualizer";
import { Box, Typography } from "@mui/material";
import { CalendarMonth, EventAvailable, EventBusy, MenuRounded, Settings } from "@mui/icons-material";
import { motion } from "framer-motion";
import { Button, GlassPanel } from "./UiComponents";
import { useTooltip } from "./TooltipContext";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { Actor, getEmotionImage } from "../content/Actor";

interface CalendarScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const CALENDAR_BACKGROUND_IMAGE = "https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png";
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

export const CalendarScreen: FC<CalendarScreenProps> = ({ stage, setScreenType }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);

    const save = stage().getSave();
    const uiSettings = stage().getUiSettings();
    const currentDate = save.currentDate || new Date().toISOString().slice(0, 10);
    const events = useMemo(() => stage().getUpcomingEvents(), [save.upcomingEvents, save.currentDate]);

    useEffect(() => {
        stage().loadCalendarScreen();
    }, [stage]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setScreenType(ScreenType.MENU);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [setScreenType]);

    const openEvent = (eventId: string) => {
        const opened = stage().startCalendarEventSkit(eventId);
        if (opened) {
            setScreenType(ScreenType.SKIT);
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
