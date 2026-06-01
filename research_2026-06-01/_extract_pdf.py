"""Извлечение текста из PDF Perplexity-результата в markdown."""
import sys
from pathlib import Path
from pypdf import PdfReader

src = Path(r"C:\Users\PC\Downloads\Сделай исследование рынка ПРИЛОЖЕНИЙ И ВЕБ-СЕРВИСО.pdf")
dst = Path(r"e:\Arhiv\projects\MyCash\research_2026-06-01\10_perplexity_result.md")

reader = PdfReader(str(src))
print(f"Pages: {len(reader.pages)}")

parts = ["# Perplexity research result\n",
         f"**Source:** {src.name}\n",
         f"**Pages:** {len(reader.pages)}\n",
         f"**Extracted:** 2026-06-01\n\n",
         "---\n\n"]

for i, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    parts.append(f"\n## --- Page {i} ---\n\n{text}\n")

dst.write_text("".join(parts), encoding="utf-8")
print(f"Wrote: {dst} ({dst.stat().st_size} bytes)")
