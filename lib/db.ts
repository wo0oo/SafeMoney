import fs from "fs/promises";
import path from "path";

const dataDir = path.join(process.cwd(), "data");

export async function readJSON<T>(fileName: string): Promise<T> {
  const filePath = path.join(dataDir, fileName);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function writeJSON<T>(fileName: string, data: T): Promise<void> {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
