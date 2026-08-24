import fs from "fs/promises";
import path from "path";

const dataDir = path.join(process.cwd(), "data"); // JSON 파일 기반 "DB"가 저장되는 디렉터리

// data/{fileName}을 읽어서 JSON 파싱. 파일 내용이 실제로 T 형태라고 가정합니다(런타임 검증 없음).
export async function readJSON<T>(fileName: string): Promise<T> {
  const filePath = path.join(dataDir, fileName);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

// data/{fileName}에 JSON으로 덮어쓰기 저장 (2-space indent).
export async function writeJSON<T>(fileName: string, data: T): Promise<void> {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
