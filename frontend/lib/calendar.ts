/** Genera enlaces de "agregar al calendario" sin dependencias:
 * archivo .ics (Apple/Outlook/etc.) y URL de plantilla de Google Calendar.
 * Las horas son locales flotantes: "a las 15:00 en la barbería", sin líos de TZ. */

export interface CalendarEvent {
  title: string;
  dateLocal: string; // YYYY-MM-DD
  timeLocal: string; // HH:MM
  durationMin: number;
  description: string;
  location?: string;
}

function startEnd(event: CalendarEvent): { start: Date; end: Date } {
  const [y, m, d] = event.dateLocal.split("-").map(Number);
  const [hh, mm] = event.timeLocal.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm, 0);
  const end = new Date(start.getTime() + event.durationMin * 60_000);
  return { start, end };
}

function compact(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildICS(event: CalendarEvent): string {
  const { start, end } = startEnd(event);
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Will Barber Shop//Turnos//ES",
    "BEGIN:VEVENT",
    `UID:${compact(start)}-turno@willbarbershop`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${compact(start)}`,
    `DTEND:${compact(end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeICS(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function icsDataUrl(event: CalendarEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildICS(event))}`;
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const { start, end } = startEnd(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(start)}/${compact(end)}`,
    details: event.description,
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
