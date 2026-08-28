// ============================================================
// 위험도 산정 엔진 (규칙 문서 [4]) + 메인 진입점 judgeRisk()
// base_score = Σ(개별 규칙 가중치)   # R4는 이미 최댓값 1건만 반환
// combo_score = base_score + Σ(combo 보너스)
// total_score = min(100, combo_score)
// C1/C2/C3 발동 시 grade = max(grade, "High")
// ============================================================

import { RISK_CONFIG as CFG } from "./config";
import { evaluateRules, evaluateCombos } from "./rules";
import {
  Transaction,
  UserBaseline,
  JudgeResult,
  RiskLevel,
  RiskRecord,
  RuleHit,
  ComboHit,
} from "./types";

const GRADE_ORDER: RiskLevel[] = ["Low", "Medium", "High"];

function scoreToGrade(score: number): RiskLevel {
  if (score >= CFG.grade.high) return "High";
  if (score >= CFG.grade.medium) return "Medium";
  return "Low";
}

function maxGrade(a: RiskLevel, b: RiskLevel): RiskLevel {
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

/** 대표 근거 한 줄 (RiskRecord.reason). combo 우선, 없으면 최고 가중 규칙 */
function buildReason(hits: RuleHit[], combos: ComboHit[]): string {
  if (combos.length) return combos[0].reason;
  if (!hits.length) return "정상 범위 거래";
  return [...hits].sort((a, b) => b.weight - a.weight)[0].reason;
}

/**
 * 메인 진입점. 백엔드 judgeRisk() 계약:
 *   judgeRisk(transaction, baseline, recentTransactions)
 * recentTransactions는 lib/riskHistory.getTodayTransactions()의 반환값.
 */
export function judgeRisk(
  tx: Transaction,
  baseline: UserBaseline,
  recentTransactions: Transaction[] = []
): JudgeResult {
  const ruleHits = evaluateRules(tx, baseline, recentTransactions);
  const comboHits = evaluateCombos(ruleHits, tx, baseline, recentTransactions);

  const base = ruleHits.reduce((s, h) => s + h.weight, 0);
  const bonus = comboHits.reduce((s, c) => s + c.bonus, 0);
  const score = Math.min(CFG.scoreCap, base + bonus);

  let riskLevel = scoreToGrade(score);
  for (const c of comboHits) {
    if (c.forceGrade) riskLevel = maxGrade(riskLevel, c.forceGrade);
  }

  const guardianAlert = riskLevel === "High" || comboHits.some((c) => c.guardianAlert);
  const holdRecommended = comboHits.some((c) => c.holdRecommended);

  return {
    score,
    riskLevel,
    ruleHits,
    comboHits,
    guardianAlert,
    holdRecommended,
    reason: buildReason(ruleHits, comboHits),
  };
}

/** JudgeResult → 프론트가 소비하는 RiskRecord (내부 score는 버리고 등급만 남김) */
export function toRiskRecord(tx: Transaction, result: JudgeResult): RiskRecord {
  return {
    id: tx.id,
    amount: tx.amount,
    riskLevel: result.riskLevel,
    reason: result.reason,
    triggeredRules: [...result.ruleHits.map((h) => h.id), ...result.comboHits.map((c) => c.id)],
    timestamp: tx.timestamp,
  };
}
