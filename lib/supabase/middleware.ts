import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Reflète profiles.must_change_password sans re-questionner Supabase à
// chaque navigation — posé par signIn()/changePassword() dans
// lib/actions/auth-actions.ts, qui sont les deux seuls endroits où ce champ
// change. Purement un raccourci de confort (évite un aller-retour DB sur
// CHAQUE page vue) : si le cookie est absent, on retombe sur la vraie
// requête ci-dessous, donc aucune régression possible sur des sessions
// ouvertes avant ce changement.
const MUST_CHANGE_PASSWORD_COOKIE = "cpw";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const isChangePasswordRoute = request.nextUrl.pathname.startsWith("/change-password");
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next");

  if (!user && !isAuthRoute && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && !isChangePasswordRoute && !isPublicAsset) {
    const cookieValue = request.cookies.get(MUST_CHANGE_PASSWORD_COOKIE)?.value;
    let mustChangePassword: boolean;

    if (cookieValue === "0" || cookieValue === "1") {
      mustChangePassword = cookieValue === "1";
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .single();
      mustChangePassword = !!profile?.must_change_password;
      response.cookies.set(MUST_CHANGE_PASSWORD_COOKIE, mustChangePassword ? "1" : "0", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    if (mustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
