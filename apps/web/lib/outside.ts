"use client";

import { useEffect } from "react";
import type { DependencyList } from "react";

export const useSubscription = (subscribe: () => () => void, deps: DependencyList) => {
  useEffect(subscribe, deps);
};

export const useImperative = (apply: () => void, deps: DependencyList) => {
  useEffect(apply, deps);
};
