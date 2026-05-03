import React from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  FileCode, 
  Terminal, 
  Clock, 
  Eye, 
  Search, 
  Wrench,
  AlertCircle
} from "lucide-react";

interface ContextInteraction {
  tool: string;
  input: any;
  output: any;
  ts: string;
}

const ToolIcon: React.FC<{ tool: string }> = ({ tool }) => {
  switch (tool) {
    case "Read":
    case "ReadFile":
      return <FileCode size={16} />;
    case "Bash":
    case "RunCommand":
      return <Terminal size={16} />;
    case "Search":
    case "Grep":
      return <Search size={16} />;
    case "LS":
    case "Glob":
      return <Eye size={16} />;
    default:
      return <Wrench size={16} />;
  }
};

const ToolInteraction: React.FC<{ interaction: ContextInteraction }> = ({ interaction }) => {
  const { tool, input, output, ts } = interaction;
  const time = new Date(ts).toLocaleTimeString();

  const renderInput = () => {
    if (tool === "Read") {
      return <span className="interaction-target">{input.file_path}</span>;
    }
    if (tool === "Bash") {
      return <code className="interaction-command">{input.command}</code>;
    }
    return <pre className="interaction-json">{JSON.stringify(input, null, 2)}</pre>;
  };

  const renderOutput = () => {
    if (!output) return null;

    if (tool === "Read") {
      const content = output.file?.content || "";
      if (!content) return <div className="interaction-empty">Empty file or could not read.</div>;
      return (
        <div className="interaction-code-block">
          <pre><code>{content}</code></pre>
        </div>
      );
    }

    if (tool === "Bash") {
      const stdout = output.stdout || "";
      const stderr = output.stderr || "";
      if (!stdout && !stderr) return <div className="interaction-empty">No output.</div>;
      return (
        <div className="interaction-terminal-output">
          {stdout && <pre className="stdout">{stdout}</pre>}
          {stderr && <pre className="stderr">{stderr}</pre>}
        </div>
      );
    }

    return (
      <div className="interaction-code-block">
        <pre><code>{JSON.stringify(output, null, 2)}</code></pre>
      </div>
    );
  };

  return (
    <div className="interaction-item">
      <div className="interaction-header">
        <div className="interaction-meta">
          <span className="interaction-icon"><ToolIcon tool={tool} /></span>
          <span className="interaction-tool-name">{tool}</span>
          <span className="interaction-time"><Clock size={12} /> {time}</span>
        </div>
        <div className="interaction-input">
          {renderInput()}
        </div>
      </div>
      <div className="interaction-body">
        {renderOutput()}
      </div>
    </div>
  );
};

export const ContextTimeline: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const { data: context, isLoading, error } = useQuery<ContextInteraction[]>({
    queryKey: ['sessions', sessionId, 'context'],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/context`);
      if (!res.ok) throw new Error("Failed to fetch context");
      return res.json() as Promise<ContextInteraction[]>;
    }
  });

  if (isLoading) return <div className="timeline-loading">Loading context timeline...</div>;
  if (error) return (
    <div className="timeline-error">
      <AlertCircle size={20} />
      <span>Failed to load context.</span>
    </div>
  );

  if (!context?.length) {
    return (
      <div className="empty-state" style={{ padding: "80px" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>~</div>
        <div>No tool interactions recorded for this session.</div>
      </div>
    );
  }

  return (
    <div className="context-timeline">
      {context.map((interaction, i) => (
        <ToolInteraction key={i} interaction={interaction} />
      ))}
    </div>
  );
};
