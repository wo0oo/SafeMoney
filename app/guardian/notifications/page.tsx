import { GuardianRecords } from "@/components/guardian-records";
import { GuardianShell } from "@/components/guardian-shell";

export default function Page() {
  return (
    <GuardianShell title="알림" active="notifications">
      <p className="absolute left-[68px] top-[34px] m-0 text-[20px] text-[#6b6b6b]">
        연결된 가족에게 감지된 위험 금융 활동 알림입니다.
      </p>
      <div className="absolute left-[68px] top-[100px] flex h-[42px] w-[90px] items-center justify-center rounded-[6px] border border-[#d9d9d9] bg-white text-[20px]">
        전체
      </div>
      <GuardianRecords mode="notifications" />
    </GuardianShell>
  );
}
