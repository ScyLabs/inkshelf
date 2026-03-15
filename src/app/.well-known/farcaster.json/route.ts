import { NextResponse } from "next/server";

const DOMAIN = "piece.p1x3lz.io";
const BASE_URL = `https://${DOMAIN}`;

export async function GET() {
  const manifest = {
    accountAssociation: {
      header: "eyJmaWQiOjEwNzQ5NTAsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgzOTVEODk4NEU1RGU4Mjk2RTNiYjk1OWZhNDdBNzA1RDQwNWZkOWRiIn0",
      payload: "eyJkb21haW4iOiJwaWVjZS5wMXgzbHouaW8ifQ",
      signature: "/+otihH4y/XCZzOqYLYdCgFpSy/AfXjJ06azJ52eZ3s/jc2DoYU1Qk0qiCt0XyFJd64Cz8EBHWOgFMufJT9mOxw=",
    },
    frame: {
      version: "1",
      name: "Manga Reader",
      iconUrl: `${BASE_URL}/icons/icon-512.png`,
      homeUrl: BASE_URL,
      imageUrl: `${BASE_URL}/icons/icon-512.png`,
      buttonTitle: "📖 Read Manga",
      splashImageUrl: `${BASE_URL}/icons/icon-192.png`,
      splashBackgroundColor: "#000000",
      webhookUrl: `${BASE_URL}/api/webhook`,
    },
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
