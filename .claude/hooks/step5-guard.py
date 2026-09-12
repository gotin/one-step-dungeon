#!/usr/bin/env python3
"""Step 5 の「試し方ガイド（動作確認手順）」の抜けを機械的に止める Stop フック。

背景（2026-09-12 ユーザー指摘）＝WORKFLOW.md Step 5 の ② 試し方ガイドは必須なのに、
「データ直しは新機能ではない」という解釈で繰り返し省いていた。文書の直しだけでは
自分の注意力頼みになるため、番人を立てる。

判定：
  - 直前のアシスタント応答が Step 5 の完了報告か？（「コミットメッセージ案」を含むか）
  - その中に確認 URL（localhost:18080）が在るか、または「画面に出る変化なし」と
    明記してあるか
  - どちらも無ければ差し戻す（decision=block）＝報告を続けさせる

安全側の設計：
  - 例外が出たら黙って通す（フックの不具合で作業が止まらないようにする）
  - stop_hook_active が真＝既に一度差し戻している場合は通す（無限ループ防止）
"""
import json
import sys

# 応答が Step 5 の完了報告だと判断する目印
REPORT_MARKERS = ("コミットメッセージ案",)
# 試し方ガイドが在ると判断する目印
GUIDE_MARKERS = ("localhost:18080", "画面に出る変化なし")

REASON = (
    "Step 5 の完了報告に「試し方ガイド（動作確認手順）」が入っていない。"
    "WORKFLOW.md Step 5 ② のとおり、①起動方法（cd outputs/blade-of-lumia && npm run dev）"
    "②対象画面ごとの確認 URL（fromEditor=1 の具体的な URL）③操作手順と「何を見れば正しいと分かるか」"
    "を出すこと。マップデータ・絵の直しも対象＝「新機能ではないから省く」は禁止。"
    "画面に出る変化が本当に無い場合は「画面に出る変化なし」と明記する。"
    "URL を出す前に、配信中のデータが最新かを curl で裏取りすること。"
)


def last_assistant_text(transcript_path):
    """トランスクリプト（JSONL）から直前のアシスタント応答の本文を集めて返す。"""
    text = []
    with open(transcript_path, encoding="utf-8") as fh:
        lines = fh.readlines()
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        msg = rec.get("message") or {}
        role = msg.get("role") or rec.get("type")
        if role != "assistant":
            # ユーザー発言まで遡ったら打ち切る（直前の1応答だけを見る）
            if role == "user" and text:
                break
            continue
        content = msg.get("content")
        if isinstance(content, str):
            text.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text.append(part.get("text") or "")
    return "\n".join(reversed(text))


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("stop_hook_active"):
        return 0
    path = payload.get("transcript_path")
    if not path:
        return 0
    try:
        text = last_assistant_text(path)
    except Exception:
        return 0
    if not any(m in text for m in REPORT_MARKERS):
        return 0
    if any(m in text for m in GUIDE_MARKERS):
        return 0
    json.dump({"decision": "block", "reason": REASON}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
