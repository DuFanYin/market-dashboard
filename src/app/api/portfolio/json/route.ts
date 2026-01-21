import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";

const dataJsonPath = path.join(process.cwd(), "data", "account.json");

export async function GET() {
  try {
    const raw = await fs.readFile(dataJsonPath, "utf8");
    return NextResponse.json({ json: raw });
  } catch (error) {
    console.error("[portfolio JSON API] Failed to read JSON file:", error);
    return NextResponse.json({ error: "Failed to read portfolio JSON file" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { json?: string };
    if (typeof body.json !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'json' field" }, { status: 400 });
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(body.json) as Record<string, unknown>;
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON content" }, { status: 400 });
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "JSON must parse to an object" }, { status: 400 });
    }

    parsed = {
      ...parsed,
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(dataJsonPath, JSON.stringify(parsed, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[portfolio JSON API] Failed to save JSON file:", error);
    return NextResponse.json({ error: "Failed to save portfolio JSON file" }, { status: 500 });
  }
}

