import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.url.slice(request.url.indexOf("/", request.url.indexOf("://") + 3));
  const rawPath = pathname.split(/[?#]/, 1)[0];

  for (const segment of rawPath.split("/")) {
    let decoded = segment;
    try {
      for (let pass = 0; pass < 3; pass++) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      }
    } catch {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }

    if (decoded === "." || decoded === ".." || /[\\/\0]/.test(decoded))
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
