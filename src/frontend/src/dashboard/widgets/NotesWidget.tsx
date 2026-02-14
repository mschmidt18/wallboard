interface NotesWidgetProps {
  config: {
    content?: string;
    font_size?: "small" | "medium" | "large";
  };
}

const fontSizeClasses: Record<string, string> = {
  small: "text-d-sm",
  medium: "text-d-base",
  large: "text-d-lg",
};

function renderLine(line: string, index: number) {
  if (line.startsWith("# ")) {
    return (
      <h1 key={index} className="text-d-2xl font-bold mb-1">
        {line.slice(2)}
      </h1>
    );
  }
  if (line.startsWith("## ")) {
    return (
      <h2 key={index} className="text-d-xl font-semibold mb-1">
        {line.slice(3)}
      </h2>
    );
  }
  if (line.startsWith("### ")) {
    return (
      <h3 key={index} className="text-d-lg font-semibold mb-1">
        {line.slice(4)}
      </h3>
    );
  }
  if (line.startsWith("- ")) {
    return (
      <li key={index} className="ml-4 list-disc">
        {line.slice(2)}
      </li>
    );
  }
  if (line.trim() === "") {
    return <div key={index} className="h-2" />;
  }
  return (
    <p key={index} className="mb-1">
      {line}
    </p>
  );
}

export default function NotesWidget({ config }: NotesWidgetProps) {
  const content = config.content || "";
  const fontSize = config.font_size || "medium";
  const sizeClass = fontSizeClasses[fontSize] || fontSizeClasses.medium;
  const lines = content.split("\n");

  return (
    <div className={`h-full overflow-auto p-4 ${sizeClass}`}>
      {lines.map((line, i) => renderLine(line, i))}
    </div>
  );
}
