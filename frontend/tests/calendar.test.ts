/** Agregar al calendario (.ics / Google) — Tanda 1. */
import { describe, expect, it } from "vitest";
import { buildICS, googleCalendarUrl, icsDataUrl } from "@/lib/calendar";

const EVENT = {
  title: "Will Santoyo — turno #4",
  dateLocal: "2026-07-10",
  timeLocal: "15:30",
  durationMin: 45,
  description: "Con Barbero 1. Código: ABC123, guárdalo.",
  location: "Will Santoyo",
};

describe("buildICS", () => {
  it("genera un VEVENT con inicio y fin correctos (45 min)", () => {
    const ics = buildICS(EVENT);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260710T153000");
    expect(ics).toContain("DTEND:20260710T161500");
    expect(ics).toContain("SUMMARY:Will Santoyo — turno #4");
    expect(ics).toContain("END:VEVENT");
  });

  it("escapa comas y cruza medianoche correctamente", () => {
    const ics = buildICS({ ...EVENT, timeLocal: "23:45", durationMin: 30 });
    expect(ics).toContain("DTSTART:20260710T234500");
    expect(ics).toContain("DTEND:20260711T001500"); // rueda al día siguiente
    expect(ics).toContain("Código: ABC123\\, guárdalo.");
  });
});

describe("enlaces", () => {
  it("la URL de Google lleva las fechas en formato compacto", () => {
    const url = googleCalendarUrl(EVENT);
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("20260710T153000%2F20260710T161500");
  });

  it("el data URL .ics es descargable", () => {
    expect(icsDataUrl(EVENT)).toMatch(/^data:text\/calendar;charset=utf-8,/);
  });
});
