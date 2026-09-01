import { NextRequest, NextResponse } from "next/server";
import {
  UserBaseline,
  deleteUserBaseline,
  getUserBaseline,
  listUserBaselines,
  upsertUserBaseline,
} from "@/lib/userBaseline";

// GET /api/user-baseline          → 전체 목록
// GET /api/user-baseline?userId=  → 특정 사용자 베이스라인 (없으면 404)
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (userId) {
    const baseline = await getUserBaseline(userId);
    if (!baseline) {
      return NextResponse.json({ error: "해당 userId의 베이스라인이 없습니다." }, { status: 404 });
    }
    return NextResponse.json(baseline);
  }

  return NextResponse.json(await listUserBaselines());
}

// POST /api/user-baseline → 생성 또는 갱신 (userId 기준 upsert)
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body.userId !== "string" || body.userId.trim() === "") {
    return NextResponse.json({ error: "userId는 필수입니다." }, { status: 400 });
  }

  const baseline: UserBaseline = {
    userId: body.userId,
    avgTransfer: Number(body.avgTransfer) || 0,
    stdTransfer: Number(body.stdTransfer) || 0,
    avgWithdrawal: Number(body.avgWithdrawal) || 0,
    dailySpendAvg: Number(body.dailySpendAvg) || 0,
    knownPayees: Array.isArray(body.knownPayees) ? body.knownPayees : [],
    activeHours: Array.isArray(body.activeHours) && body.activeHours.length === 2 ? body.activeHours : [0, 24],
    typicalCategories: Array.isArray(body.typicalCategories) ? body.typicalCategories : [],
    usualRegion: typeof body.usualRegion === "string" ? body.usualRegion : "",
  };

  return NextResponse.json(await upsertUserBaseline(baseline));
}

// DELETE /api/user-baseline?userId=
export async function DELETE(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const deleted = await deleteUserBaseline(userId);
  if (!deleted) {
    return NextResponse.json({ error: "해당 userId의 베이스라인이 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
