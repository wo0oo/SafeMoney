"use client";
import { useState } from "react";
export function NotificationToggle({ initial = true }: { initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return <button type="button" role="switch" aria-checked={on} aria-label="고위험 거래 알림" onClick={() => setOn(!on)} className={`relative h-[40px] w-[82px] rounded-[20px] border-0 ${on ? "bg-[#262626]" : "bg-[#d9d9d9]"}`}><span className={`absolute top-[5px] h-[30px] w-[30px] rounded-full bg-white ${on ? "left-[44px]" : "left-[8px]"}`} /></button>;
}
