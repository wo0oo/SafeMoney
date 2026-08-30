import Link from "next/link";
import type { ReactNode } from "react";

const elderItems = [
  ["🏠", "홈", "/elder", "home"],
  ["🔎", "거래 확인", "/elder/risk-check", "risk"],
  ["🕒", "내역", "/elder/history", "history"],
  ["👨‍💼", "보호자", "/elder/guardian", "guardian"],
] as const;

export function AppShell({ title, active, children, bell = false }: {
  title: string; active: string; children: ReactNode; bell?: boolean;
}) {
  return (
    <div className="relative h-[1024px] w-[1440px] overflow-hidden bg-[#fafafa]">
      <aside className="absolute inset-y-0 left-0 w-[250px] border border-[#d9d9d9] bg-white">
        <div className="absolute left-[32px] top-[28px] text-[30px] font-semibold leading-none">safemoney</div>
        <div className="absolute left-[32px] top-[70px] text-[20px] font-medium text-[#6b6b6b]">노인 계정</div>
        <div className="absolute left-[24px] top-[104px] h-px w-[202px] bg-[#d9d9d9]" />
        <nav className="absolute left-[18px] top-[126px] w-[214px]">
          {elderItems.map(([icon, label, href, key]) => (
            <Link key={key} href={href} className={`mb-[14px] flex h-[54px] items-center rounded-[8px] px-[14px] text-[20px] no-underline ${active === key ? "bg-[#f5f5f5] font-semibold" : "font-normal"}`}>
              <span className="mr-[16px] inline-flex h-[24px] w-[24px] items-center justify-center text-[24px]">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-[70px] left-[32px] text-[20px] font-medium">OOO님</div>
        <Link href="/login/elder" className="absolute bottom-[41px] left-[32px] text-[14px] text-[#6b6b6b] no-underline">로그아웃</Link>
      </aside>
      <header className="absolute left-[250px] top-0 flex h-[88px] w-[1190px] items-center border border-[#d9d9d9] bg-white px-[47px]">
        <h1 className="m-0 text-[28px] font-semibold">{title}</h1>
        {bell && active !== "home" && <span className="ml-auto text-[24px]">🔔</span>}
      </header>
      <main
        className="absolute left-[250px] top-[88px] h-[936px] w-[1190px]"
        style={{ backgroundColor: active === "home" ? "#ffffff" : "#fafafa" }}
      >
        {children}
      </main>
    </div>
  );
}
