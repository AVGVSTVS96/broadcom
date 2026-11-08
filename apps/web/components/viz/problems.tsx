export const Problems = ({ problems }: { problems: readonly string[] }) =>
  problems.map((problem) => (
    <p
      key={problem}
      className="rounded-2xl border border-bad/40 px-4 py-3 text-sm text-bad"
      role="alert"
    >
      {problem}
    </p>
  ));
