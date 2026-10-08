import { NextResponse } from "next/server";

/** Root of the API surface. The app itself lives at `/`. */
export async function GET() {
  return NextResponse.json({
    name: "Swixo API",
    status: "ok",
    health: "/api/health",
  });
}
