import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-[#d9d9d9] bg-white ${className}`}>{children}</section>;
}

export function Field({ label, select, children, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; select?: SelectHTMLAttributes<HTMLSelectElement>; children?: ReactNode }) {
  return <label className="block text-[20px] font-medium">
    <span className="mb-[10px] block">{label}</span>
    {select ? <select {...select} className="h-[54px] w-full rounded-[6px] border border-[#d9d9d9] bg-white px-[16px] text-[20px] font-normal text-[#6b6b6b] outline-none">{children}</select> :
      <input {...props} className="h-[54px] w-full rounded-[6px] border border-[#d9d9d9] bg-white px-[16px] text-[20px] font-normal text-[#141414] outline-none placeholder:text-[#6b6b6b]" />}
  </label>;
}

export function PrimaryButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`rounded-[8px] bg-[#262626] text-[20px] font-semibold text-white disabled:opacity-60 ${className}`}>{children}</button>;
}

export function RiskBadge({ level }: { level: string }) {
  return <span className="inline-flex h-[34px] min-w-[96px] items-center justify-center rounded-[17px] border border-[#d92e21] bg-[#fff0f0] px-4 text-[20px] font-semibold text-[#d11a1a]">{level}</span>;
}
