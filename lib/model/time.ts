const minute = 60_000;

const hour = 60 * minute;

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const weekday = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const date = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

export const when = (at: number, now: number) => {
  const away = Math.abs(now - at);

  if (away < 20 * hour) {
    return clock.format(at);
  }

  return away < 6 * 24 * hour ? weekday.format(at) : date.format(at);
};

export const day = (at: number) => date.format(at);

export const ago = (at: number, now: number) => {
  const minutes = Math.max(0, Math.round((now - at) / minute));

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    const rest = minutes % 60;

    return rest === 0 || hours >= 10 ? `${hours} h` : `${hours} h ${rest} min`;
  }

  return `${Math.floor(hours / 24)} d`;
};
