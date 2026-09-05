"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup } from "@/lib/client-api";

export function LoginPage({ guardian = false }: { guardian?: boolean }) {
  const router = useRouter();
  const title = guardian ? "보호자 로그인" : "피보호자 로그인";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await login({ username, password, role: guardian ? "guardian" : "senior" });
      router.push(guardian ? "/guardian" : "/elder");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="relative h-[1024px] w-[1440px] bg-[#fafafa]">
    <section className="absolute inset-y-0 left-0 w-[620px] bg-[#f5f5f5]">
      <p className="absolute left-[72px] top-[72px] m-0 text-[34px] font-semibold">safemoney</p>
      <h1 className="absolute left-[72px] top-[382px] m-0 w-[450px] text-[36px] font-semibold">{guardian ? "가족의 금융 안전을 함께 확인하세요" : "금융 거래를 더 안전하게"}</h1>
      <p className="absolute left-[72px] top-[486px] m-0 w-[430px] text-[20px] text-[#6b6b6b]">{guardian ? "연결된 가족의 위험 금융 활동을 확인하고 필요한 알림만 받아보세요." : "거래 전 위험을 확인하고, 필요하면 보호자와 함께 안전을 지켜보세요."}</p>
    </section>
    <section className="absolute left-[760px] top-[190px] w-[440px]">
      <h2 className="m-0 text-[28px] font-semibold">{title}</h2>
      <p className="mt-[8px] text-[20px] text-[#6b6b6b]">{guardian ? "피보호자이신가요?" : "보호자이신가요?"} <Link href={guardian ? "/login/elder" : "/login/guardian"} className="ml-[10px] font-medium text-[#141414]">{guardian ? "피보호자 로그인" : "보호자 로그인"}</Link></p>
      <form onSubmit={submit}>
        <LoginField label="아이디" placeholder="아이디를 입력하세요" value={username} onChange={(e) => setUsername(e.target.value)} />
        <LoginField label="비밀번호" placeholder="비밀번호를 입력하세요" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-[16px] text-[16px] text-[#d11a1a]">{error}</p>}
        <button type="submit" disabled={busy} className="mt-[40px] flex h-[56px] w-[440px] items-center justify-center rounded-[8px] border-0 bg-[#262626] text-[20px] font-semibold text-white disabled:opacity-60">{busy ? "로그인 중" : "로그인"}</button>
      </form>
      <p className="mt-[18px] text-center text-[20px] text-[#6b6b6b]">아이디 찾기　·　비밀번호 찾기</p>
    </section>
  </main>;
}

function LoginField({ label, placeholder, type = "text", value, onChange }: {
  label: string; placeholder: string; type?: string;
  value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return <label className="mt-[40px] block text-[20px] font-medium"><span className="mb-[10px] block">{label}</span><input type={type} placeholder={placeholder} value={value} onChange={onChange} className="h-[52px] w-[440px] rounded-[6px] border border-[#d9d9d9] bg-white px-[16px] text-[20px] outline-none" /></label>;
}

export function SignupPage({ guardian = false }: { guardian?: boolean }) {
  return <main className="relative h-[1024px] w-[1440px] bg-[#fafafa]">
    <section className="absolute inset-y-0 left-0 w-[520px] bg-[#f5f5f5]">
      <p className="absolute left-[64px] top-[64px] m-0 text-[34px] font-semibold">safemoney</p>
      <h1 className="absolute left-[64px] top-[330px] m-0 text-[28px] font-semibold">{guardian ? "보호자 회원가입" : "피보호자 회원가입"}</h1>
      <p className="absolute left-[64px] top-[390px] m-0 w-[390px] text-[20px] leading-normal text-[#6b6b6b]">{guardian ? <>피보호자의 위험 금융 활동을 확인하고<br />필요한 알림을 받아볼 수 있어요.</> : <>내 금융 거래의 위험도를 확인하고<br />보호자와 안전 정보를 연결할 수 있어요.</>}</p>
    </section>
    <SignupForm guardian={guardian} />
  </main>;
}

function SignupForm({ guardian }: { guardian: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!agreed) {
      setError("이용약관 및 개인정보 처리방침에 동의해주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signup({ username, password, name, email, role: guardian ? "guardian" : "senior" });
      router.push(guardian ? "/guardian" : "/elder");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "회원가입에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="absolute left-[650px] top-[72px] w-[690px]">
    <h2 className="m-0 text-[28px] font-semibold">{guardian ? "보호자 회원가입" : "피보호자 회원가입"}</h2>
    <p className="mt-[8px] text-[20px] text-[#6b6b6b]">기본 정보를 입력해주세요.</p>
    <div className="mt-[38px] grid grid-cols-2 gap-x-[30px] gap-y-[16px]">
      <SignupField label="이름" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
      <SignupField label="이메일 주소" placeholder="example@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="col-span-2"><SignupField label="아이디" placeholder="사용할 아이디" wide value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <SignupField label="비밀번호" placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <SignupField label="비밀번호 확인" placeholder="••••••••" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
    </div>
    <label className="mt-[32px] flex items-center gap-[16px] text-[20px]"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-[26px] w-[26px]" />이용약관 및 개인정보 처리방침에 동의합니다.</label>
    {error && <p className="mt-[16px] text-[16px] text-[#d11a1a]">{error}</p>}
    <button type="submit" disabled={busy} className="mt-[54px] h-[60px] w-[690px] rounded-[8px] border-0 bg-[#262626] text-[20px] font-semibold text-white disabled:opacity-60">{busy ? "가입 중" : "가입하기"}</button>
    <p className="mt-[22px] text-center text-[20px] font-medium text-[#6b6b6b]">이미 계정이 있으신가요?　<Link href={guardian ? "/login/guardian" : "/login/elder"}>로그인</Link></p>
  </form>;
}

function SignupField({ label, placeholder, type = "text", wide = false, value, onChange }: {
  label: string; placeholder: string; type?: string; wide?: boolean;
  value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return <label className="block text-[20px] font-medium"><span className="mb-[10px] block">{label}</span><input type={type} placeholder={placeholder} value={value} onChange={onChange} className={`h-[58px] rounded-[7px] border border-[#d9d9d9] bg-white px-[16px] text-[20px] outline-none ${wide ? "w-[690px]" : "w-[330px]"}`} /></label>;
}
