import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const isAdmin = email === process.env.ADMIN_EMAIL;
  return NextResponse.json({ isAdmin });
}