import { NextRequest, NextResponse } from "next/server";
import {
  createGuardianLink,
  deleteGuardianLinkByPair,
  listGuardiansForSenior,
  listSeniorsForGuardian,
  updateGuardianLinkAlert,
} from "@/lib/guardianLink";

export async function GET(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");

  if (seniorUserId) return NextResponse.json(await listGuardiansForSenior(seniorUserId));
  if (guardianEmail) return NextResponse.json(await listSeniorsForGuardian(guardianEmail));
  return NextResponse.json(
    { error: "seniorUserId 또는 guardianEmail 쿼리 파라미터가 필요합니다." },
    { status: 400 },
  );
}

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

  const link = await createGuardianLink({
    seniorUserId: body.seniorUserId,
    guardianEmail: body.guardianEmail,
    guardianName: typeof body.guardianName === "string" ? body.guardianName : undefined,
    relation: typeof body.relation === "string" ? body.relation : undefined,
    alertEnabled: typeof body.alertEnabled === "boolean" ? body.alertEnabled : undefined,
  });
  if (!link) return NextResponse.json({ error: "이미 등록된 연결입니다." }, { status: 409 });
  return NextResponse.json(link);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (typeof body.seniorUserId !== "string" || body.seniorUserId.trim() === "") {
    return NextResponse.json({ error: "seniorUserId는 필수입니다." }, { status: 400 });
  }
  if (typeof body.guardianEmail !== "string" || body.guardianEmail.trim() === "") {
    return NextResponse.json({ error: "guardianEmail은 필수입니다." }, { status: 400 });
  }
  if (typeof body.alertEnabled !== "boolean") {
    return NextResponse.json({ error: "alertEnabled는 필수이며 boolean이어야 합니다." }, { status: 400 });
  }

  const updated = await updateGuardianLinkAlert(
    body.seniorUserId,
    body.guardianEmail,
    body.alertEnabled,
  );
  if (!updated) return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const seniorUserId = request.nextUrl.searchParams.get("seniorUserId");
  const guardianEmail = request.nextUrl.searchParams.get("guardianEmail");
  if (!seniorUserId) {
    return NextResponse.json({ error: "seniorUserId 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!guardianEmail) {
    return NextResponse.json({ error: "guardianEmail 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!await deleteGuardianLinkByPair(seniorUserId, guardianEmail)) {
    return NextResponse.json({ error: "해당 조합의 연결이 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
