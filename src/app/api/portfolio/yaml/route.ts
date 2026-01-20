import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { load, dump } from "js-yaml";

const dataYamlPath = path.join(process.cwd(), "data", "account.yaml");

export async function GET() {
  try {
    const raw = await fs.readFile(dataYamlPath, "utf8");
    return NextResponse.json({ yaml: raw });
  } catch (error) {
    console.error("[portfolio YAML API] Failed to read YAML file:", error);
    return NextResponse.json(
      { error: "Failed to read portfolio YAML file" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { yaml?: string };
    if (typeof body.yaml !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'yaml' field in request body" },
        { status: 400 }
      );
    }

    let parsed = load(body.yaml) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "YAML content must parse to an object at the top level" },
        { status: 400 }
      );
    }

    // Always bump timestamp on manual save
    parsed = {
      ...parsed,
      timestamp: new Date().toISOString(),
    };

    const content = dump(parsed, { noRefs: true, lineWidth: 240 });
    await fs.writeFile(dataYamlPath, content, "utf8");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[portfolio YAML API] Failed to save YAML file:", error);
    return NextResponse.json(
      { error: "Failed to save portfolio YAML file" },
      { status: 500 }
    );
  }
}

