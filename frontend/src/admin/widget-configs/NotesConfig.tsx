import { useState, useEffect } from "react";

interface Props {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export default function NotesConfig({ config, onChange }: Props) {
  const [content, setContent] = useState<string>(config.content ?? "");
  const [fontSize, setFontSize] = useState<string>(config.font_size ?? "medium");

  useEffect(() => {
    setContent(config.content ?? "");
    setFontSize(config.font_size ?? "medium");
  }, [config]);

  function handleChange(updates: Partial<{ content: string; font_size: string }>) {
    const next = {
      ...config,
      content: updates.content ?? content,
      font_size: updates.font_size ?? fontSize,
    };
    if (updates.content !== undefined) setContent(updates.content);
    if (updates.font_size !== undefined) setFontSize(updates.font_size);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="notes-content" className="block text-sm font-medium text-gray-700 mb-1">
          Content
        </label>
        <textarea
          id="notes-content"
          rows={6}
          value={content}
          onChange={(e) => handleChange({ content: e.target.value })}
          placeholder="Enter your notes here..."
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
        />
      </div>

      <div>
        <label htmlFor="notes-fontsize" className="block text-sm font-medium text-gray-700 mb-1">
          Font Size
        </label>
        <select
          id="notes-fontsize"
          value={fontSize}
          onChange={(e) => handleChange({ font_size: e.target.value })}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
    </div>
  );
}
