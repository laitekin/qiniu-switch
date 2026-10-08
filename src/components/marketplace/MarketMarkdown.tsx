import type { ReactNode } from "react";

// Official model descriptions are Markdown. Render their text without enabling HTML.
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function MarketMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const elements: ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      const key = index;
      while (
        ++index < lines.length &&
        !lines[index].trimStart().startsWith("```")
      )
        code.push(lines[index]);
      elements.push(
        <pre
          key={key}
          className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs leading-5"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      elements.push(
        <h4 key={index} className="pt-2 font-semibold">
          {inline(line.replace(/^#{1,6}\s+/, ""))}
        </h4>,
      );
    } else if (/^\s*[-*+]\s/.test(line)) {
      const items: ReactNode[] = [];
      const key = index;
      do {
        items.push(
          <li key={index}>
            {inline(lines[index].replace(/^\s*[-*+]\s+/, ""))}
          </li>,
        );
        index++;
      } while (index < lines.length && /^\s*[-*+]\s/.test(lines[index]));
      index--;
      elements.push(
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items}
        </ul>,
      );
    } else if (
      line.includes("|") &&
      /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")
    ) {
      const cells = (value: string) =>
        value
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim());
      const headings = cells(line);
      const rows: string[][] = [];
      const key = index;
      index += 2;
      while (index < lines.length && lines[index].includes("|"))
        rows.push(cells(lines[index++]));
      index--;
      elements.push(
        <div
          key={key}
          className="overflow-x-auto rounded-lg border border-border-default"
        >
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50">
              <tr>
                {headings.map((heading, cell) => (
                  <th key={cell} className="px-3 py-2 font-medium">
                    {inline(heading)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border-default">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 align-top">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else {
      const paragraph = [line];
      const key = index;
      while (
        index + 1 < lines.length &&
        lines[index + 1].trim() &&
        !/^(#{1,6}\s|\s*[-*+]\s|\s*```)/.test(lines[index + 1]) &&
        !/^\s*\|?\s*:?-{3,}/.test(lines[index + 2] ?? "")
      )
        paragraph.push(lines[++index]);
      elements.push(
        <p key={key} className="whitespace-pre-wrap break-words">
          {inline(paragraph.join("\n"))}
        </p>,
      );
    }
  }
  return <div className="space-y-3 text-sm leading-6">{elements}</div>;
}
