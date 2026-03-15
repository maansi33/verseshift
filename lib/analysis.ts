function averageLineLength(text: string): number {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) return 0;

  const total = lines.reduce((sum, line) => sum + line.length, 0);
  return total / lines.length;
}

function lineCount(text: string): number {
  return text.split("\n").filter((line) => line.trim().length > 0).length;
}

export function analyzePoemShape(
  original: string,
  translated: string,
  language: string
) {
  const warnings: string[] = [];

  const originalAvg = averageLineLength(original);
  const translatedAvg = averageLineLength(translated);

  const originalLines = lineCount(original);
  const translatedLines = lineCount(translated);

  let score = 100;

  if (originalAvg > 0) {
    const changePercent = ((translatedAvg - originalAvg) / originalAvg) * 100;

    if (changePercent > 20) {
      warnings.push(
        `${language} lines are about ${Math.round(changePercent)}% longer than the original.`
      );
      score -= 20;
    }

    if (changePercent < -20) {
      warnings.push(
        `${language} lines are about ${Math.round(Math.abs(changePercent))}% shorter than the original.`
      );
      score -= 20;
    }
  }

  if (originalLines !== translatedLines) {
    warnings.push(
      `Poem shape changed: original has ${originalLines} lines, but ${language} has ${translatedLines}.`
    );
    score -= 20;
  }

  if (language === "Arabic") {
    warnings.push("This language may require right-to-left layout support.");
    score -= 10;
  }

  if (language === "Japanese") {
    warnings.push(
      "Character density and font rendering may affect the poem’s visual rhythm."
    );
    score -= 10;
  }

  if (score < 0) score = 0;

  return { warnings, score };
}