import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NotificationToggle } from "@/components/notification-toggle";
import { Surface } from "@/components/ui";

export default function ElderHomePage() { return <AppShell title="홈" active="home" bell>
  <h2 className="absolute left-[68px] top-[34px] m-0 text-[28px] font-semibold">안녕하세요, OOO님!</h2><p className="absolute left-[68px] top-[74px] m-0 text-[20px] text-[#6b6b6b]">오늘도 안전한 금융 생활을 확인해보세요.</p>
  <Surface className="absolute left-[68px] top-[134px] h-[190px] w-[1010px] px-[35px] py-[26px]"><h3 className="m-0 text-[20px] font-medium">오늘의 금융 안전 수준</h3><div className="mt-[18px] flex items-center"><span className="text-[46px]">🛡️</span><strong className="ml-[26px] text-[32px]">안전</strong><span className="ml-[72px] text-[20px] text-[#6b6b6b]">최근 확인한 거래에서 특별한 위험 신호가 없어요.</span></div></Surface>
  <h2 className="absolute left-[68px] top-[368px] m-0 text-[28px] font-semibold">빠른 메뉴</h2><div className="absolute left-[68px] top-[422px] flex gap-[34px]"><Quick href="/elder/risk-check" title="거래 위험 확인하기" desc="송금 전 거래의 위험도를 확인"/><Quick href="/elder/history" title="내역 보기" desc="이전 거래 기록과 위험도 확인"/><Quick href="/elder/guardian" title="보호자 설정" desc="보호자 등록 및 알림 설정"/></div>
  <Surface className="absolute left-[68px] top-[640px] flex h-[124px] w-[1010px] items-center px-[35px]"><div><h3 className="m-0 text-[20px] font-medium">보호자 고위험 거래 알림</h3><p className="mb-0 mt-[12px] text-[20px] text-[#6b6b6b]">등록된 보호자에게 위험 거래를 알려요.</p></div><div className="ml-auto mr-[28px]"><NotificationToggle/></div></Surface>
</AppShell>; }
function Quick({href,title,desc}:{href:string;title:string;desc:string}) { return <Link href={href} className="relative block h-[170px] w-[314px] rounded-[10px] border border-[#d9d9d9] bg-white p-[24px] no-underline"><strong className="text-[20px]">{title}</strong><p className="mt-[14px] text-[20px] text-[#6b6b6b]">{desc}</p><span className="absolute bottom-[18px] right-[28px] text-[28px] text-[#6b6b6b]">›</span></Link>; }
