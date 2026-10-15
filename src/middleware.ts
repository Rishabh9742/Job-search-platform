import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/register"];

/** Cheap cookie-presence gate; real session validation happens server-side in each page/route. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname) || pathname.startsWith("/api/")) return NextResponse.next();
  if (!req.cookies.get("jp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
