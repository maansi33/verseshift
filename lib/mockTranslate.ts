export function mockTranslate(poem: string) {
  return [
    {
      language: "English",
      text: poem,
    },
    {
      language: "German",
      text: poem
        .split("\n")
        .map((line) => (line.trim() ? `${line} erweitertetext` : line))
        .join("\n"),
    },
    {
      language: "Arabic",
      text: poem
        .split("\n")
        .map((line) => (line.trim() ? `ترجمة ${line}` : line))
        .join("\n"),
    },
    {
      language: "Japanese",
      text: poem
        .split("\n")
        .map((line) => (line.trim() ? `翻訳 ${line}` : line))
        .join("\n"),
    },
  ];
}