export type View = "code" | "changes" | "history";

const segments = (file: string) => file.split("/").map(encodeURIComponent).join("/");

const query = (pairs: Record<string, string>) => {
  const search = new URLSearchParams(
    Object.entries(pairs).filter(([, value]) => value !== ""),
  ).toString();

  return search === "" ? "" : `?${search}`;
};

export const filesHref = {
  changes: (ws: string) => `/files/${ws}/changes`,
  code: (ws: string, file = "", mode = "") =>
    `/files/${ws}/code${file === "" ? "" : `/${segments(file)}`}${query({ mode })}`,
  drafts: (name = "") => `/files/drafts${name === "" ? "" : `/${encodeURIComponent(name)}`}`,
  history: (ws: string, sha = "", path = "") =>
    `/files/${ws}/history${sha === "" ? "" : `/${sha}`}${query({ path })}`,
  raw: (ws: string, path: string) => `/api/files/raw${query({ path, ws })}`,
};

export const parseFilesPath = (pathname: string) => {
  const [ws = "", view = "code", ...rest] = pathname.split("/").slice(2);
  const known: View[] = ["code", "changes", "history"];
  const current = known.find((each) => each === view) ?? "code";

  return {
    file: current === "code" ? rest.map(decodeURIComponent).join("/") : "",
    view: current,
    ws: decodeURIComponent(ws),
  };
};
