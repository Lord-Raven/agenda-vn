import { FC, useEffect, useMemo, useState } from "react";
import type { CalendarEvent, CalendarEventRecurrence, CalendarTimeOfDay } from "../content/CalendarEvent";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { Box, Typography } from "@mui/material";
import {
    ArrowBackRounded,
    ArrowForwardRounded,
    EventAvailable,
    MapRounded,
    MenuRounded,
    Settings,
    TodayRounded,
} from "@mui/icons-material";
import { AnimatePresence, motion } from "framer-motion";
import { Button, GlassPanel } from "../components/UiComponents";
import { useTooltip } from "../components/TooltipContext";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { Actor, getEmotionImage } from "../content/Actor";
import { PlayerStatBar } from "../components/PlayerStatBar";

interface CalendarScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const DEFAULT_BACKGROUND_IMAGE_URL = 'https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png';
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_ROW_COUNT = 6;
const MAX_EVENT_LINES_PER_DAY = 3;
const TIME_OF_DAY_ORDER: CalendarTimeOfDay[] = ["morning", "afternoon", "evening", "night"];

const parseDateKey = (dateText: string) => new Date(`${dateText}T00:00:00Z`);

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
));

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const isSameDate = (left: Date, right: Date) => formatDateKey(left) === formatDateKey(right);

const formatDate = (dateText: string) => {
    const parsedDate = parseDateKey(dateText);
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

const formatRecurrenceSummary = (recurrence?: CalendarEventRecurrence | null) => {
    if (!recurrence) {
        return "";
    }

    const interval = Math.max(1, Number(recurrence.interval) || 1);
    const unit = recurrence.frequency === "daily"
        ? (interval === 1 ? "day" : "days")
        : recurrence.frequency === "weekly"
            ? (interval === 1 ? "week" : "weeks")
            : (interval === 1 ? "month" : "months");
    return `Repeats every ${interval} ${unit} until ${formatDate(recurrence.untilDate)}`;
};

const formatTimeOfDay = (timeOfDay: CalendarTimeOfDay) => `${timeOfDay[0].toUpperCase()}${timeOfDay.slice(1)}`;

const getDurationSlots = (event: CalendarEvent) => {
    const unique = Array.from(new Set((event.duration || []).filter((slot): slot is CalendarTimeOfDay => TIME_OF_DAY_ORDER.includes(slot as CalendarTimeOfDay))));
    return unique.sort((left, right) => TIME_OF_DAY_ORDER.indexOf(left) - TIME_OF_DAY_ORDER.indexOf(right));
};

const getEventStartSlotIndex = (event: CalendarEvent) => {
    const first = getDurationSlots(event)[0] || 'morning';
    return TIME_OF_DAY_ORDER.indexOf(first);
};

const getEventEndSlotIndex = (event: CalendarEvent) => {
    const slots = getDurationSlots(event);
    const last = slots[slots.length - 1] || 'evening';
    return TIME_OF_DAY_ORDER.indexOf(last);
};

const compareEventSchedule = (left: CalendarEvent, right: CalendarEvent) => {
    const dateCompare = `${left.date || ""}`.localeCompare(`${right.date || ""}`);
    if (dateCompare !== 0) {
        return dateCompare;
    }

    const timeCompare = getEventStartSlotIndex(left) - getEventStartSlotIndex(right);
    if (timeCompare !== 0) {
        return timeCompare;
    }

    return `${left.id || ""}`.localeCompare(`${right.id || ""}`);
};

const isPastDate = (targetDate: string, currentDate: string) => targetDate < currentDate;

const isPastSlot = (targetDate: string, currentDate: string, currentSlotIndex: number, slotIndex: number) => {
    if (targetDate < currentDate) {
        return true;
    }
    if (targetDate > currentDate) {
        return false;
    }
    return slotIndex < currentSlotIndex;
};

const isPastEvent = (event: CalendarEvent, currentDate: string, currentSlotIndex: number) => {
    if (isPastDate(event.date, currentDate)) {
        return true;
    }
    if (event.date > currentDate) {
        return false;
    }
    return getEventEndSlotIndex(event) < currentSlotIndex;
};

const doesEventOccupySlot = (event: CalendarEvent, slotIndex: number) => {
    const start = getEventStartSlotIndex(event);
    const end = getEventEndSlotIndex(event);
    return slotIndex >= start && slotIndex <= end;
};

const formatDurationSummary = (event: CalendarEvent) => {
    const slots = getDurationSlots(event);
    if (slots.length === 0) {
        return "All Day";
    }
    if (slots.length === 1) {
        return formatTimeOfDay(slots[0]);
    }
    return `${formatTimeOfDay(slots[0])} - ${formatTimeOfDay(slots[slots.length - 1])}`;
};

const buildMonthGrid = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const leadingDays = monthStart.getUTCDay();
    const firstGridDay = addDays(monthStart, -leadingDays);

    return Array.from({ length: CALENDAR_ROW_COUNT * 7 }, (_, index) => addDays(firstGridDay, index));
};

