import { list, put, get } from "@vercel/blob";

// data/*.json 로컬 파일을 읽고 쓰던 이전 방식은 Vercel 배포 환경(서버리스 함수, 읽기 전용
// 파일시스템)에서 write가 동작하지 않아 Vercel Blob으로 교체했습니다. 저장 데이터에
// userId·거래 내역 등 개인 금융정보가 포함돼 있어 access는 private으로 고정합니다.
// 로컬 개발도 동일하게 Blob을 사용하므로 .env.local에 BLOB_READ_WRITE_TOKEN이 필요합니다
// (Vercel 대시보드 → Storage → Blob store → .env.local 탭에서 복사).
export async function readJSON<T>(fileName: string): Promise<T> {
  const { blobs } = await list({ prefix: fileName, limit: 1 });
  const blob = blobs.find((b) => b.pathname === fileName);
  if (!blob) {
    throw new Error(`Blob store에 ${fileName}이 없습니다. 초기 데이터를 먼저 업로드해주세요.`);
  }

  const result = await get(blob.url, { access: "private" });
  if (!result) {
    throw new Error(`${fileName} blob을 읽지 못했습니다.`);
  }
  const text = await new Response(result.stream as ReadableStream).text();
  return JSON.parse(text) as T;
}

export async function writeJSON<T>(fileName: string, data: T): Promise<void> {
  await put(fileName, JSON.stringify(data, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
