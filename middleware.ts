import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rediriger l'URL '/&' vers la page d'accueil
  if (pathname === '/&' || pathname === '/&/') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Bloquer l'indexation des fichiers de polices avec un en-tête HTTP
  if (pathname.startsWith('/fonts/')) {
    const response = NextResponse.next();
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2|eot|otf)).*)',
  ],
};