const groupEventsByDate = (events: CalendarEvent[]) => events.reduce((grouped, event) => {
    const bucket = grouped.get(event.date) || [];
    bucket.push(event);
    bucket.sort((left, right) => getEventStartSlotIndex(left) - getEventStartSlotIndex(right));
    grouped.set(event.date, bucket);
    return grouped;
}, new Map<string, CalendarEvent[]>());

export const CalendarScreen: FC<CalendarScreenProps> = ({ stage, setScreenType }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);

    const stageInstance = stage();
    const configuredBackgroundImageUrl = (stageInstance.getConfiguration().backgroundImageUrl || '').trim() || DEFAULT_BACKGROUND_IMAGE_URL;
    const save = stageInstance.getSave();
    const currentDateKey = save.currentDate || formatDateKey(new Date());
    const currentDate = parseDateKey(currentDateKey);
    const currentTimeOfDay = save.currentTimeOfDay || 'morning';
    const currentSlotIndex = Math.max(TIME_OF_DAY_ORDER.indexOf(currentTimeOfDay), 0);

    const allEvents = useMemo(
        () => [...(save.upcomingEvents || [])].sort((left, right) => compareEventSchedule(left, right)),
        [save.upcomingEvents, save.currentDate, save.currentTimeOfDay, stageInstance],
    );
    const upcomingEvents = useMemo(() => [...stageInstance.getUpcomingEvents()], [save.upcomingEvents, save.currentDate, save.currentTimeOfDay, stageInstance]);
    // In this screen, "today" is anchored to the next event date to match narrative progression.
    const todayDateKey = upcomingEvents[0]?.date || currentDateKey;
    const todayDate = parseDateKey(todayDateKey);

    const [viewMonth, setViewMonth] = useState(() => startOfMonth(todayDate));
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [activeDateKey, setActiveDateKey] = useState<string | null>(null);

    const eventsByDate = useMemo(() => groupEventsByDate(allEvents), [allEvents]);
    const monthGrid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
    const todayDateCellIndex = useMemo(
        () => monthGrid.findIndex((gridDate) => formatDateKey(gridDate) === todayDateKey),
        [monthGrid, todayDateKey],
    );
    const todayWeekRowIndex = useMemo(() => {
        return todayDateCellIndex >= 0 ? Math.floor((todayDateCellIndex + 1) / 7) : -1;
    }, [todayDateCellIndex]);
    const todayWeekdayColumnIndex = useMemo(
        () => (todayDateCellIndex >= 0 ? (todayDateCellIndex % 7) : -1),
        [todayDateCellIndex],
    );
    const calendarGridTemplateColumns = useMemo(
        () => WEEKDAY_LABELS
            .map((_, dayIndex) => (dayIndex === todayWeekdayColumnIndex ? "1.24fr" : "0.96fr"))
            .join(" "),
        [todayWeekdayColumnIndex],
    );
    const calendarGridTemplateRows = useMemo(
        () => Array.from({ length: CALENDAR_ROW_COUNT }, (_, rowIndex) => {
            if (todayWeekRowIndex < 0) {
                return "1fr";
            }

            return rowIndex === todayWeekRowIndex ? "1.40fr" : "0.92fr";
        }).join(" "),
        [todayWeekRowIndex],
    );

    useEffect(() => {
        stageInstance.loadCalendarScreen();
    }, [stageInstance]);

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

    const jumpToCurrentMonth = () => {
        setViewMonth(startOfMonth(todayDate));
    };

    const changeMonth = (offset: number) => {
        const nextMonth = addMonths(viewMonth, offset);
        setViewMonth(nextMonth);
    };

    const openEvent = (eventId: string) => {
        const opened = stageInstance.startCalendarEventSkit(eventId);
        if (opened) {
            setSelectedDateKey(null);
            setSelectedEventId(null);
            setScreenType(ScreenType.SKIT);
        }
    };

    const openDateDetails = (dateKey: string) => {
        setSelectedDateKey(dateKey);
        setSelectedEventId(null);
    };

    return (
        <>
            <Box
                sx={{
                    width: "100vw",
                    minHeight: "100vh",
                    height: "100dvh",
                    boxSizing: "border-box",
                    padding: { xs: "12px", md: "18px" },
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    overflow: "hidden",
                    backgroundImage: `linear-gradient(130deg, var(--agenda-atmosphere-start) 0%, var(--agenda-atmosphere-mid) 48%, var(--agenda-atmosphere-end) 100%), url(${configuredBackgroundImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <Box sx={{ flexShrink: 0, mb: 1.25 }}>
                    <PlayerStatBar
                        stage={stage}
                        buttons={
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(-1)}
                                    onMouseEnter={() => setTooltip("Previous month", ArrowBackRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <ArrowBackRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={jumpToCurrentMonth}
                                    onMouseEnter={() => setTooltip("Jump to current month", TodayRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <TodayRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(1)}
                                    onMouseEnter={() => setTooltip("Next month", ArrowForwardRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <ArrowForwardRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.MAP)}
                                    onMouseEnter={() => setTooltip("Switch to map", MapRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                                >
                                    <MapRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowContentManagement(true)}
                                    onMouseEnter={() => setTooltip("Manage configuration, actors, locations, and more", Settings)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <Settings fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.MENU)}
                                    onMouseEnter={() => setTooltip("Main menu", MenuRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <MenuRounded fontSize="small" />
                                </Button>
                            </>
                        }
                    />
                </Box>

                <GlassPanel variant="bright" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: calendarGridTemplateColumns,
                                gap: 0,
                                width: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                justifyItems: "stretch",
                                border: "1px solid var(--agenda-panel-border)",
                                borderBottom: 0,
                                borderRadius: "12px 12px 0 0",
                                overflow: "hidden",
                            }}
                        >
                            {WEEKDAY_LABELS.map((label) => (
                                <Typography
                                    key={label}
                                    sx={{
                                        minWidth: 0,
                                        boxSizing: "border-box",
                                        color: "var(--agenda-text-muted)",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        fontSize: "0.68rem",
                                        textAlign: "center",
                                        py: 0.85,
                                        borderRight: "1px solid var(--agenda-panel-border)",
                                        background: "linear-gradient(180deg, color-mix(in srgb, var(--agenda-text-primary) 6%, transparent), color-mix(in srgb, var(--agenda-text-primary) 1.5%, transparent))",
                                        "&:last-of-type": {
                                            borderRight: 0,
                                        },
                                    }}
                                >
                                    {label}
                                </Typography>
                            ))}
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: calendarGridTemplateColumns,
                                gridTemplateRows: calendarGridTemplateRows,
                                gap: 0,
                                width: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                flex: 1,
                                minHeight: 0,
                                border: "1px solid var(--agenda-panel-border)",
                                borderTop: 0,
                                borderRadius: "0 0 12px 12px",
                                overflow: "visible",
                                isolation: "isolate",
                                background: "var(--agenda-panel-surface)",
                            }}
                        >
                            {monthGrid.map((cellDate) => {
                                const dateKey = formatDateKey(cellDate);
                                const isCurrentMonth = cellDate.getUTCMonth() === viewMonth.getUTCMonth();
                                const isToday = isSameDate(cellDate, todayDate);
                                const cellEvents = eventsByDate.get(dateKey) || [];
                                const hasEvents = cellEvents.length > 0;
                                const isActiveDate = hasEvents && activeDateKey === dateKey;

                                return (
                                    <motion.div
                                        key={dateKey}
                                        onHoverStart={hasEvents ? () => setActiveDateKey(dateKey) : undefined}
                                        onFocusCapture={hasEvents ? () => setActiveDateKey(dateKey) : undefined}
                                        onClick={hasEvents ? () => openDateDetails(dateKey) : undefined}
                                        whileHover={hasEvents ? { scale: 1.05 } : undefined}
                                        whileTap={hasEvents ? { scale: 0.995 } : undefined}
                                        style={{
                                            appearance: "none",
                                            border: 0,
                                            padding: 0,
                                            background: "transparent",
                                            textAlign: "left",
                                            width: "100%",
                                            height: "100%",
                                            minWidth: 0,
                                            zIndex: isActiveDate ? 4 : 1,
                                            position: "relative",
                                            transformOrigin: "center",
                                            cursor: hasEvents ? "pointer" : "default",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                height: "100%",
                                                minHeight: 0,
                                                minWidth: 0,
                                                boxSizing: "border-box",
                                                borderRight: "1px solid var(--agenda-panel-border)",
                                                borderBottom: "1px solid var(--agenda-panel-border)",
                                                borderRadius: 0,
                                                borderTop: 0,
                                                borderLeft: 0,
                                                background: isCurrentMonth
                                                    ? "linear-gradient(178deg, color-mix(in srgb, var(--agenda-text-primary) 3%, transparent), color-mix(in srgb, var(--agenda-text-primary) 0.5%, transparent))"
                                                    : "color-mix(in srgb, var(--agenda-surface-base) 80%, transparent)",
                                                opacity: isCurrentMonth ? 1 : 0.5,
                                                boxShadow: isToday
                                                    ? "inset 0 0 0 2px color-mix(in srgb, var(--agenda-highlight) 42%, transparent)"
                                                    : "none",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 0.5,
                                                padding: "10px",
                                                overflow: "hidden",
                                                position: "relative",
                                                zIndex: 0,
                                                "&::before": hasEvents
                                                    ? {
                                                        content: '""',
                                                        position: "absolute",
                                                        inset: isActiveDate ? "-1px" : "0px",
                                                        background: isCurrentMonth
                                                            ? "linear-gradient(178deg, color-mix(in srgb, var(--agenda-surface-elevated) 98%, transparent), color-mix(in srgb, var(--agenda-surface-base) 96%, transparent))"
                                                            : "color-mix(in srgb, var(--agenda-surface-base) 96%, transparent)",
                                                        border: "1px solid var(--agenda-panel-border)",
                                                        opacity: isActiveDate ? 1 : 0,
                                                        transition: "opacity 180ms ease",
                                                        pointerEvents: "none",
                                                        zIndex: 0,
                                                    }
                                                    : undefined,
                                            }}
                                        >
                                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                                                <Typography
                                                    sx={{
                                                        position: "relative",
                                                        zIndex: 1,
                                                        color: isToday ? "var(--agenda-highlight)" : "var(--agenda-text-primary)",
                                                        fontWeight: 700,
                                                        fontSize: { xs: "0.82rem", md: "0.92rem" },
                                                    }}
                                                >
                                                    {cellDate.getUTCDate()}
                                                </Typography>
                                                {isToday && (
                                                    <Typography sx={{ position: "relative", zIndex: 1, color: "var(--agenda-highlight)", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                                        Today
                                                    </Typography>
                                                )}
                                            </Box>

                                            <Box sx={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 0.5, overflow: "hidden" }}>
                                                {cellEvents.slice(0, MAX_EVENT_LINES_PER_DAY).map((eventItem) => {
                                                    const participants = (eventItem.actorIds || eventItem.participantActorIds || [])
                                                        .map((actorId) => save.actors[actorId])
                                                        .filter(Boolean) as Actor[];
                                                    const leadActor = participants[0];
                                                    const eventPast = isPastEvent(eventItem, currentDateKey, currentSlotIndex);

                                                    return (
                                                        <Box
                                                            key={eventItem.id}
                                                            style={{
                                                                padding: 0,
                                                                width: "100%",
                                                                opacity: eventPast ? 0.45 : 1,
                                                            }}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    position: "relative",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                        backgroundColor: leadActor?.themeColor
                                                                            ? `${leadActor.themeColor}22`
                                                                            : "color-mix(in srgb, var(--agenda-accent-primary) 14%, transparent)",
                                                                        border: `1px solid ${leadActor?.themeColor || "var(--agenda-accent-primary)"}`,
                                                                    borderRadius: "7px",
                                                                    padding: "4px 8px",
                                                                    minHeight: "30px",
                                                                    overflow: "hidden",
                                                                }}
                                                            >
                                                                <Box
                                                                    sx={{
                                                                        position: "absolute",
                                                                        right: 6,
                                                                        top: "50%",
                                                                        transform: "translateY(-50%)",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        pointerEvents: "none",
                                                                        zIndex: 1,
                                                                    }}
                                                                >
                                                                    {participants.slice(0, 4).map((actor, index) => (
                                                                        <Box
                                                                            key={`${eventItem.id}-${actor.id}`}
                                                                            sx={{
                                                                                width: 20,
                                                                                height: 20,
                                                                                marginLeft: index === 0 ? 0 : -0.9,
                                                                                borderRadius: "50%",
                                                                                border: "1px solid var(--agenda-line-subtle)",
                                                                                backgroundImage: `url(${getEmotionImage(actor, "neutral", stageInstance, actor.outfitId) || getEmotionImage(actor, "base", stageInstance, actor.outfitId)})`,
                                                                                backgroundSize: "cover",
                                                                                backgroundPosition: "top center",
                                                                                backgroundColor: "color-mix(in srgb, var(--agenda-surface-base) 88%, transparent)",
                                                                                boxShadow: "0 1px 4px color-mix(in srgb, var(--agenda-surface-base) 70%, transparent)",
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </Box>

                                                                <Typography
                                                                    sx={{
                                                                        position: "relative",
                                                                        zIndex: 2,
                                                                        color: "var(--agenda-text-primary)",
                                                                        fontSize: "0.72rem",
                                                                        fontWeight: 700,
                                                                        letterSpacing: "0.01em",
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        paddingRight: "48px",
                                                                        width: "100%",
                                                                        fontFamily: leadActor?.themeFontFamily || "inherit",
                                                                        textShadow: "0 1px 2px color-mix(in srgb, var(--agenda-surface-base) 82%, transparent)",
                                                                        WebkitTextStroke: `0.6px ${leadActor?.themeColor || "var(--agenda-surface-base)"}`,
                                                                    }}
                                                                >
                                                                    {eventItem.recurrence ? "↻ " : ""}{eventItem.name} · {formatDurationSummary(eventItem)}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    </motion.div>
                                );
                            })}
                        </Box>
                    </GlassPanel>
            </Box>

            <AnimatePresence>
                {selectedDateKey && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => {
                            setSelectedDateKey(null);
                            setSelectedEventId(null);
                        }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "linear-gradient(180deg, var(--agenda-atmosphere-start), var(--agenda-atmosphere-end))",
                            backdropFilter: "blur(5px)",
                            zIndex: 1200,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "16px",
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.97 }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                            onClick={(event) => event.stopPropagation()}
                            style={{ width: "min(1100px, 94vw)" }}
                        >
                            <GlassPanel variant="bright" style={{ display: "flex", flexDirection: "column", gap: 1, height: "50vh", maxHeight: "88vh", minHeight: 0 }}>
                                {(() => {
                                    const dateEvents = eventsByDate.get(selectedDateKey) || [];
                                    const orderedDateEvents = [...dateEvents].sort((left, right) => compareEventSchedule(left, right));
                                    const selectedEvent = dateEvents.find((eventItem) => eventItem.id === selectedEventId) || null;
                                    const selectedEventPast = selectedEvent ? isPastEvent(selectedEvent, currentDateKey, currentSlotIndex) : true;

                                    return (
                                        <>
                                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                                    <Box>
                                        <Typography sx={{ color: "var(--agenda-text-primary)", fontWeight: 700, fontSize: { xs: "1rem", md: "1.2rem" } }}>
                                            Events on {formatDate(selectedDateKey)}
                                        </Typography>
                                        <Typography sx={{ color: "var(--agenda-text-muted)", fontSize: "0.88rem" }}>
                                            Select an event, then confirm to begin.
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ color: "var(--agenda-highlight)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                                        Current Time: {formatTimeOfDay(currentTimeOfDay)}
                                    </Typography>
                                </Box>

                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        flex: 1,
                                        border: "1px solid var(--agenda-panel-border)",
                                        borderRadius: "12px",
                                        background: "linear-gradient(180deg, var(--agenda-panel-surface), var(--agenda-surface-raised))",
                                        padding: "12px",
                                        minHeight: 0,
                                        overflowY: "auto",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                            gap: 1,
                                            mb: 1.2,
                                        }}
                                    >
                                        {TIME_OF_DAY_ORDER.map((slot, slotIndex) => {
                                            const slotIsPast = isPastSlot(selectedDateKey, currentDateKey, currentSlotIndex, slotIndex);

                                            return (
                                                <Box
                                                    key={slot}
                                                    sx={{
                                                        minWidth: 0,
                                                        borderLeft: slotIndex === 0 ? "none" : "1px solid var(--agenda-panel-border)",
                                                        pl: slotIndex === 0 ? 0 : 1,
                                                        opacity: slotIsPast ? 0.45 : 1,
                                                    }}
                                                >
                                                    <Typography sx={{ color: "var(--agenda-text-primary)", fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                                        {formatTimeOfDay(slot)}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>

                                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minHeight: 0 }}>
                                        {orderedDateEvents.length === 0 && (
                                            <Typography sx={{ color: "var(--agenda-text-muted)", fontSize: "0.8rem", fontStyle: "italic", opacity: 0.7 }}>
                                                No events
                                            </Typography>
                                        )}

                                        {orderedDateEvents.map((eventItem) => {
                                            const participants = (eventItem.actorIds || eventItem.participantActorIds || [])
                                                .map((actorId) => save.actors[actorId])
                                                .filter(Boolean) as Actor[];
                                            const leadActor = participants[0];
                                            const eventIsPast = isPastEvent(eventItem, currentDateKey, currentSlotIndex);
                                            const selected = selectedEventId === eventItem.id;
                                            const startSlotIndex = Math.max(getEventStartSlotIndex(eventItem), 0);
                                            const endSlotIndex = Math.max(getEventEndSlotIndex(eventItem), startSlotIndex);

                                            return (
                                                <Box
                                                    key={eventItem.id}
                                                    sx={{
                                                        position: "relative",
                                                        display: "grid",
                                                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                                        columnGap: 1,
                                                        alignItems: "stretch",
                                                        '&::before': {
                                                            content: '""',
                                                            position: "absolute",
                                                            inset: 0,
                                                            borderRadius: "10px",
                                                            background: "linear-gradient(90deg, var(--agenda-surface-elevated) 0%, var(--agenda-surface-elevated) 25%, var(--agenda-panel-surface) 25%, var(--agenda-panel-surface) 50%, var(--agenda-surface-elevated) 50%, var(--agenda-surface-elevated) 75%, var(--agenda-panel-surface) 75%, var(--agenda-panel-surface) 100%)",
                                                            opacity: 0.18,
                                                            pointerEvents: "none",
                                                        },
                                                    }}
                                                >
                                                    <motion.button
                                                        type="button"
                                                        onClick={() => setSelectedEventId(eventItem.id)}
                                                        whileHover={{ scale: 1.01 }}
                                                        whileTap={{ scale: 0.995 }}
                                                        style={{
                                                            appearance: "none",
                                                            border: selected
                                                                ? `2px solid ${leadActor?.themeColor || "var(--agenda-highlight)"}`
                                                                : `1px solid ${leadActor?.themeColor || "var(--agenda-panel-border)"}`,
                                                            borderRadius: "9px",
                                                            padding: "10px",
                                                            background: "linear-gradient(145deg, var(--agenda-surface-elevated), var(--agenda-surface-base))",
                                                            textAlign: "left",
                                                            width: "100%",
                                                            cursor: "pointer",
                                                            opacity: eventIsPast ? 0.4 : 1,
                                                            gridColumn: `${startSlotIndex + 1} / ${endSlotIndex + 2}`,
                                                            position: "relative",
                                                            zIndex: 1,
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        <Typography sx={{ color: "var(--agenda-text-primary)", fontSize: "0.8rem", fontWeight: 700, lineHeight: 1.3 }}>
                                                            {eventItem.recurrence ? "↻ " : ""}{eventItem.name}
                                                        </Typography>
                                                        <Typography sx={{ color: "var(--agenda-text-muted)", fontSize: "0.72rem", mt: 0.4 }}>
                                                            {formatDurationSummary(eventItem)} · {save.atlas[eventItem.locationId]?.name || "Unknown Location"}
                                                        </Typography>
                                                        {eventItem.recurrence && (
                                                            <Typography sx={{ color: "var(--agenda-text-muted)", fontSize: "0.67rem", mt: 0.3, opacity: 0.86 }}>
                                                                {formatRecurrenceSummary(eventItem.recurrence)}
                                                            </Typography>
                                                        )}
                                                    </motion.button>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>

                                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                                    <Button
                                        variant="primary"
                                        onClick={() => selectedEventId && openEvent(selectedEventId)}
                                        onMouseEnter={() => selectedEvent ? setTooltip(`Open event: ${selectedEvent.name}`, EventAvailable) : undefined}
                                        onMouseLeave={clearTooltip}
                                        disabled={!selectedEvent || selectedEventPast}
                                        style={{ padding: "10px 14px", opacity: !selectedEvent || selectedEventPast ? 0.5 : 1 }}
                                    >
                                        Confirm
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setSelectedDateKey(null);
                                            setSelectedEventId(null);
                                        }}
                                        style={{ padding: "10px 14px" }}
                                    >
                                        Back
                                    </Button>
                                </Box>
                                        </>
                                    );
                                })()}
                            </GlassPanel>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => {stage().saveGame(); setShowContentManagement(false);}}
                />
            )}
        </>
    );
};
