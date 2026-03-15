"use client";

import { useEffect } from "react";

export default function FarcasterReady() {
  useEffect(() => {
    const init = async () => {
      try {
        const { default: sdk } = await import("@farcaster/frame-sdk");
        await sdk.actions.ready();
      } catch {
        // Not in Farcaster context, ignore
      }
    };
    init();
  }, []);

  return null;
}
