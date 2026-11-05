import { redirect } from "next/navigation";

import { filesHref } from "@/features/files/urls";

const Workspace = async ({ params }: PageProps<"/files/[ws]">) => {
  const { ws } = await params;

  redirect(filesHref.code(ws));
};

export default Workspace;
