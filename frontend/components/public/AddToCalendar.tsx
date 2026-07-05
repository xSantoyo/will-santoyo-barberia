"use client";

/** Botones "agregar al calendario del celular": Google Calendar y .ics
 * (Apple/Outlook). Sin dependencias ni servicios externos. */
import { CalendarPlus } from "lucide-react";
import { googleCalendarUrl, icsDataUrl, type CalendarEvent } from "@/lib/calendar";

export default function AddToCalendar({ event }: { event: CalendarEvent }) {
  const buttonClass =
    "data flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-ink-3 px-3 text-xs uppercase tracking-wider text-bone-2 transition-colors hover:border-gold/50 hover:text-gold";
  return (
    <div className="flex gap-2">
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
      >
        <CalendarPlus size={14} /> Google Calendar
      </a>
      <a href={icsDataUrl(event)} download="turno-bad-boys.ics" className={buttonClass}>
        <CalendarPlus size={14} /> Apple / .ics
      </a>
    </div>
  );
}
