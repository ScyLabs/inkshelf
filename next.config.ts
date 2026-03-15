import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/", revision: Date.now().toString() },
    { url: "/settings", revision: Date.now().toString() },
    { url: "/downloads", revision: Date.now().toString() },
  ],
});

export default withSerwist({
  output: "standalone",
});
