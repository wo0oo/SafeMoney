import { NextRequest, NextResponse } from "next/server";
import {
  approveGuardianLink,
  createGuardianLink,
  deleteGuardianLinkByPair,
  listGuardiansForSenior,
  listPendingRequestsForSenior,
  listSeniorsForGuardian,
  updateGuardianLinkAlert,
} from "@/lib/guardianLink";

// GET /api/guardian-link?seniorUserId=                  → 그 시니어의 승인된 보호자 목록
// GET /api/guardian-link?seniorUserId=&status=pending    → 그 시니어에게 온 대기 중 요청 목록
// GET /api/guardian-link?guardianEmail=                 → 그 보호자가 보는 승인된 피보호자(시니어) 목록
// 최소 하나는 필수 — 둘 다 없으면 400.
export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");
  const status = request.nextUrl.searchParams.get("status");

  if (seniorUserId && status === "pending") {
    return NextResponse.json(await listPendingRequestsForSenior(seniorUserId));
  }

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

// POST /api/guardian-link → 연결(또는 승인 요청) 등록
// initiatedBy: "senior"면 즉시 승인(approved), "guardian"이면 대기(pending) 상태로 생성.
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
  if (body.alertEnabled !== undefined && typeof body.alertEnabled !== "boolean") {
    return NextResponse.json({ error: "alertEnabled는 boolean이어야 합니다." }, { status: 400 });
  }
  if (body.initiatedBy !== "senior" && body.initiatedBy !== "guardian") {
    return NextResponse.json({ error: "initiatedBy는 senior 또는 guardian이어야 합니다." }, { status: 400 });
  }

  const link = await createGuardianLink({
    seniorUserId: body.seniorUserId,
    guardianEmail: body.guardianEmail,
    guardianName: typeof body.guardianName === "string" ? body.guardianName : undefined,
    relation: typeof body.relation === "string" ? body.relation : undefined,
    alertEnabled: typeof body.alertEnabled === "boolean" ? body.alertEnabled : undefined,
    status: body.initiatedBy === "senior" ? "approved" : "pending",
  });

  if (!link) {
    return NextResponse.json({ error: "이미 등록됐거나 요청을 보낸 연결입니다." }, { status: 409 });
  }

  return NextResponse.json(link);
}

// DELETE /api/guardian-link?seniorUserId=&guardianEmail=
// id 단독이 아니라 조합을 요구한다 — GET으로 id가 노출되므로 id만으로는 삭제할 수 없게 하기 위함.
// 대기 중 요청 거부와 승인된 연결 해제 양쪽에 재사용한다.
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

// PATCH /api/guardian-link → alertEnabled 변경 또는(대기 중 요청) 승인
// body: { seniorUserId, guardianEmail, alertEnabled?, approve? } — alertEnabled/approve 중
// 최소 하나는 있어야 한다. approve: true가 있으면 승인 처리를 먼저 한다.
export async function PATCH(request: NextRequest) {
  const body = await request.json();

  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }
  if (body.approve !== undefined && body.approve !== true) {
    return NextResponse.json({ error: "approve는 true여야 합니다." }, { status: 400 });
  }
  if (body.alertEnabled !== undefined && typeof body.alertEnabled !== "boolean") {
    return NextResponse.json({ error: "alertEnabled는 boolean이어야 합니다." }, { status: 400 });
  }
  if (body.approve === undefined && body.alertEnabled === undefined) {
    return NextResponse.json({ error: "approve 또는 alertEnabled 중 하나는 필요합니다." }, { status: 400 });
  }

  if (body.approve === true) {
    const approved = await approveGuardianLink(body.seniorUserId, body.guardianEmail);
    if (!approved) {
      return NextResponse.json({ error: "대기 중인 해당 조합의 요청이 없습니다." }, { status: 404 });
    }
    return NextResponse.json(approved);
  }

  const updated = await updateGuardianLinkAlert(body.seniorUserId, body.guardianEmail, body.alertEnabled);
  if (!updated) {
    return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  }

  return NextResponse.json(updated);
}
