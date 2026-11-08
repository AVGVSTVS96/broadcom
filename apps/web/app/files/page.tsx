import { redirect } from "next/navigation";

import { filesHref } from "@/features/files/urls";
import { listRepos } from "@/lib/files/repos";

const Files = async () => {
  const [first] = await listRepos();

  if (first !== undefined) {
    redirect(filesHref.code(first.id));
  }

  return (
    <p className="text-muted-foreground">
      No repos yet. List them in ~/.config/broadcom/files.json.
    </p>
  );
};

export default Files;
