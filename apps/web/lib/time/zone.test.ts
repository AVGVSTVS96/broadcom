import { describe, expect, test } from "bun:test";

import { HOUR } from "@/lib/pool/history";
import { hostZone, timeIn, zoneOf } from "@/lib/time/zone";

const pacific = timeIn("America/Los_Angeles");
const eastern = timeIn("America/New_York");
const india = timeIn("Asia/Kolkata");

describe("zone", () => {
  test("tests run outside every zone they check", () => {
    expect(hostZone()).toBe("Pacific/Chatham");
  });

  test("a cookie zone is kept only when it is a real zone, in its canonical spelling", () => {
    expect(zoneOf("America/New_York")).toBe("America/New_York");
    expect(zoneOf("america/new_york")).toBe("America/New_York");
    expect(zoneOf("Mars/Olympus")).toBeNull();
    expect(zoneOf("")).toBeNull();
    expect(zoneOf(undefined)).toBeNull();
  });

  test("two zones read the same instant at once, each its own way", () => {
    const at = Date.UTC(2026, 10, 9, 2);

    expect([pacific.clock(at), eastern.clock(at), india.clock(at)]).toEqual([
      "Sun 6:00 PM",
      "Sun 9:00 PM",
      "Mon 7:30 AM",
    ]);
    expect(timeIn("America/New_York")).toBe(eastern);
  });
});

describe("calendar", () => {
  test("days start at the zone's midnight", () => {
    const at = Date.UTC(2026, 10, 9, 3);

    expect(pacific.startOfDay(at)).toBe(Date.UTC(2026, 10, 8, 8));
    expect(eastern.startOfDay(at)).toBe(Date.UTC(2026, 10, 8, 5));
    expect(india.startOfDay(Date.UTC(2026, 10, 9, 20))).toBe(Date.UTC(2026, 10, 9, 18, 30));
    expect(eastern.dayOfMonth(at)).toBe(8);
    expect(india.hourOfDay(at)).toBe(8);
  });

  test("spring forward makes a 23-hour day and skips 2 AM", () => {
    const day = pacific.startOfDay(Date.UTC(2026, 2, 8, 20));

    expect(day).toBe(Date.UTC(2026, 2, 8, 8));
    expect(pacific.addDays(day, 1) - day).toBe(23 * HOUR);
    expect(pacific.addHours(day, 2)).toBe(Date.UTC(2026, 2, 8, 10));
    expect(pacific.addHours(day, 3)).toBe(Date.UTC(2026, 2, 8, 10));
  });

  test("fall back makes a 25-hour day and repeats 1 AM", () => {
    const day = pacific.startOfDay(Date.UTC(2026, 10, 1, 23));

    expect(day).toBe(Date.UTC(2026, 10, 1, 7));
    expect(pacific.addDays(day, 1) - day).toBe(25 * HOUR);
    expect(pacific.addHours(day, 24)).toBe(Date.UTC(2026, 10, 2, 8));
    expect(pacific.hourOfDay(Date.UTC(2026, 10, 1, 8, 30))).toBe(1);
    expect(pacific.hourOfDay(Date.UTC(2026, 10, 1, 9, 30))).toBe(1);
    expect(pacific.lastDays(Date.UTC(2026, 10, 2, 20), 3)).toEqual([
      Date.UTC(2026, 9, 31, 7),
      Date.UTC(2026, 10, 1, 7),
      Date.UTC(2026, 10, 2, 8),
    ]);
  });

  test("every hour of 2026 matches Temporal in zones with odd offsets and DST rules", () => {
    const zones = ["America/Los_Angeles", "Europe/Berlin", "Australia/Lord_Howe", "Asia/Kathmandu"];

    for (const zone of zones) {
      const calendar = timeIn(zone);
      const misses: string[] = [];

      for (let at = Date.UTC(2026, 0, 1); at < Date.UTC(2027, 0, 1); at += HOUR + 7 * 60_000) {
        const reference = Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone);
        const midnight = reference.startOfDay();

        const ours = [
          calendar.hourOfDay(at),
          calendar.dayOfMonth(at),
          calendar.startOfDay(at),
          calendar.addDays(at, 1),
          calendar.addHours(calendar.startOfDay(at), 6),
        ];

        const theirs = [
          reference.hour,
          reference.day,
          midnight.epochMilliseconds,
          reference.add({ days: 1 }).epochMilliseconds,
          midnight.with({ hour: 6 }).epochMilliseconds,
        ];

        if (ours.join(",") !== theirs.join(",")) {
          misses.push(`${new Date(at).toISOString()} ${ours.join(",")} ${theirs.join(",")}`);
        }
      }

      expect(misses).toEqual([]);
    }
  });

  test("an instant is built from the zone's wall clock", () => {
    expect(eastern.instant(2026, 10, 4, 15, 10)).toBe(Date.UTC(2026, 10, 4, 20, 10));
    expect(pacific.instant(2026, 2, 8, 2, 30)).toBe(Date.UTC(2026, 2, 8, 10, 30));
  });
});

describe("format", () => {
  test("when calls it today by the viewer's own day", () => {
    const now = Date.UTC(2026, 10, 9, 3);
    const at = Date.UTC(2026, 10, 9, 6);

    expect(pacific.when(at, now)).toBe("10 PM");
    expect(eastern.when(at, now)).toBe("Mon 1 AM");
  });

  test("dates, weekdays and hours follow the zone", () => {
    const at = Date.UTC(2026, 10, 15, 6);

    expect(pacific.date(at)).toBe("Nov 14");
    expect(eastern.date(at)).toBe("Nov 15");
    expect(pacific.weekday(at)).toBe("Sat");
    expect(india.hour(at)).toBe("11 AM");
    expect(eastern.clock24(at)).toBe("01:00");
    expect(pacific.day(at, Date.UTC(2027, 0, 2))).toBe("Sat, Nov 14, 2026");
  });
});
