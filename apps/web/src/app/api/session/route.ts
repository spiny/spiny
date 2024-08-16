
import { jwtSign, jwtVerify } from "~/lib/server/jwt.ts";
import { NextResponse } from 'next/server';

import type { NextRequest } from "next/server";


export async function GET(request: NextRequest) {
  const token = request.cookies.get('session-jwt');
  const sessionData = jwtVerify(token?.value);

  return Response.json({ "status": "ok", "data": sessionData });
}


export async function POST(request: NextRequest) {
  const data = await request.json();

  const response = NextResponse.redirect('/');

  if (!data?.id) {
    response.cookies.delete('session-jwt');
  } else {

    const token = jwtSign({ ...data });

    response.cookies.set('session-jwt', token);
  }

  return response;
}
