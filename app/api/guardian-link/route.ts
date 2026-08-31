import { NextRequest, NextResponse } from "next/server";
import {
  createGuardianLink,
  deleteGuardianLinkByPair,
  listGuardiansForSenior,
  listSeniorsForGuardian,
} from "@/lib/guardianLink";

// GET /api/guardian-link?seniorUserId=  → 그 시니어의 보호자 목록
// GET /api/guardian-link?guardianEmail= → 그 보호자가 보는 피보호자(시니어) 목록
// 최소 하나는 필수 — 둘 다 없으면 400.
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");

  if (seniorUserId) {
    return NextResponse.json(await listGuardiansForSenior(seniorUserId));
  }

  if (guardianEmail) {
    return NextResponse.json(await listSeniorsForGuardian(guardianEmail));
  }

  return NextResponse.json(
    { error: "seniorUserId 또는 guardianEmail 쿼리 파라미터가 필요합니다." },
    { status: 400 }
  );
}

// POST /api/guardian-link → 연결 즉시 등록 (승인/대기 절차 없음)
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }
  if (!body.guardianEmail.trim().includes("@")) {
    return NextResponse.json({ error: "guardianEmail 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const link = await createGuardianLink({
    seniorUserId: body.seniorUserId,
    guardianEmail: body.guardianEmail,
    guardianName: typeof body.guardianName === "string" ? body.guardianName : undefined,
    relation: typeof body.relation === "string" ? body.relation : undefined,
  });

  if (!link) {
    return NextResponse.json({ error: "이미 등록된 연결입니다." }, { status: 409 });
  }

  return NextResponse.json(link);
}

// DELETE /api/guardian-link?seniorUserId=&guardianEmail=
// id 단독이 아니라 조합을 요구한다 — GET으로 id가 노출되므로 id만으로는 삭제할 수 없게 하기 위함.
export async function DELETE(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");

  if (!seniorUserId) {
    return NextResponse.json({ error: "seniorUserId 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!guardianEmail) {
    return NextResponse.json({ error: "guardianEmail 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const deleted = await deleteGuardianLinkByPair(seniorUserId, guardianEmail);
  if (!deleted) {
    return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
