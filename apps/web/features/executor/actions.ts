"use server";

import { refresh } from "next/cache";

import { connect, deploy, saveSource } from "@/lib/executor/api";

export const deployApp = async (slug: string) => {
  const done = await deploy(slug);

  refresh();

  return done;
};

export const connectAccount = async (slug: string, requirement: string) => {
  const done = await connect(slug, requirement);

  refresh();

  return done;
};

export const saveFile = async (slug: string, file: string, text: string) => {
  const done = await saveSource(slug, file, text);

  refresh();

  return done;
};
